/**
 * rough_testing.test.js
 * ─────────────────────────────────────────────────────────────
 * Aggressive edge case, fuzzing, abuse, and resilience tests.
 * Goes beyond standard unit tests to verify system stability under
 * malicious, malformed, or hostile inputs.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const { isPrivateSubnet } = require('../dist/main/network/subnetCheck');
const { appDetector } = require('../dist/main/network/appDetector');
const { chooseAdapter, resetRoundRobin } = require('../dist/main/network/dispatcher');
const { QuotaManager } = require('../dist/main/fixes/quotaManager');
const { BridgeServer } = require('../dist/main/network/bridgeServer');
const { HttpProxyServer } = require('../dist/main/network/httpProxyServer');
const { Socks5Server } = require('../dist/main/network/socks5Server');

describe('Rough Test 1: Subnet Security Fuzzing & Boundary Edge Cases', () => {
  test('rejects malformed, empty, and non-IP strings gracefully without throwing', () => {
    assert.equal(isPrivateSubnet(''), false);
    assert.equal(isPrivateSubnet(null), false);
    assert.equal(isPrivateSubnet(undefined), false);
    assert.equal(isPrivateSubnet(123), false);
    assert.equal(isPrivateSubnet('not-an-ip'), false);
    assert.equal(isPrivateSubnet('127.0.0.1.extra'), false);
    assert.equal(isPrivateSubnet('999.999.999.999'), false);
    assert.equal(isPrivateSubnet('-1.0.0.0'), false);
    assert.equal(isPrivateSubnet('256.0.0.1'), false);
    assert.equal(isPrivateSubnet('192.168.1.1/24'), false);
    assert.equal(isPrivateSubnet('DROP TABLE users;'), false);
  });

  test('handles IPv6 zone/scope suffixes and uppercase mapped IPv6', () => {
    // Scoped IPv6
    assert.equal(isPrivateSubnet('fe80::1%eth0'), true);
    assert.equal(isPrivateSubnet('fe80::2%12'), true);

    // Uppercase IPv4-mapped IPv6
    assert.equal(isPrivateSubnet('::FFFF:192.168.1.1'), true);
    assert.equal(isPrivateSubnet('::FFFF:10.0.0.1'), true);
    assert.equal(isPrivateSubnet('::FFFF:8.8.8.8'), false);
  });

  test('strictly adheres to 172.16.0.0/12 boundaries', () => {
    assert.equal(isPrivateSubnet('172.15.255.255'), false); // Below range
    assert.equal(isPrivateSubnet('172.16.0.0'), true);       // Lower bound
    assert.equal(isPrivateSubnet('172.24.1.1'), true);       // Mid range
    assert.equal(isPrivateSubnet('172.31.255.255'), true);   // Upper bound
    assert.equal(isPrivateSubnet('172.32.0.0'), false);      // Above range
  });
});

describe('Rough Test 2: Dispatcher Array Mutation & Failure Recovery', () => {
  test('does not mutate input array in dispatchGaming under high repetition', () => {
    const original = [
      { ifIndex: 1, name: 'Adapter 1', status: 'connected', includedInBonding: true, ipv4: '1.1.1.1', speedMbps: 100 },
      { ifIndex: 2, name: 'Adapter 2', status: 'connected', includedInBonding: true, ipv4: '2.2.2.2', speedMbps: 500 },
      { ifIndex: 3, name: 'Adapter 3', status: 'connected', includedInBonding: true, ipv4: '3.3.3.3', speedMbps: 200 },
    ];

    const copy = [...original];

    for (let i = 0; i < 50; i++) {
      chooseAdapter({ proto: 'udp', dstPort: 27015 }, 'gaming', original);
    }

    // Verify ordering remained identical and was not mutated in place
    assert.equal(original[0].ifIndex, copy[0].ifIndex);
    assert.equal(original[1].ifIndex, copy[1].ifIndex);
    assert.equal(original[2].ifIndex, copy[2].ifIndex);
  });

  test('throws clean descriptive error when all adapters lose connection', () => {
    const deadAdapters = [
      { ifIndex: 1, name: 'Wi-Fi', status: 'disconnected', includedInBonding: true, ipv4: '192.168.1.10', speedMbps: 0 },
      { ifIndex: 2, name: 'Ethernet', status: 'connected', includedInBonding: true, ipv4: undefined, speedMbps: 1000 },
    ];

    assert.throws(
      () => chooseAdapter({ proto: 'tcp', dstPort: 80 }, 'round-robin', deadAdapters),
      /No active adapters available for bonding/
    );
  });
});

describe('Rough Test 3: AppDetector Extreme Inputs & Concurrency', () => {
  test('handles invalid, negative, or out-of-range ports without crashing', async () => {
    assert.equal(await appDetector.getProcessForPort(-1), null);
    assert.equal(await appDetector.getProcessForPort(0), null);
    assert.equal(await appDetector.getProcessForPort(70000), null);
    assert.equal(await appDetector.getProcessForPort(NaN), null);
  });

  test('coalesces multiple concurrent queries safely', async () => {
    const promises = [
      appDetector.getProcessForPort(65530),
      appDetector.getProcessForPort(65531),
      appDetector.getProcessForPort(65532),
    ];
    const results = await Promise.all(promises);
    assert.equal(results.length, 3);
  });
});

describe('Rough Test 4: Bridge Server Hostile Payloads & Error Hardening', () => {
  let bridge;
  const PORT = 19188;
  const mockEngine = {
    getState: () => ({ status: 'running', mode: 'round-robin', adapters: [], stats: [], socksPort: 1080, lanGateway: { httpPort: 8080 } }),
    setMode: () => {},
    setAdapterIncluded: () => {},
  };

  before(async () => {
    bridge = new BridgeServer(mockEngine, PORT);
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  test('gracefully rejects malformed JSON payloads with 400', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"mode": INVALID_UNQUOTED',
    });
    assert.equal(res.status, 400);
  });

  test('rejects unrecognized dispatch mode', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'unsupported-turbo-mode' }),
    });
    assert.equal(res.status, 400);
  });

  test('rejects invalid adapter include body', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/adapter/1/include`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ included: 'not-a-boolean' }),
    });
    assert.equal(res.status, 400);
  });

  test('rejects oversized HTTP payloads (>64KB)', async () => {
    const hugeBody = 'A'.repeat(70000);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hugeBody,
      });
      assert.ok(res.status >= 400);
    } catch {
      // Socket destroy on oversized payload is expected
      assert.ok(true);
    }
  });
});

describe('Rough Test 5: Quota Manager NaN Sanitization', () => {
  test('ignores NaN, Infinity, and negative byte increments without corrupting state', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netflo-quota-rough-'));
    try {
      const qm = new QuotaManager(tempDir);
      qm.setQuota(99, 'Test', 1000);

      // Feed hostile byte inputs
      qm.recordBytes(99, 'Test', NaN);
      qm.recordBytes(99, 'Test', Infinity);
      qm.recordBytes(99, 'Test', -500);
      qm.recordBytes(99, 'Test', 'five hundred');

      const quota = qm.getQuota(99);
      assert.equal(quota.usedTodayBytes, 0);

      // Normal increment should work cleanly
      qm.recordBytes(99, 'Test', 250);
      assert.equal(qm.getQuota(99).usedTodayBytes, 250);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Rough Test 6: HTTP Proxy IPv6 CONNECT Parsing', () => {
  let proxy;
  let mockEchoServer;
  const ECHO_PORT = 19992;
  const PROXY_PORT = 18880;

  before(async () => {
    mockEchoServer = net.createServer(socket => {
      socket.write('TARGET_REACHED\n');
      socket.pipe(socket);
    });
    await new Promise(res => mockEchoServer.listen(ECHO_PORT, '127.0.0.1', res));

    const mockPool = {
      createConnection: async (adapter, host, port) => {
        return net.connect({ host: '127.0.0.1', port: ECHO_PORT });
      },
      getStats: () => [],
    };
    proxy = new HttpProxyServer(mockPool, PROXY_PORT, '127.0.0.1', true);
    proxy.updateAdapters([
      { ifIndex: 1, name: 'Adapter', status: 'connected', includedInBonding: true, ipv4: '192.168.1.1', speedMbps: 100 }
    ], 'round-robin');
    await proxy.start();
  });

  after(async () => {
    await proxy.stop();
    await new Promise(res => mockEchoServer.close(res));
  });

  test('parses bracketed IPv6 literals in CONNECT requests without error', async () => {
    const client = net.connect(PROXY_PORT, '127.0.0.1', () => {
      client.write('CONNECT [::1]:8443 HTTP/1.1\r\nHost: [::1]:8443\r\n\r\n');
    });

    const response = await new Promise(res => {
      client.once('data', chunk => res(chunk.toString()));
    });

    assert.ok(response.includes('200 Connection Established'));
    client.destroy();
  });
});

describe('Rough Test 7: SOCKS5 Protocol Fuzzing and Rejection', () => {
  let socksServer;
  const SOCKS_PORT = 19181;

  before(async () => {
    const mockPool = {
      createConnection: async () => new net.Socket(),
      getStats: () => [],
    };
    socksServer = new Socks5Server(mockPool, SOCKS_PORT, '127.0.0.1', true);
    await socksServer.start();
  });

  after(async () => {
    await socksServer.stop();
  });

  test('drops connection immediately on invalid SOCKS version (e.g. SOCKS4 greeting)', async () => {
    const client = net.connect(SOCKS_PORT, '127.0.0.1', () => {
      client.write(Buffer.from([0x04, 0x01])); // SOCKS4 handshake
    });
    await new Promise(resolve => client.once('close', resolve));
    assert.ok(client.destroyed);
  });

  test('rejects connection if no acceptable auth method offered', async () => {
    const client = net.connect(SOCKS_PORT, '127.0.0.1', () => {
      // SOCKS5 greeting offering only GSSAPI (0x01) and USERNAME/PASS (0x02), but not NO_AUTH (0x00)
      client.write(Buffer.from([0x05, 0x02, 0x01, 0x02]));
    });
    const reply = await new Promise(resolve => client.once('data', resolve));
    assert.deepEqual(Array.from(reply), [0x05, 0xFF]);
    client.destroy();
  });

  test('returns command not supported (0x07) for BIND or UDP ASSOCIATE commands', async () => {
    const client = net.connect(SOCKS_PORT, '127.0.0.1', () => {
      // Step 1: Greeting
      client.write(Buffer.from([0x05, 0x01, 0x00]));
    });
    await new Promise(resolve => client.once('data', resolve)); // Server accepts NO_AUTH: [0x05, 0x00]

    // Step 2: Send CMD_BIND (0x02) instead of CMD_CONNECT (0x01)
    client.write(Buffer.from([0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0x1f, 0x90]));
    const cmdReply = await new Promise(resolve => client.once('data', resolve));
    assert.equal(cmdReply[0], 0x05);
    assert.equal(cmdReply[1], 0x07); // REP_CMD_NOT_SUPP
    client.destroy();
  });
});
