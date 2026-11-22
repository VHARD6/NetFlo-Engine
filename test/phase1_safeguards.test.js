const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { QuotaManager } = require('../dist/main/fixes/quotaManager');
const { chooseAdapter, isMeetingTraffic, resetRoundRobin } = require('../dist/main/network/dispatcher');

describe('Phase 1: Smart Metered Quota & Budget Guard', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netflo-quota-test-'));

  test('configures daily quota and tracks byte consumption', () => {
    const qm = new QuotaManager(tmpDir);
    const cap100MB = 100 * 1024 * 1024; // 100 MB

    qm.setQuota(15, 'Cellular 5G', cap100MB, 'disconnect', 80);
    const q = qm.getQuota(15);

    assert.ok(q);
    assert.equal(q.adapterName, 'Cellular 5G');
    assert.equal(q.dailyCapBytes, cap100MB);
    assert.equal(q.usedTodayBytes, 0);
    assert.equal(q.warningTriggered, false);
    assert.equal(q.capExceeded, false);

    // 1. Transfer 50 MB (50% - below threshold)
    let res = qm.recordBytes(15, 'Cellular 5G', 50 * 1024 * 1024);
    assert.equal(res.warning, false);
    assert.equal(res.exceeded, false);
    assert.equal(res.action, undefined);
    assert.equal(qm.getQuota(15).usedTodayBytes, 50 * 1024 * 1024);

    // 2. Transfer 35 MB more (total 85 MB, 85% - triggers 80% warning)
    res = qm.recordBytes(15, 'Cellular 5G', 35 * 1024 * 1024);
    assert.equal(res.warning, true);
    assert.equal(res.exceeded, false);
    assert.equal(qm.getQuota(15).warningTriggered, true);

    // 3. Transfer 20 MB more (total 105 MB, >100% - triggers cap exceed & disconnect)
    res = qm.recordBytes(15, 'Cellular 5G', 20 * 1024 * 1024);
    assert.equal(res.exceeded, true);
    assert.equal(res.action, 'disconnect');
    assert.equal(qm.getQuota(15).capExceeded, true);

    // 4. Further transfers do not re-emit action
    res = qm.recordBytes(15, 'Cellular 5G', 10 * 1024 * 1024);
    assert.equal(res.exceeded, false);
    assert.equal(res.action, undefined);
  });

  test('resets quota counter when resetQuota is invoked', () => {
    const qm = new QuotaManager(tmpDir);
    qm.setQuota(15, 'Cellular 5G', 100 * 1024 * 1024);
    qm.recordBytes(15, 'Cellular 5G', 120 * 1024 * 1024);

    assert.equal(qm.getQuota(15).capExceeded, true);

    qm.resetQuota(15);
    const resetQ = qm.getQuota(15);
    assert.equal(resetQ.usedTodayBytes, 0);
    assert.equal(resetQ.capExceeded, false);
    assert.equal(resetQ.warningTriggered, false);
  });

  test('respects notify-only exceed action', () => {
    const qm = new QuotaManager(tmpDir);
    qm.setQuota(16, 'Wi-Fi Hotspot', 50 * 1024 * 1024, 'notify-only', 80);

    const res = qm.recordBytes(16, 'Wi-Fi Hotspot', 60 * 1024 * 1024);
    assert.equal(res.exceeded, true);
    assert.equal(res.action, undefined); // No disconnect action triggered
  });

  test('persists quota configurations across reloads', () => {
    const qm1 = new QuotaManager(tmpDir);
    qm1.setQuota(20, 'USB Tether', 500 * 1024 * 1024, 'disconnect', 85);
    qm1.saveToDisk();

    const qm2 = new QuotaManager(tmpDir);
    const loaded = qm2.getQuota(20);
    assert.ok(loaded);
    assert.equal(loaded.adapterName, 'USB Tether');
    assert.equal(loaded.dailyCapBytes, 500 * 1024 * 1024);
    assert.equal(loaded.warningThresholdPercent, 85);
  });
});

describe('Phase 1: Zero-Drop Meeting Shield & Dispatcher', () => {
  test('identifies meeting and VoIP traffic by port and domain', () => {
    // Port detection
    assert.equal(isMeetingTraffic({ proto: 'udp', dstHost: '10.0.0.1', dstPort: 3478 }), true);
    assert.equal(isMeetingTraffic({ proto: 'udp', dstHost: '10.0.0.1', dstPort: 5004 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: '10.0.0.1', dstPort: 8801 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: '10.0.0.1', dstPort: 5060 }), true);

    // Domain detection
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'zoom.us', dstPort: 443 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'us04web.zoom.us', dstPort: 443 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'teams.microsoft.com', dstPort: 443 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'gateway.discord.gg', dstPort: 443 }), true);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'meet.google.com', dstPort: 443 }), true);

    // Non-meeting traffic
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'google.com', dstPort: 443 }), false);
    assert.equal(isMeetingTraffic({ proto: 'tcp', dstHost: 'store.steampowered.com', dstPort: 80 }), false);
  });

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
      name: 'USB Tethering',
      alias: 'usb',
      type: 'usb-tether',
      status: 'connected',
      ipv4: '192.168.42.10',
      speedMbps: 150,
      includedInBonding: true,
      killerDetected: false,
    },
  ];

  test('Meeting Shield routes calls to lowest latency adapter', () => {
    const pings = new Map([
      [10, 85], // Wi-Fi has 85ms ping
      [20, 18], // USB Tethering has 18ms ping
    ]);

    const meetingFlow = { proto: 'tcp', dstHost: 'zoom.us', dstPort: 443 };

    // With Meeting Shield enabled:
    const chosen = chooseAdapter(meetingFlow, 'round-robin', mockAdapters, {
      meetingShieldActive: true,
      adapterPings: pings,
    });

    // Must route to adapter 20 (USB tethering, 18ms)
    assert.equal(chosen.ifIndex, 20);
    assert.equal(chosen.name, 'USB Tethering');
  });

  test('Download traffic round-robins across bonded adapters when shield is on', () => {
    resetRoundRobin();
    const downloadFlow = { proto: 'tcp', dstHost: 'cdn.example.com', dstPort: 443 };

    const first = chooseAdapter(downloadFlow, 'round-robin', mockAdapters, {
      meetingShieldActive: true,
    });
    const second = chooseAdapter(downloadFlow, 'round-robin', mockAdapters, {
      meetingShieldActive: true,
    });

    assert.equal(first.ifIndex, 10);
    assert.equal(second.ifIndex, 20);
  });
});
