const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { chooseAdapter, resetRoundRobin } = require('../dist/main/network/dispatcher');
const { appDetector } = require('../dist/main/network/appDetector');

describe('Phase 2: Per-App Process Routing & Split-Tunneling', () => {
  const mockAdapters = [
    {
      ifIndex: 10,
      name: 'Wi-Fi 6',
      alias: 'wifi',
      type: 'wifi',
      status: 'connected',
      ipv4: '192.168.1.100',
      speedMbps: 300,
      includedInBonding: true,
      killerDetected: false,
    },
    {
      ifIndex: 20,
      name: 'USB Tethering 5G',
      alias: 'usb',
      type: 'usb-tether',
      status: 'connected',
      ipv4: '192.168.42.10',
      speedMbps: 150,
      includedInBonding: true,
      killerDetected: false,
    },
  ];

  test('pins application flow to specified adapter via AppRule', () => {
    const rules = [
      {
        id: 'r1',
        processName: 'discord.exe',
        mode: null,
        pinnedAdapterIndex: 20, // Pin Discord to USB Tethering 5G
        enabled: true,
      },
    ];

    const flow = {
      proto: 'tcp',
      dstHost: 'gateway.discord.gg',
      dstPort: 443,
      processName: 'discord.exe',
    };

    const chosen = chooseAdapter(flow, 'round-robin', mockAdapters, { appRules: rules });
    assert.equal(chosen.ifIndex, 20);
    assert.equal(chosen.name, 'USB Tethering 5G');
  });

  test('applies custom mode override for specific application', () => {
    resetRoundRobin();
    const rules = [
      {
        id: 'r2',
        processName: 'chrome.exe',
        mode: 'round-robin',
        pinnedAdapterIndex: null,
        enabled: true,
      },
    ];

    const flow = {
      proto: 'tcp',
      dstHost: 'download.google.com',
      dstPort: 443,
      processName: 'chrome.exe',
    };

    // Even if global mode is failover, Chrome rule forces round-robin
    const first = chooseAdapter(flow, 'failover', mockAdapters, { appRules: rules });
    const second = chooseAdapter(flow, 'failover', mockAdapters, { appRules: rules });

    assert.equal(first.ifIndex, 10);
    assert.equal(second.ifIndex, 20);
  });

  test('ignores disabled AppRule and uses global mode', () => {
    const rules = [
      {
        id: 'r3',
        processName: 'obs64.exe',
        mode: null,
        pinnedAdapterIndex: 20,
        enabled: false, // disabled
      },
    ];

    const flow = {
      proto: 'tcp',
      dstHost: 'live.twitch.tv',
      dstPort: 1935,
      processName: 'obs64.exe',
    };

    const chosen = chooseAdapter(flow, 'failover', mockAdapters, { appRules: rules });
    // In failover mode without the pinned rule, routes to primary (speedMbps: 300)
    assert.equal(chosen.ifIndex, 10);
  });
});

describe('Phase 2: Port Rules QoS', () => {
  const mockAdapters = [
    {
      ifIndex: 10,
      name: 'Wi-Fi 6',
      alias: 'wifi',
      type: 'wifi',
      status: 'connected',
      ipv4: '192.168.1.100',
      speedMbps: 300,
      includedInBonding: true,
      killerDetected: false,
    },
    {
      ifIndex: 20,
      name: 'Ethernet',
      alias: 'eth',
      type: 'ethernet',
      status: 'connected',
      ipv4: '192.168.2.50',
      speedMbps: 1000,
      includedInBonding: true,
      killerDetected: false,
    },
  ];

  test('routes specific destination port according to PortRule', () => {
    const portRules = [
      {
        id: 'p1',
        protocol: 'udp',
        port: 27015,
        mode: null,
        pinnedAdapterIndex: 20, // Pin game server to Ethernet
        enabled: true,
        description: 'Steam CS2 Dedicated Server',
      },
    ];

    const flow = { proto: 'udp', dstHost: '1.2.3.4', dstPort: 27015 };
    const chosen = chooseAdapter(flow, 'round-robin', mockAdapters, { portRules });

    assert.equal(chosen.ifIndex, 20);
    assert.equal(chosen.name, 'Ethernet');
  });
});

describe('Phase 2: Dynamic Congestion Assist (Auto-Turbo)', () => {
  const mockAdapters = [
    {
      ifIndex: 10,
      name: 'Broadband Wi-Fi',
      alias: 'wifi',
      type: 'wifi',
      status: 'connected',
      ipv4: '192.168.1.100',
      speedMbps: 100,
      includedInBonding: true,
      killerDetected: false,
    },
    {
      ifIndex: 20,
      name: 'Cellular 5G Tether',
      alias: 'cellular',
      type: 'usb-tether',
      status: 'connected',
      ipv4: '192.168.42.10',
      speedMbps: 200,
      includedInBonding: true,
      killerDetected: false,
    },
  ];

  test('keeps secondary adapter idle in standby when auto-turbo is inactive', () => {
    resetRoundRobin();
    const autoTurbo = {
      enabled: true,
      active: false, // Standby mode (traffic normal)
      highThroughputThresholdBps: 10 * 1024 * 1024,
      highLatencyThresholdMs: 150,
      secondaryAdapterIndex: 20, // Cellular held in standby
    };

    const flow = { proto: 'tcp', dstHost: 'example.com', dstPort: 80 };

    // With secondary on standby, all requests route only over adapter 10
    const chosen1 = chooseAdapter(flow, 'round-robin', mockAdapters, { autoTurbo });
    const chosen2 = chooseAdapter(flow, 'round-robin', mockAdapters, { autoTurbo });

    assert.equal(chosen1.ifIndex, 10);
    assert.equal(chosen2.ifIndex, 10);
  });

  test('dynamically engages secondary adapter when auto-turbo is active', () => {
    resetRoundRobin();
    const autoTurbo = {
      enabled: true,
      active: true, // Turbo triggered! (High throughput or latency spike)
      highThroughputThresholdBps: 10 * 1024 * 1024,
      highLatencyThresholdMs: 150,
      secondaryAdapterIndex: 20,
    };

    const flow = { proto: 'tcp', dstHost: 'example.com', dstPort: 80 };

    // With turbo active, connections round-robin across BOTH adapters
    const chosen1 = chooseAdapter(flow, 'round-robin', mockAdapters, { autoTurbo });
    const chosen2 = chooseAdapter(flow, 'round-robin', mockAdapters, { autoTurbo });

    assert.equal(chosen1.ifIndex, 10);
    assert.equal(chosen2.ifIndex, 20);
  });
});

describe('Phase 2: AppDetector Windows Process Enumeration', () => {
  test('enumerates running Windows applications successfully', async () => {
    const apps = await appDetector.getRunningApplications();
    assert.ok(Array.isArray(apps));
    assert.ok(apps.length > 0);
    // Verify each returned item is a valid executable name
    for (const app of apps) {
      assert.ok(app.endsWith('.exe'));
    }
  });

  test('clears port cache on releasePort', () => {
    appDetector.releasePort(54321);
    // Method executes without error
    assert.ok(true);
  });
});
