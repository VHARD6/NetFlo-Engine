const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

// Require compiled main process modules
const { isPrivateSubnet } = require('../dist/main/network/subnetCheck');
const { HttpProxyServer } = require('../dist/main/network/httpProxyServer');
const { BridgeServer } = require('../dist/main/network/bridgeServer');
const { TetherAssistant } = require('../dist/main/fixes/tetherAssistant');

describe('Phase 3: Subnet Whitelist & Security Validation', () => {
  test('accurately identifies RFC 1918 private subnets and loopback', () => {
    // Loopback
    assert.equal(isPrivateSubnet('127.0.0.1'), true);
    assert.equal(isPrivateSubnet('127.10.20.30'), true);
    assert.equal(isPrivateSubnet('::1'), true);

    // 10.0.0.0/8
    assert.equal(isPrivateSubnet('10.0.0.1'), true);
    assert.equal(isPrivateSubnet('10.255.255.254'), true);

    // 172.16.0.0/12
    assert.equal(isPrivateSubnet('172.16.0.1'), true);
    assert.equal(isPrivateSubnet('172.25.100.5'), true);
    assert.equal(isPrivateSubnet('172.31.255.255'), true);
    assert.equal(isPrivateSubnet('172.15.0.1'), false); // outside range
    assert.equal(isPrivateSubnet('172.32.0.1'), false); // outside range

    // 192.168.0.0/16
    assert.equal(isPrivateSubnet('192.168.1.1'), true);
    assert.equal(isPrivateSubnet('192.168.100.50'), true);

    // IPv4-mapped IPv6
    assert.equal(isPrivateSubnet('::ffff:192.168.1.5'), true);
    assert.equal(isPrivateSubnet('::ffff:10.5.5.5'), true);
    assert.equal(isPrivateSubnet('::ffff:8.8.8.8'), false);

    // Public Internet (WAN) IPs
    assert.equal(isPrivateSubnet('8.8.8.8'), false);
    assert.equal(isPrivateSubnet('1.1.1.1'), false);
    assert.equal(isPrivateSubnet('142.250.190.46'), false);
    assert.equal(isPrivateSubnet('203.0.113.195'), false);
  });
});

describe('Phase 3: Phone Tether Assistant & Auto-Optimizer', () => {
  const assistant = new TetherAssistant();

  test('identifies USB and phone tethering adapters by name and type', () => {
    const rndisAdapter = {
      ifIndex: 10,
      name: 'Remote NDIS based Internet Sharing Device',
      alias: 'Ethernet 2',
      type: 'ethernet',
      status: 'connected',
      speedMbps: 425,
      mac: '00:11:22:33:44:55',
      includedInBonding: true,
      killerDetected: false,
    };

    const appleAdapter = {
      ifIndex: 11,
      name: 'Apple Mobile Device Ethernet',
      alias: 'Ethernet 3',
      type: 'ethernet',
      status: 'connected',
      speedMbps: 480,
      mac: '00:11:22:33:44:66',
      includedInBonding: true,
      killerDetected: false,
    };

    const wifiAdapter = {
      ifIndex: 12,
      name: 'Intel(R) Wi-Fi 6 AX200',
      alias: 'Wi-Fi',
      type: 'wifi',
      status: 'connected',
      speedMbps: 866,
      mac: '00:11:22:33:44:77',
      includedInBonding: true,
      killerDetected: false,
    };

    assert.equal(assistant.isTetherAdapter(rndisAdapter), true);
    assert.equal(assistant.isTetherAdapter(appleAdapter), true);
    assert.equal(assistant.isTetherAdapter(wifiAdapter), false);
  });

  test('evaluates adapter transitions and triggers optimization', () => {
    const adapters = [
      {
        ifIndex: 15,
        name: 'Samsung Mobile USB Remote NDIS Network Device',
        alias: 'Ethernet 4',
        type: 'ethernet',
        status: 'connected',
        speedMbps: 425,
        mac: '00:11:22:33:44:88',
        includedInBonding: true,
        killerDetected: false,
      },
    ];

    const state = assistant.evaluateAdapters(adapters);
    assert.equal(state.detected, true);
    assert.equal(state.adapterName, adapters[0].name);
    assert.equal(state.status, 'optimized');
  });
});

describe('Phase 3: LAN Gateway HTTP Proxy & CONNECT Tunneling', () => {
  let proxyServer;
  let mockEchoServer;
  const ECHO_PORT = 19888;
  const PROXY_PORT = 18080;

  before(async () => {
    // Start a mock target echo server
    mockEchoServer = net.createServer(socket => {
      socket.write('HELLO FROM TARGET SERVER\n');
      socket.pipe(socket);
    });
    await new Promise(res => mockEchoServer.listen(ECHO_PORT, '127.0.0.1', res));

    // Mock ConnectionPool
    const mockPool = {
      createConnection: async (adapter, dstHost, dstPort) => {
        return net.connect({ host: dstHost, port: dstPort });
      },
      getStats: () => [],
    };

    proxyServer = new HttpProxyServer(mockPool, PROXY_PORT, '127.0.0.1', true);
    proxyServer.updateAdapters(
      [
        {
          ifIndex: 1,
          name: 'Wi-Fi',
          alias: 'Wi-Fi',
          type: 'wifi',
          status: 'connected',
          ipv4: '192.168.1.50',
          speedMbps: 300,
          mac: '00:00:00:00:00:01',
          includedInBonding: true,
          killerDetected: false,
        },
      ],
      'round-robin'
    );
    await proxyServer.start();
  });

  after(async () => {
    await proxyServer.stop();
    await new Promise(res => mockEchoServer.close(res));
  });

  test('successfully tunnels HTTPS CONNECT requests through proxy', async () => {
    const client = net.connect({ host: '127.0.0.1', port: PROXY_PORT });

    await new Promise(res => client.once('connect', res));

    let accumulated = '';
    const receivedPromise = new Promise(res => {
      client.on('data', chunk => {
        accumulated += chunk.toString();
        if (accumulated.includes('200 Connection Established') && accumulated.includes('HELLO FROM TARGET SERVER')) {
          res(accumulated);
        }
      });
    });

    // Send HTTP CONNECT request
    client.write(`CONNECT 127.0.0.1:${ECHO_PORT} HTTP/1.1\r\nHost: 127.0.0.1:${ECHO_PORT}\r\n\r\n`);

    const result = await receivedPromise;
    assert.ok(result.includes('200 Connection Established'));
    assert.ok(result.includes('HELLO FROM TARGET SERVER'));
    client.destroy();
  });
});

describe('Phase 3: NetFlo Local IPC Bridge API', () => {
  let bridgeServer;
  const BRIDGE_PORT = 19088;

  // Mock NetFloEngine
  const mockEngine = {
    getState: () => ({
      status: 'running',
      mode: 'round-robin',
      socksPort: 1080,
      lanGateway: {
        enabled: true,
        bindHost: '0.0.0.0',
        httpPort: 8080,
        localIp: '192.168.1.100',
        activeClients: 1,
      },
      adapters: [
        {
          ifIndex: 1,
          name: 'Wi-Fi',
          type: 'wifi',
          ipv4: '192.168.1.100',
          speedMbps: 300,
          status: 'connected',
          includedInBonding: true,
        },
        {
          ifIndex: 2,
          name: 'Ethernet',
          type: 'ethernet',
          ipv4: '192.168.2.100',
          speedMbps: 1000,
          status: 'connected',
          includedInBonding: true,
        },
      ],
      stats: [
        { ifIndex: 1, rxBps: 2000000, txBps: 100000, pingMs: 15 },
        { ifIndex: 2, rxBps: 5000000, txBps: 200000, pingMs: 5 },
      ],
    }),
    setMode: (mode) => {
      mockEngine.currentMode = mode;
    },
    setAdapterIncluded: (ifIndex, included) => {
      mockEngine.lastAdapterUpdate = { ifIndex, included };
    },
    currentMode: 'round-robin',
    lastAdapterUpdate: null,
  };

  before(async () => {
    bridgeServer = new BridgeServer(mockEngine, BRIDGE_PORT);
    await bridgeServer.start();
  });

  after(async () => {
    await bridgeServer.stop();
  });

  test('serves health check endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.engine, 'netflo');
  });

  test('serves status endpoint with bonded adapter topology and throughput', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'running');
    assert.equal(data.bondedAdaptersCount, 2);
    assert.equal(data.totalRxBps, 7000000);
    assert.equal(data.adapters.length, 2);
    assert.equal(data.lanGateway.localIp, '192.168.1.100');
  });

  test('handles remote mode updates via POST /api/mode', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'gaming' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(mockEngine.currentMode, 'gaming');
  });

  test('handles adapter inclusion updates via POST /api/adapter/:ifIndex/include', async () => {
    const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/api/adapter/2/include`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ included: false }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.deepEqual(mockEngine.lastAdapterUpdate, { ifIndex: 2, included: false });
  });
});
