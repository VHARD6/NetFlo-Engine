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
import url from 'url';
import { EventEmitter } from 'events';
import type { NetFloEngine } from '../engine';

export class BridgeServer extends EventEmitter {
  private server: http.Server | null = null;
  public readonly port: number;
  private engine: NetFloEngine;
  private clientCount = 0;

  constructor(engine: NetFloEngine, port = 1088) {
    super();
    this.engine = engine;
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

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
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  getClientCount(): number {
    return this.clientCount;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Set CORS headers so local web dashboards and electron apps can query seamlessly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsed = url.parse(req.url || '', true);
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
          res.end(JSON.stringify({ error: 'Invalid mode specified' }));
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
          res.end(JSON.stringify({ error: 'Body must contain { included: boolean }' }));
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
  }

  private readJsonBody(req: http.IncomingMessage, cb: (err: Error | null, body: any) => void): void {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 65536) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw);
        cb(null, parsed);
      } catch (e) {
        cb(e as Error, null);
      }
    });
    req.on('error', err => cb(err, null));
  }
}
