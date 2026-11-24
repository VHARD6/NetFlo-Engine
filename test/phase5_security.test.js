const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { BridgeServer } = require('../dist/main/network/bridgeServer.js');
const { Socks5Server } = require('../dist/main/network/socks5Server.js');
const { HttpProxyServer } = require('../dist/main/network/httpProxyServer.js');

describe('Phase 5: Security Hardening & Vulnerability Remediation', () => {
  const BRIDGE_PORT = 19188;
  const SOCKS_PORT = 19180;
  const HTTP_PROXY_PORT = 19181;

  let bridgeServer;
  let socksServer;
  let httpProxyServer;

  const mockEngine = {
    getState: () => ({
      status: 'running',
      mode: 'round-robin',
      socksPort: 1080,
      lanGateway: {
        enabled: true,
        bindHost: '127.0.0.1',
        httpPort: 8080,
        localIp: '127.0.0.1',
        activeClients: 0,
      },
      adapters: [],
      stats: [],
    }),
    setMode: () => {},
    setAdapterIncluded: () => {},
  };

  const mockPool = {
    createConnection: async (adapter, dstHost, dstPort) => {
      return net.connect({ host: dstHost, port: dstPort });
    },
    getStats: () => [],
  };

  before(async () => {
    bridgeServer = new BridgeServer(mockEngine, BRIDGE_PORT);
    await bridgeServer.start();

    socksServer = new Socks5Server(mockPool, SOCKS_PORT, '127.0.0.1');
    await socksServer.start();

    httpProxyServer = new HttpProxyServer(mockPool, HTTP_PROXY_PORT, '127.0.0.1', true);
    await httpProxyServer.start();
  });

  after(async () => {
    await bridgeServer.stop();
    await socksServer.stop();
    await httpProxyServer.stop();
  });

  test('Bridge Server rejects attacker Host header (DNS Rebinding protection) with 403', async () => {
    const http = require('node:http');
    const statusCode = await new Promise(resolve => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: BRIDGE_PORT,
          path: '/api/status',
          method: 'GET',
          headers: {
            host: 'attacker-controlled-site.com',
          },
        },
        res => {
          resolve(res.statusCode);
        }
      );
      req.end();
    });
    assert.equal(statusCode, 403);
  });

  test('Bridge Server rejects untrusted Origin (Cross-Origin CSRF protection) with 403', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/status`, {
      headers: {
        Origin: 'https://malicious-website.com',
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.includes('Cross-Origin'));
  });

  test('Bridge Server accepts trusted local origin', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/status`, {
      headers: {
        Origin: 'http://localhost:5173',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  test('SOCKS5 Server rejects destination port 0 and malformed addresses with address not supported (0x08)', async () => {
    const client = net.connect({ host: '127.0.0.1', port: SOCKS_PORT });
    await new Promise(r => client.once('connect', r));

    // Greeting: VER=5, NMETHODS=1, METHOD=0 (No Auth)
    client.write(Buffer.from([0x05, 0x01, 0x00]));

    const greetingResponse = await new Promise(r => client.once('data', r));
    assert.deepEqual(greetingResponse, Buffer.from([0x05, 0x00]));

    // Request: VER=5, CMD=1 (CONNECT), RSV=0, ATYP=1 (IPv4: 127.0.0.1), PORT=0 (Invalid)
    client.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0x00, 0x00]));

    const connectResponse = await new Promise(r => client.once('data', r));
    // Byte 1 should be REP = 0x08 (Address type not supported)
    assert.equal(connectResponse[0], 0x05);
    assert.equal(connectResponse[1], 0x08);
    client.destroy();
  });

  test('HTTP Proxy strips CRLF sequences in upgrade requests to prevent HTTP request smuggling', async () => {
    const client = net.connect({ host: '127.0.0.1', port: HTTP_PROXY_PORT });
    await new Promise(r => client.once('connect', r));

    // Inject CRLF in method and path
    const maliciousPayload =
      'GET /path\r\nInjected-Header: evil HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n\r\n';

    client.write(maliciousPayload);

    // Wait for response or socket close
    const response = await new Promise(r => {
      client.once('data', d => r(d.toString()));
      client.once('close', () => r('closed'));
      setTimeout(() => r('timeout'), 1000);
    });

    assert.ok(response === 'closed' || response.includes('400') || response.includes('502'));
    client.destroy();
  });
});
