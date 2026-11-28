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
import type { NetworkAdapter, DispatchMode, AppRule, PortRule, AutoTurboConfig } from '../../shared/types';
import { chooseAdapter, isMeetingTraffic } from './dispatcher';
import { appDetector } from './appDetector';
import { isPrivateSubnet } from './subnetCheck';
import { normalizeHost } from './windowsBinding';

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
const REP_HOST_UNREACH  = 0x04;
const REP_CONN_REFUSED  = 0x05;
const REP_CMD_NOT_SUPP  = 0x07;
const REP_ADDR_NOT_SUPP = 0x08;

export class Socks5Server extends EventEmitter {
  private server: net.Server | null = null;
  public port: number;
  public bindHost: string;
  public allowedSubnetsOnly: boolean;
  private pool: ConnectionPool;
  private adapters: NetworkAdapter[] = [];
  private mode: DispatchMode = 'round-robin';
  private connectionCount = 0;
  private meetingShieldActive = true;
  private adapterPings = new Map<number, number>();
  private appRules: AppRule[] = [];
  private portRules: PortRule[] = [];
  private autoTurbo: AutoTurboConfig = {
    enabled: false,
    active: false,
    highThroughputThresholdBps: 10 * 1024 * 1024,
    highLatencyThresholdMs: 150,
    secondaryAdapterIndex: null,
  };
  private clientSocketCounts = new Map<string, number>();
  private sockets = new Set<net.Socket>();

  constructor(pool: ConnectionPool, port = 1080, bindHost = '127.0.0.1', allowedSubnetsOnly = true) {
    super();
    this.pool = pool;
    this.port = port;
    this.bindHost = bindHost;
    this.allowedSubnetsOnly = allowedSubnetsOnly;
  }

  updateAdapters(adapters: NetworkAdapter[], mode: DispatchMode): void {
    this.adapters = adapters;
    this.mode = mode;
  }

  updateRules(appRules: AppRule[], portRules: PortRule[], autoTurbo: AutoTurboConfig): void {
    this.appRules = appRules;
    this.portRules = portRules;
    this.autoTurbo = autoTurbo;
  }

  setMeetingShield(active: boolean): void {
    this.meetingShieldActive = active;
  }

  updatePings(pings: Map<number, number>): void {
    this.adapterPings = pings;
  }

  getActiveClientCount(): number {
    return this.clientSocketCounts.size;
  }

  async start(port = this.port, bindHost = this.bindHost): Promise<void> {
    if (this.server) {
      await this.stop();
    }
    this.port = port;
    this.bindHost = bindHost;

    return new Promise((resolve, reject) => {
      this.server = net.createServer(socket => this.handleClient(socket));
      this.server.on('connection', socket => {
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
      });

      this.server.once('error', reject);
      this.server.listen(this.port, this.bindHost, () => {
        this.emit('log', `[SOCKS5] Listening on ${this.bindHost}:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.server) return resolve();
      const serverRef = this.server;
      this.server = null;
      this.clientSocketCounts.clear();

      try {
        if (typeof (serverRef as any).closeAllConnections === 'function') {
          (serverRef as any).closeAllConnections();
        }
      } catch {}
      for (const socket of this.sockets) {
        try {
          socket.destroy();
        } catch {}
      }
      this.sockets.clear();

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const timer = setTimeout(done, 500);
      serverRef.close(() => {
        clearTimeout(timer);
        done();
      });
    });
  }

  private async handleClient(client: net.Socket): Promise<void> {
    client.on('error', () => {}); // suppress unhandled errors

    const clientIp = client.remoteAddress ?? '';
    if (this.allowedSubnetsOnly && !isPrivateSubnet(clientIp)) {
      this.emit('log', `[SOCKS5] 🛑 Rejected external connection from ${clientIp}`);
      client.destroy();
      return;
    }

    this.trackClient(client, clientIp);

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
        sendSocksReply(client, reqHeader[0] !== SOCKS5_VERSION ? REP_FAILURE : REP_CMD_NOT_SUPP);
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
        sendSocksReply(client, REP_ADDR_NOT_SUPP);
        client.destroy();
        return;
      }

      dstHost = normalizeHost(dstHost);

      const portBuf = await readBytes(client, 2);
      const dstPort = (portBuf[0] << 8) | portBuf[1];

      if (!dstHost || isNaN(dstPort) || dstPort <= 0 || dstPort > 65535) {
        this.emit('log', `[SOCKS5] Invalid destination address or port: ${dstHost}:${dstPort}`);
        sendSocksReply(client, REP_ADDR_NOT_SUPP);
        client.destroy();
        return;
      }

      // ── Step 4: Detect process, choose adapter and connect ─
      const clientPort = client.remotePort ?? 0;
      client.once('close', () => {
        appDetector.releasePort(clientPort);
      });

      let processName: string | null = null;
      if (this.appRules && this.appRules.some(r => r.enabled)) {
        processName = await appDetector.getProcessForPort(clientPort, this.port);
      }

      const flow = {
        proto: 'tcp' as const,
        dstHost,
        dstPort,
        processName: processName ?? undefined,
      };
      const isMeeting = isMeetingTraffic(flow);

      let adapter: NetworkAdapter;
      try {
        adapter = chooseAdapter(
          flow,
          this.mode,
          this.adapters,
          {
            meetingShieldActive: this.meetingShieldActive,
            adapterPings: this.adapterPings,
            appRules: this.appRules,
            portRules: this.portRules,
            autoTurbo: this.autoTurbo,
          }
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
      if (client.destroyed || !client.writable) {
        remote.destroy();
        return;
      }

      const localAddr = remote.localAddress ?? '0.0.0.0';
      const localPort = remote.localPort ?? 0;
      sendSocksReply(client, REP_SUCCESS, localAddr, localPort);

      // ── Step 6: Pipe data bidirectionally ─────────────────
      this.connectionCount++;
      const tag = processName ? `[${processName}] ` : '';
      if (this.meetingShieldActive && isMeeting) {
        this.emit('meeting-protected');
        this.emit('log',
          `[Meeting Shield] 🟢 Protected ${tag}${dstHost}:${dstPort} via ${adapter.name} (Latency optimized)`
        );
      } else {
        this.emit('log',
          `[SOCKS5] [${this.connectionCount}] ${tag}${dstHost}:${dstPort} → via ${adapter.name}`
        );
      }

      client.setNoDelay(true);
      client.setKeepAlive(true, 15000);
      remote.setNoDelay(true);
      remote.setKeepAlive(true, 15000);

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

  public trackClient(client: net.Socket, clientIp: string): void {
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') return;
    const current = this.clientSocketCounts.get(clientIp) || 0;
    this.clientSocketCounts.set(clientIp, current + 1);
    if (current === 0) {
      this.emit('client-connected', clientIp, this.clientSocketCounts.size);
    }
    client.once('close', () => {
      const remaining = (this.clientSocketCounts.get(clientIp) || 1) - 1;
      if (remaining <= 0) {
        this.clientSocketCounts.delete(clientIp);
        this.emit('client-disconnected', clientIp, this.clientSocketCounts.size);
      } else {
        this.clientSocketCounts.set(clientIp, remaining);
      }
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function readBytes(socket: net.Socket, n: number, timeoutMs = 15000): Promise<Buffer> {
  if (n <= 0) return Promise.resolve(Buffer.alloc(0));

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error(`Timed out waiting for ${n} bytes from client`));
    }, timeoutMs);

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
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
