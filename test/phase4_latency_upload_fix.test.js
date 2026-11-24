const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const { normalizeHost, isLoopback, resolveHostToIpv4, clearDnsCache } = require('../dist/main/network/windowsBinding');
const { HttpProxyServer } = require('../dist/main/network/httpProxyServer');

describe('Phase 4: Low-Latency DNS, NAT64 Unwrapping, and Loopback Safety', () => {
  it('correctly unwraps RFC 6052 NAT64 64:ff9b:: addresses to IPv4', () => {
    // 64:ff9b::a29f:88ea corresponds to 162.159.136.234
    assert.equal(normalizeHost('64:ff9b::a29f:88ea'), '162.159.136.234');
    assert.equal(normalizeHost('64:ff9b::162.159.136.234'), '162.159.136.234');
    // Bracketed format
    assert.equal(normalizeHost('[64:ff9b::a29f:88ea]'), '162.159.136.234');
    // Normal IPv4 untouched
    assert.equal(normalizeHost('192.168.1.1'), '192.168.1.1');
    // Normal hostname untouched
    assert.equal(normalizeHost('gateway.discord.gg'), 'gateway.discord.gg');
  });

  it('correctly identifies loopback addresses to prevent binding to external NIC', () => {
    assert.equal(isLoopback('127.0.0.1'), true);
    assert.equal(isLoopback('127.0.0.2'), true);
    assert.equal(isLoopback('127.10.20.30'), true);
    assert.equal(isLoopback('localhost'), true);
    assert.equal(isLoopback('::1'), true);
    assert.equal(isLoopback('[::1]'), true);
    assert.equal(isLoopback('192.168.1.1'), false);
    assert.equal(isLoopback('gateway.discord.gg'), false);
  });

  it('caches DNS queries to eliminate threadpool queueing on high concurrency', async () => {
    clearDnsCache();
    const t0 = Date.now();
    const ip1 = await resolveHostToIpv4('127.0.0.1');
    assert.equal(ip1, '127.0.0.1');

    // Query hostname twice; second should hit in-memory cache instantly
    const ipA = await resolveHostToIpv4('localhost');
    const t1 = Date.now();
    const ipB = await resolveHostToIpv4('localhost');
    const t2 = Date.now();

    assert.equal(ipA, ipB);
    assert.ok(t2 - t1 <= 5, 'Cached DNS lookup took less than 5ms');
  });
});

describe('Phase 4: HTTP Proxy WebSocket Upgrade (Speedtest Upload Fix)', () => {
  it('successfully handles HTTP Upgrade requests without socket error', async () => {
    // Mock target server that handles upgrade
    const targetServer = http.createServer();
    targetServer.on('upgrade', (req, socket, head) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n\r\n'
      );
      socket.pipe(socket); // echo
    });

    await new Promise(r => targetServer.listen(0, '127.0.0.1', r));
    const targetPort = targetServer.address().port;

    // Create mock pool that returns direct connection
    const mockPool = {
      createConnection: async (adapter, dstHost, dstPort) => {
        return new Promise((resolve, reject) => {
          const s = net.createConnection(dstPort, dstHost, () => resolve(s));
          s.once('error', reject);
        });
      }
    };

    const proxy = new HttpProxyServer(mockPool, 0, '127.0.0.1', true);
    proxy.updateAdapters([
      { ifIndex: 1, name: 'Adapter1', type: 'wifi', status: 'connected', ipv4: '192.168.1.5', includedInBonding: true, speedMbps: 100, mac: '', alias: '', killerDetected: false }
    ], 'round-robin');

    await proxy.start(0, '127.0.0.1');
    const proxyPort = proxy.server.address().port;

    // Test sending Upgrade request through proxy
    const client = net.createConnection(proxyPort, '127.0.0.1', () => {
      client.write(
        `GET /speedtest/upload HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${targetPort}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n\r\n`
      );
    });

    const response = await new Promise(resolve => {
      client.on('data', d => {
        resolve(d.toString());
        client.destroy();
      });
    });

    assert.ok(response.includes('101 Switching Protocols'), 'Received 101 Switching Protocols upgrade reply');

    await proxy.stop();
    await new Promise(r => targetServer.close(r));
  });
});
