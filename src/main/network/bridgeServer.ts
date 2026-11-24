/**
 * bridgeServer.ts
 * ─────────────────────────────────────────────────────────────
 * NetFlo Local IPC Bridge Server.
 *
 * Exposes a lightweight local HTTP REST API on 127.0.0.1:1088 allowing
 * external applications (specifically the NetFlo Download Manager) to
 * detect Engine status, discover bonded adapter topologies, query real-time
 * speeds and latencies, and dynamically balance multi-source transfers.
 */

import http from 'http';
import net from 'net';
import { EventEmitter } from 'events';
import type { NetFloEngine } from '../engine';

export class BridgeServer extends EventEmitter {
  private server: http.Server | null = null;
  public readonly port: number;
  private engine: NetFloEngine;
  private clientCount = 0;
  private sockets = new Set<net.Socket>();

  constructor(engine: NetFloEngine, port = 1088) {
    super();
    this.engine = engine;
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.on('connection', (socket: net.Socket) => {
        this.sockets.add(socket);
        socket.once('close', () => this.sockets.delete(socket));
      });

      this.server.once('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        this.emit('log', `[Bridge Server] Local IPC API listening on 127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise(resolve => {
      if (!this.server) return resolve();
      const serverRef = this.server;
      this.server = null;

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

  getClientCount(): number {
    return this.clientCount;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 1. DNS Rebinding Protection: strictly validate Host header
    const hostHeader = (req.headers.host || '').toLowerCase().trim();
    const isAllowedHost =
      hostHeader === `127.0.0.1:${this.port}` ||
      hostHeader === `localhost:${this.port}` ||
      hostHeader === '127.0.0.1' ||
      hostHeader === 'localhost';

    if (!isAllowedHost) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid Host header (DNS Rebinding protection)' }));
      return;
    }

    // 2. Cross-Origin Protection: reject untrusted external browser origins
    const origin = req.headers.origin;
    if (origin) {
      const isAllowedOrigin =
        origin === 'null' ||
        origin === `http://127.0.0.1:${this.port}` ||
        origin === `http://localhost:${this.port}` ||
        origin === 'http://localhost:5173';

      if (!isAllowedOrigin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Untrusted Cross-Origin access rejected' }));
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const parsed = new URL(req.url || '', 'http://127.0.0.1');
      const pathname = parsed.pathname || '';

      // Route: GET /api/health
      if (req.method === 'GET' && pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', engine: 'netflo' }));
        return;
      }

      // Route: GET /api/status
      if (req.method === 'GET' && pathname === '/api/status') {
        const state = this.engine.getState();
        const bondedAdapters = state.adapters.filter(a => a.includedInBonding && a.status === 'connected');

        let totalRxBps = 0;
        let totalTxBps = 0;
        for (const s of state.stats) {
          totalRxBps += s.rxBps;
          totalTxBps += s.txBps;
        }

        const responsePayload = {
          status: state.status,
          version: '0.1.0',
          mode: state.mode,
          socksPort: state.socksPort,
          httpPort: state.lanGateway.httpPort,
          lanGateway: {
            enabled: state.lanGateway.enabled,
            bindHost: state.lanGateway.bindHost,
            localIp: state.lanGateway.localIp,
            activeClients: state.lanGateway.activeClients,
          },
          bondedAdaptersCount: bondedAdapters.length,
          adapters: state.adapters.map(a => {
            const stat = state.stats.find(s => s.ifIndex === a.ifIndex);
            return {
              ifIndex: a.ifIndex,
              name: a.name,
              type: a.type,
              ipv4: a.ipv4,
              speedMbps: a.speedMbps,
              includedInBonding: a.includedInBonding,
              pingMs: stat?.pingMs ?? 0,
              rxBps: stat?.rxBps ?? 0,
              txBps: stat?.txBps ?? 0,
            };
          }),
          totalRxBps,
          totalTxBps,
        };

        this.clientCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responsePayload, null, 2));
        return;
      }

      // Route: GET /api/adapters
      if (req.method === 'GET' && pathname === '/api/adapters') {
        const state = this.engine.getState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state.adapters, null, 2));
        return;
      }

      // Route: POST /api/mode
      if (req.method === 'POST' && pathname === '/api/mode') {
        this.readJsonBody(req, (err, body) => {
          if (err || !body || !['round-robin', 'failover', 'gaming'].includes(body.mode)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err ? err.message : 'Invalid mode specified' }));
            return;
          }
          this.engine.setMode(body.mode);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, mode: body.mode }));
        });
        return;
      }

      // Route: POST /api/adapter/:ifIndex/include
      const includeMatch = pathname.match(/^\/api\/adapter\/(\d+)\/include$/);
      if (req.method === 'POST' && includeMatch) {
        const ifIndex = parseInt(includeMatch[1], 10);
        this.readJsonBody(req, (err, body) => {
          if (err || typeof body?.included !== 'boolean') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err ? err.message : 'Body must contain { included: boolean }' }));
            return;
          }
          this.engine.setAdapterIncluded(ifIndex, body.included);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ifIndex, included: body.included }));
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', details: String(e) }));
      }
    }
  }

  private readJsonBody(req: http.IncomingMessage, cb: (err: Error | null, body: any) => void): void {
    let raw = '';
    let called = false;
    const done = (err: Error | null, body: any) => {
      if (called) return;
      called = true;
      cb(err, body);
    };

    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 65536) {
        done(new Error('Payload too large'), null);
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = raw.trim() ? JSON.parse(raw) : null;
        done(null, parsed);
      } catch (e) {
        done(e as Error, null);
      }
    });

    req.on('error', err => done(err, null));
  }
}
