/**
 * socks5Server.ts
 * ─────────────────────────────────────────────────────────────
 * A lightweight SOCKS5 proxy server (Phase 1 beta mode).
 *
 * Listens on 127.0.0.1:1080. Applications can be configured
 * to use this proxy (via system settings, Proxifier, or per-app
 * proxy settings) to route traffic through NetFlo's bonded adapters.
 *
 * SOCKS5 protocol overview:
 *   1. Client greeting (auth methods)
 *   2. Server auth method selection (we use NO_AUTH = 0x00)
 *   3. Client CONNECT request (target host + port)
 *   4. Server reply (success/failure)
 *   5. Proxy data transparently between client and remote
 *
 * Each incoming connection is dispatched to an adapter via the
 * ConnectionPool, using the configured DispatchMode.
 */

import net from 'net';
import dns from 'dns/promises';
import { EventEmitter } from 'events';
import type { ConnectionPool } from './connectionPool';
import type { NetworkAdapter, DispatchMode } from '../../shared/types';
import { chooseAdapter } from './dispatcher';

// ─── SOCKS5 Constants ────────────────────────────────────────
const SOCKS5_VERSION    = 0x05;
const METHOD_NO_AUTH    = 0x00;
const METHOD_NO_ACCEPT  = 0xFF;
const CMD_CONNECT       = 0x01;
const ATYP_IPV4         = 0x01;
const ATYP_DOMAINNAME   = 0x03;
const ATYP_IPV6         = 0x04;
const REP_SUCCESS       = 0x00;
const REP_FAILURE       = 0x01;
const REP_CONN_REFUSED  = 0x05;
const REP_HOST_UNREACH  = 0x04;

export class Socks5Server extends EventEmitter {
  private server: net.Server | null = null;
  public readonly port: number;
  private pool: ConnectionPool;
  private adapters: NetworkAdapter[] = [];
  private mode: DispatchMode = 'round-robin';
  private connectionCount = 0;

  constructor(pool: ConnectionPool, port = 1080) {
    super();
    this.pool = pool;
    this.port = port;
  }

  updateAdapters(adapters: NetworkAdapter[], mode: DispatchMode): void {
    this.adapters = adapters;
    this.mode = mode;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer(socket => this.handleClient(socket));

      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        this.emit('log', `[SOCKS5] Listening on 127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private async handleClient(client: net.Socket): Promise<void> {
    client.on('error', () => {}); // suppress unhandled errors

    try {
      // ── Step 1: Greeting ────────────────────────────────
      const greeting = await readBytes(client, 2);
      if (greeting[0] !== SOCKS5_VERSION) {
        client.destroy();
        return;
      }
      const nMethods = greeting[1];
      const methods = await readBytes(client, nMethods);

      if (!methods.includes(METHOD_NO_AUTH)) {
        // We only support no-auth
        client.write(Buffer.from([SOCKS5_VERSION, METHOD_NO_ACCEPT]));
        client.destroy();
        return;
      }

      // ── Step 2: Auth response ────────────────────────────
      client.write(Buffer.from([SOCKS5_VERSION, METHOD_NO_AUTH]));

      // ── Step 3: Request ──────────────────────────────────
      const reqHeader = await readBytes(client, 4);
      if (reqHeader[0] !== SOCKS5_VERSION || reqHeader[1] !== CMD_CONNECT) {
        this.emit('log', `[SOCKS5] Invalid header: ver=${reqHeader[0]}, cmd=${reqHeader[1]}`);
        sendSocksReply(client, REP_FAILURE);
        client.destroy();
        return;
      }

      const atyp = reqHeader[3];
      let dstHost: string;

      if (atyp === ATYP_IPV4) {
        const ipBytes = await readBytes(client, 4);
        dstHost = Array.from(ipBytes).join('.');
      } else if (atyp === ATYP_DOMAINNAME) {
        const lenBuf = await readBytes(client, 1);
        const domainBytes = await readBytes(client, lenBuf[0]);
        dstHost = domainBytes.toString('utf8');
      } else if (atyp === ATYP_IPV6) {
        const ipBytes = await readBytes(client, 16);
        dstHost = formatIPv6(ipBytes);
      } else {
        this.emit('log', `[SOCKS5] Unsupported atyp: ${atyp}`);
        sendSocksReply(client, REP_FAILURE);
        client.destroy();
        return;
      }

      const portBuf = await readBytes(client, 2);
      const dstPort = (portBuf[0] << 8) | portBuf[1];

      // ── Step 4: Choose adapter and connect ───────────────
      let adapter: NetworkAdapter;
      try {
        adapter = chooseAdapter(
          { proto: 'tcp', dstHost, dstPort },
          this.mode,
          this.adapters
        );
      } catch (e) {
        this.emit('log', `[SOCKS5] No adapter available: ${e}`);
        sendSocksReply(client, REP_FAILURE);
        client.destroy();
        return;
      }

      let remote: net.Socket;
      try {
        remote = await this.pool.createConnection(adapter, dstHost, dstPort);
      } catch (e) {
        this.emit('log', `[SOCKS5] createConnection failed: ${e}`);
        const msg = String(e);
        const rep = msg.includes('refused') ? REP_CONN_REFUSED : REP_HOST_UNREACH;
        sendSocksReply(client, rep);
        client.destroy();
        return;
      }

      // ── Step 5: Send success reply ───────────────────────
      const localAddr = remote.localAddress ?? '0.0.0.0';
      const localPort = remote.localPort ?? 0;
      sendSocksReply(client, REP_SUCCESS, localAddr, localPort);

      // ── Step 6: Pipe data bidirectionally ─────────────────
      this.connectionCount++;
      this.emit('log',
        `[SOCKS5] [${this.connectionCount}] ${dstHost}:${dstPort} → via ${adapter.name}`
      );

      remote.on('error', () => client.destroy());
      client.on('error', () => remote.destroy());
      remote.on('close', () => client.destroy());
      client.on('close', () => remote.destroy());

      client.pipe(remote);
      remote.pipe(client);

    } catch (e) {
      this.emit('log', `[SOCKS5] Unexpected error in handleClient: ${e}`);
      client.destroy();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function readBytes(socket: net.Socket, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('readable', onReadable);
      socket.off('error', onError);
      socket.off('close', onClose);
    };

    const tryRead = () => {
      const buf = socket.read(n) as Buffer | null;
      if (buf && buf.length >= n) {
        cleanup();
        resolve(buf.slice(0, n));
        return true;
      }
      return false;
    };

    const onReadable = () => {
      tryRead();
    };

    const onError = (e: Error) => {
      cleanup();
      reject(e);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('Socket closed before all bytes received'));
    };

    if (tryRead()) return;

    socket.on('readable', onReadable);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function sendSocksReply(
  socket: net.Socket,
  rep: number,
  bindAddr = '0.0.0.0',
  bindPort = 0
): void {
  if (socket.destroyed || !socket.writable) return;
  const safeIp = net.isIPv4(bindAddr) ? bindAddr : '0.0.0.0';
  const addrParts = safeIp.split('.').map(Number);
  const reply = Buffer.alloc(10);
  reply[0] = SOCKS5_VERSION;
  reply[1] = rep;
  reply[2] = 0x00; // reserved
  reply[3] = ATYP_IPV4;
  reply[4] = addrParts[0] ?? 0;
  reply[5] = addrParts[1] ?? 0;
  reply[6] = addrParts[2] ?? 0;
  reply[7] = addrParts[3] ?? 0;
  reply[8] = (bindPort >> 8) & 0xff;
  reply[9] = bindPort & 0xff;
  try {
    socket.write(reply);
  } catch {
    // Ignore write errors on disconnected sockets
  }
}

function formatIPv6(bytes: Buffer): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  return groups.join(':');
}
