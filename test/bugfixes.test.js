const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { chooseAdapter } = require('../dist/main/network/dispatcher');
const { HttpProxyServer } = require('../dist/main/network/httpProxyServer');
const { Socks5Server } = require('../dist/main/network/socks5Server');
const { revertUsbTetherMetrics } = require('../dist/main/fixes/metricFix');
const { QuotaManager } = require('../dist/main/fixes/quotaManager');

describe('Bug Fix Verifications', () => {
  describe('Bug 1: Gaming Mode Latency (Ping) Prioritization', () => {
    const fastAdapter = {
      ifIndex: 1,
      name: 'Gigabit Fiber',
      speedMbps: 1000,
      status: 'connected',
      includedInBonding: true,
      ipv4: '192.168.1.10',
    };
    const lowPingAdapter = {
      ifIndex: 2,
      name: 'Low-Latency 5G',
      speedMbps: 50,
      status: 'connected',
      includedInBonding: true,
      ipv4: '192.168.2.10',
    };
    const adapters = [fastAdapter, lowPingAdapter];

    test('routes gaming traffic to adapter with lowest ping instead of highest speed', () => {
      const adapterPings = new Map([
        [1, 85], // Fiber has high ping (85ms)
        [2, 12], // 5G has low ping (12ms)
      ]);

      const gamingFlow = {
        proto: 'udp',
        dstHost: '1.2.3.4',
        dstPort: 27015, // Steam / CS2 UDP port
      };

      const selected = chooseAdapter(gamingFlow, 'gaming', adapters, { adapterPings });
      assert.equal(selected.ifIndex, 2, 'Should pick adapter 2 with 12ms ping');
    });

    test('falls back to highest speed if pings are not available or equal', () => {
      const gamingFlow = {
        proto: 'udp',
        dstHost: '1.2.3.4',
        dstPort: 27015,
      };

      const selected = chooseAdapter(gamingFlow, 'gaming', adapters);
      assert.equal(selected.ifIndex, 1, 'Should pick adapter 1 with 1000Mbps speed when pings not provided');
    });
  });

  describe('Bug 2 & 7: Metric Restoration & Synchronous Quota Flush', () => {
    test('revertUsbTetherMetrics is callable with empty or mock adapters', () => {
      assert.equal(typeof revertUsbTetherMetrics, 'function');
      assert.doesNotThrow(() => revertUsbTetherMetrics([]));
    });

    test('QuotaManager.saveToDisk synchronously persists quota state on shutdown', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netflo-quota-flush-'));
      try {
        const qm = new QuotaManager(tempDir);
        qm.setQuota(10, 'Adapter10', 500000);
        qm.recordBytes(10, 'Adapter10', 12345);

        // Immediate flush
        qm.saveToDisk();

        // Verify file exists on disk immediately
        const quotaFilePath = path.join(tempDir, 'quotas.json');
        assert.ok(fs.existsSync(quotaFilePath), 'quotas.json must exist immediately after saveToDisk()');

        const list = JSON.parse(fs.readFileSync(quotaFilePath, 'utf8'));
        const item = list.find(q => q.ifIndex === 10);
        assert.ok(item, 'Item for adapter 10 must exist');
        assert.equal(item.usedTodayBytes, 12345);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Bug 3: Active Client Reference Counting & Disconnect Events', () => {
    test('HttpProxyServer tracks LAN client connection and releases on disconnect', () => {
      const mockPool = {
        createConnection: async () => {},
        getStats: () => [],
      };
      const proxy = new HttpProxyServer(mockPool, 19385, '127.0.0.1', false);

      let connectedEvents = 0;
      let disconnectedEvents = 0;
      let lastCount = 0;

      proxy.on('client-connected', (ip, count) => {
        connectedEvents++;
        lastCount = count;
      });
      proxy.on('client-disconnected', (ip, count) => {
        disconnectedEvents++;
        lastCount = count;
      });

      const fakeSocket1 = new EventEmitter();
      const fakeSocket2 = new EventEmitter();

      // Client from 192.168.1.150 opens socket 1
      proxy.trackClient(fakeSocket1, '192.168.1.150');
      assert.equal(connectedEvents, 1);
      assert.equal(proxy.getActiveClientCount(), 1);

      // Same client opens second concurrent socket (e.g. multi-threaded download)
      proxy.trackClient(fakeSocket2, '192.168.1.150');
      assert.equal(connectedEvents, 1, 'Same client should not trigger additional client-connected event');
      assert.equal(proxy.getActiveClientCount(), 1);

      // Socket 1 closes
      fakeSocket1.emit('close');
      assert.equal(disconnectedEvents, 0, 'Should not emit client-disconnected while socket 2 remains alive');
      assert.equal(proxy.getActiveClientCount(), 1);

      // Socket 2 closes
      fakeSocket2.emit('close');
      assert.equal(disconnectedEvents, 1, 'Should emit client-disconnected once all sockets close');
      assert.equal(proxy.getActiveClientCount(), 0);
    });

    test('Socks5Server tracks LAN client connection and releases on disconnect', () => {
      const mockPool = {
        createConnection: async () => {},
        getStats: () => [],
      };
      const socks = new Socks5Server(mockPool, 19386, '127.0.0.1', false);

      let connectedEvents = 0;
      let disconnectedEvents = 0;

      socks.on('client-connected', () => connectedEvents++);
      socks.on('client-disconnected', () => disconnectedEvents++);

      const fakeSocket = new EventEmitter();
      socks.trackClient(fakeSocket, '192.168.1.200');

      assert.equal(connectedEvents, 1);
      assert.equal(socks.getActiveClientCount(), 1);

      fakeSocket.emit('close');
      assert.equal(disconnectedEvents, 1);
      assert.equal(socks.getActiveClientCount(), 0);
    });
  });
});
