/**
 * httpProxyServer.ts
 * ─────────────────────────────────────────────────────────────
 * HTTP / HTTPS CONNECT Proxy Server for NetFlo.
 *
 * Enables sharing bonded network access with mobile devices (iOS,
 * Android), iPads, laptops, and web browsers via standard HTTP proxy
 * settings without needing custom software.
 *
 * Supports:
 *   1. HTTP CONNECT tunneling (HTTPS, WebSockets, TLS)
 *   2. Plain HTTP request proxying (GET/POST/etc.)
 *   3. LAN subnet whitelist security (rejects unauthorized WAN access)
 *   4. Per-adapter bonding dispatching via ConnectionPool
 */

import http from 'http';
import net from 'net';
import url from 'url';
import { EventEmitter } from 'events';
import type { ConnectionPool } from './connectionPool';
import type { NetworkAdapter, DispatchMode, AppRule, PortRule, AutoTurboConfig } from '../../shared/types';
import { chooseAdapter, isMeetingTraffic } from './dispatcher';
import { isPrivateSubnet } from './subnetCheck';

export class HttpProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  public port: number;
  public bindHost: string;
  public allowedSubnetsOnly: boolean;

  private pool: ConnectionPool;
  private adapters: NetworkAdapter[] = [];
  private mode: DispatchMode = 'round-robin';
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

  private activeClients = new Set<string>();

  constructor(pool: ConnectionPool, port = 8080, bindHost = '127.0.0.1', allowedSubnetsOnly = true) {
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
    return this.activeClients.size;
  }

  async start(port = this.port, bindHost = this.bindHost): Promise<void> {
    if (this.server) {
      await this.stop();
    }

    this.port = port;
    this.bindHost = bindHost;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
      this.server.on('connect', (req, clientSocket, head) =>
        this.handleConnect(req, clientSocket as net.Socket, head)
      );

      this.server.once('error', reject);
      this.server.listen(this.port, this.bindHost, () => {
        this.emit('log', `[HTTP Proxy] Listening on ${this.bindHost}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        this.activeClients.clear();
        resolve();
      });
    });
  }

  /**
   * Handle HTTPS CONNECT tunnels (e.g. CONNECT example.com:443 HTTP/1.1)
   */
  private async handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ): Promise<void> {
    const clientIp = clientSocket.remoteAddress ?? '';

    // Subnet security check
    if (this.allowedSubnetsOnly && !isPrivateSubnet(clientIp)) {
      this.emit('log', `[HTTP Proxy] 🛑 Rejected unauthorized external connection from ${clientIp}`);
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    this.trackClient(clientIp);

    const [dstHost, portStr] = (req.url ?? '').split(':');
    const dstPort = parseInt(portStr ?? '443', 10);

    if (!dstHost) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    const flow = {
      proto: 'tcp' as const,
      dstHost,
      dstPort,
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
      this.emit('log', `[HTTP Proxy] No adapter available for CONNECT ${dstHost}:${dstPort}: ${e}`);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    let remoteSocket: net.Socket;
    try {
      remoteSocket = await this.pool.createConnection(adapter, dstHost, dstPort);
    } catch (e) {
      this.emit('log', `[HTTP Proxy] Connection to ${dstHost}:${dstPort} failed: ${e}`);
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // Acknowledge CONNECT establishment
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    if (head && head.length > 0) {
      remoteSocket.write(head);
    }

    if (this.meetingShieldActive && isMeeting) {
      this.emit('meeting-protected');
      this.emit('log', `[Meeting Shield] 🟢 Protected HTTP CONNECT ${dstHost}:${dstPort} via ${adapter.name}`);
    } else {
      this.emit('log', `[HTTP Proxy] CONNECT ${dstHost}:${dstPort} → via ${adapter.name}`);
    }

    // Bidirectional pipe
    clientSocket.pipe(remoteSocket);
    remoteSocket.pipe(clientSocket);

    clientSocket.on('error', () => remoteSocket.destroy());
    remoteSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('close', () => remoteSocket.destroy());
    remoteSocket.on('close', () => clientSocket.destroy());
  }

  /**
   * Handle plain HTTP GET/POST proxy requests (e.g. GET http://example.com/ HTTP/1.1)
   */
  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const clientIp = req.socket.remoteAddress ?? '';

    // Subnet security check
    if (this.allowedSubnetsOnly && !isPrivateSubnet(clientIp)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: External IP not permitted by NetFlo LAN Gateway.');
      return;
    }

    this.trackClient(clientIp);

    if (!req.url) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const parsed = url.parse(req.url);
    const dstHost = parsed.hostname;
    const dstPort = parseInt(parsed.port ?? '80', 10);

    if (!dstHost) {
      res.writeHead(400);
      res.end('Missing destination host');
      return;
    }

    const flow = {
      proto: 'tcp' as const,
      dstHost,
      dstPort,
    };

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
    } catch {
      res.writeHead(502);
      res.end('No bonded adapter available');
      return;
    }

    let remoteSocket: net.Socket;
    try {
      remoteSocket = await this.pool.createConnection(adapter, dstHost, dstPort);
    } catch {
      res.writeHead(504);
      res.end('Gateway Timeout');
      return;
    }

    // Reconstruct outgoing HTTP request line & headers
    const outgoingPath = parsed.path || '/';
    let headersText = `${req.method} ${outgoingPath} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'proxy-connection') continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          headersText += `${key}: ${v}\r\n`;
        }
      } else if (value !== undefined) {
        headersText += `${key}: ${value}\r\n`;
      }
    }
    headersText += '\r\n';

    remoteSocket.write(headersText);

    // Forward request payload if any
    req.pipe(remoteSocket);

    // Write remote response back to client socket
    remoteSocket.on('data', chunk => {
      if (!res.writableEnded) {
        res.socket?.write(chunk);
      }
    });

    remoteSocket.on('end', () => {
      res.end();
    });

    remoteSocket.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Bad Gateway');
      }
    });
  }

  private trackClient(clientIp: string): void {
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') return;
    if (!this.activeClients.has(clientIp)) {
      this.activeClients.add(clientIp);
      this.emit('client-connected', clientIp, this.activeClients.size);
      this.emit('log', `[LAN Gateway] 📱 Mobile/LAN device connected from ${clientIp}`);
    }
  }
}
