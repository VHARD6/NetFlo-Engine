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
  private sockets = new Set<net.Socket>();

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
      this.server.on('connection', (socket: net.Socket) => {
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
      });
      this.server.on('connect', (req, clientSocket, head) =>
        this.handleConnect(req, clientSocket as net.Socket, head)
      );
      this.server.on('upgrade', (req, clientSocket, head) =>
        this.handleUpgrade(req, clientSocket as net.Socket, head)
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
      const serverRef = this.server;
      this.server = null;
      this.activeClients.clear();

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

    // Parse destination host and port (handles IPv4, hostnames, and bracketed IPv6 literals like [::1]:443)
    let dstHost = '';
    let dstPort = 443;
    const rawUrl = req.url || '';
    if (rawUrl.startsWith('[')) {
      const closingBracket = rawUrl.indexOf(']');
      if (closingBracket !== -1) {
        dstHost = rawUrl.substring(1, closingBracket);
        const portPart = rawUrl.substring(closingBracket + 2);
        dstPort = parseInt(portPart || '443', 10);
      }
    } else {
      const parts = rawUrl.split(':');
      dstHost = parts[0] || '';
      dstPort = parseInt(parts[1] || '443', 10);
    }

    if (isNaN(dstPort) || dstPort <= 0 || dstPort > 65535) {
      dstPort = 443;
    }

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

    // Guard against client abort while connection was being established
    if (clientSocket.destroyed || !clientSocket.writable) {
      remoteSocket.destroy();
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

    clientSocket.setNoDelay(true);
    clientSocket.setKeepAlive(true, 15000);
    remoteSocket.setNoDelay(true);
    remoteSocket.setKeepAlive(true, 15000);

    // Bidirectional pipe
    clientSocket.pipe(remoteSocket);
    remoteSocket.pipe(clientSocket);

    clientSocket.on('error', () => remoteSocket.destroy());
    remoteSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('close', () => remoteSocket.destroy());
    remoteSocket.on('close', () => clientSocket.destroy());
  }

  /**
   * Handle plain HTTP WebSocket upgrade tunnels (e.g. Speedtest ws:// upload)
   */
  private async handleUpgrade(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ): Promise<void> {
    const clientIp = clientSocket.remoteAddress ?? '';

    // Subnet security check
    if (this.allowedSubnetsOnly && !isPrivateSubnet(clientIp)) {
      this.emit('log', `[HTTP Proxy] 🛑 Rejected unauthorized external upgrade from ${clientIp}`);
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    this.trackClient(clientIp);

    let dstHost = '';
    let dstPort = 80;

    if (req.url && req.url.startsWith('http')) {
      try {
        const u = new URL(req.url);
        dstHost = u.hostname;
        dstPort = parseInt(u.port || (u.protocol === 'https:' ? '443' : '80'), 10);
      } catch {}
    }

    if (!dstHost && req.headers.host) {
      const parts = req.headers.host.split(':');
      dstHost = parts[0] || '';
      dstPort = parseInt(parts[1] || '80', 10);
    }

    if (isNaN(dstPort) || dstPort <= 0 || dstPort > 65535) {
      dstPort = 80;
    }

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
      this.emit('log', `[HTTP Proxy] No adapter available for Upgrade ${dstHost}:${dstPort}: ${e}`);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    let remoteSocket: net.Socket;
    try {
      remoteSocket = await this.pool.createConnection(adapter, dstHost, dstPort);
    } catch (e) {
      this.emit('log', `[HTTP Proxy] Upgrade connection to ${dstHost}:${dstPort} failed: ${e}`);
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (clientSocket.destroyed || !clientSocket.writable) {
      remoteSocket.destroy();
      return;
    }

    // Reconstruct HTTP upgrade request to remote
    const rawPath = req.url?.startsWith('http')
      ? new URL(req.url).pathname + (new URL(req.url).search || '')
      : (req.url || '/');
    let requestText = `${req.method || 'GET'} ${rawPath} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'proxy-connection') continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          requestText += `${key}: ${v}\r\n`;
        }
      } else if (value !== undefined) {
        requestText += `${key}: ${value}\r\n`;
      }
    }
    requestText += '\r\n';

    remoteSocket.write(requestText);
    if (head && head.length > 0) {
      remoteSocket.write(head);
    }

    if (this.meetingShieldActive && isMeeting) {
      this.emit('meeting-protected');
      this.emit('log', `[Meeting Shield] 🟢 Protected HTTP Upgrade ${dstHost}:${dstPort} via ${adapter.name}`);
    } else {
      this.emit('log', `[HTTP Proxy] Upgrade ${dstHost}:${dstPort} → via ${adapter.name}`);
    }

    clientSocket.setNoDelay(true);
    clientSocket.setKeepAlive(true, 15000);
    remoteSocket.setNoDelay(true);
    remoteSocket.setKeepAlive(true, 15000);

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
    let dstPort = parseInt(parsed.port ?? '80', 10);
    if (isNaN(dstPort) || dstPort <= 0 || dstPort > 65535) dstPort = 80;

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
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('No bonded adapter available');
      return;
    }

    const outgoingPath = parsed.path || '/';
    const sanitizedHeaders: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.toLowerCase() === 'proxy-connection') continue;
      if (value !== undefined) {
        sanitizedHeaders[key] = value;
      }
    }
    if (dstPort !== 80 && dstPort !== 443) {
      sanitizedHeaders['host'] = `${dstHost}:${dstPort}`;
    } else {
      sanitizedHeaders['host'] = dstHost;
    }

    try {
      const forwardReq = http.request({
        hostname: dstHost,
        port: dstPort,
        path: outgoingPath,
        method: req.method,
        headers: sanitizedHeaders,
        createConnection: (_opts, cb) => {
          this.pool
            .createConnection(adapter, dstHost, dstPort)
            .then(sock => {
              sock.setNoDelay(true);
              cb(null, sock);
            })
            .catch(err => cb(err, undefined as any));
          return undefined as any;
        },
      }, remoteRes => {
        res.writeHead(remoteRes.statusCode || 200, remoteRes.headers);
        remoteRes.pipe(res);
        remoteRes.on('error', () => res.destroy());
      });

      forwardReq.on('error', err => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Bad Gateway: ${err.message}`);
        }
      });

      req.on('error', () => forwardReq.destroy());
      res.on('error', () => forwardReq.destroy());
      res.on('close', () => {
        if (!res.writableEnded) {
          forwardReq.destroy();
        }
      });

      if (req.method === 'GET' || req.method === 'HEAD') {
        forwardReq.end();
      } else {
        req.pipe(forwardReq);
      }
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Internal Proxy Error: ${e}`);
      }
    }
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
