/**
 * engine.ts
 * ─────────────────────────────────────────────────────────────
 * NetFlo Engine — the central orchestrator.
 *
 * Responsibilities:
 *   - Discover and monitor network adapters
 *   - Apply system fixes (WCM, USB metric) on startup
 *   - Manage the connection pool and SOCKS5 proxy server
 *   - Emit real-time state and stats to the renderer via IPC
 *   - Handle start/stop lifecycle
 */

import { EventEmitter } from 'events';
import { BrowserWindow, powerMonitor } from 'electron';
import { getAdapters, detectKillerServices } from './network/interfaces';
import { ConnectionPool } from './network/connectionPool';
import { Socks5Server } from './network/socks5Server';
import { pingAllAdapters } from './network/pinger';
import { applyWcmFix } from './fixes/wcmFix';
import { fixUsbTetherMetrics } from './fixes/metricFix';
import { detectKillerSuite } from './fixes/killerDetect';
import { resetRoundRobin } from './network/dispatcher';
import { enableSystemProxy, disableSystemProxy, isSystemProxyEnabled } from './network/systemProxy';
import { WintunAdapter } from './network/wintun';
import { QuotaManager } from './fixes/quotaManager';
import type {
  NetFloState,
  NetworkAdapter,
  AdapterStats,
  DispatchMode,
  AdapterQuota,
} from '../shared/types';
import { IPC } from '../shared/types';

const SOCKS5_PORT = 1080;
const ADAPTER_POLL_INTERVAL_NORMAL_MS = 3000;
const STATS_PUSH_INTERVAL_NORMAL_MS = 500;
const PING_INTERVAL_NORMAL_MS = 10_000;

const ADAPTER_POLL_INTERVAL_POWERSAVE_MS = 6000;
const STATS_PUSH_INTERVAL_POWERSAVE_MS = 1500;
const PING_INTERVAL_POWERSAVE_MS = 30_000;

export class NetFloEngine extends EventEmitter {
  private pool: ConnectionPool;
  private socksServer: Socks5Server;
  private wintun: WintunAdapter | null = null;
  private mainWindow: BrowserWindow | null = null;
  private quotaManager: QuotaManager;

  private state: NetFloState;
  private adapterPollTimer: NodeJS.Timeout | null = null;
  private statsPushTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.quotaManager = new QuotaManager();
    this.pool = new ConnectionPool();
    this.socksServer = new Socks5Server(this.pool, SOCKS5_PORT);

    this.state = {
      status: 'stopped',
      mode: 'round-robin',
      adapters: [],
      stats: [],
      socksPort: SOCKS5_PORT,
      wcmFixApplied: false,
      killerWarning: false,
      killerServices: [],
      systemProxyActive: false,
      wintunActive: false,
      quotas: this.quotaManager.getQuotas(),
      meetingShieldActive: true,
      protectedMeetingCount: 0,
      powerSaveMode: false,
    };

    this.socksServer.on('log', (msg: string) => this.log(msg));
    this.socksServer.on('meeting-protected', () => {
      this.state.protectedMeetingCount++;
      this.pushState();
    });

    // Wire quota tracking to connection pool byte counts
    this.pool.setOnBytesTransferred((ifIndex, adapterName, deltaBytes) => {
      const res = this.quotaManager.recordBytes(ifIndex, adapterName, deltaBytes);
      if (res.action === 'disconnect') {
        this.setAdapterIncluded(ifIndex, false);
        this.log(`[Quota Guard] 🛑 Adapter "${adapterName}" reached daily quota cap! Automatically disconnected from bonding.`);
      } else if (res.warning) {
        this.log(`[Quota Guard] ⚠️ Adapter "${adapterName}" reached 80% of daily data quota limit.`);
      }
    });

    this.quotaManager.on('quota-updated', () => {
      this.state.quotas = this.quotaManager.getQuotas();
      this.pushState();
    });

    // Detect initial battery status and subscribe to power change events
    try {
      if (powerMonitor && typeof powerMonitor.isOnBatteryPower === 'function') {
        this.state.powerSaveMode = powerMonitor.isOnBatteryPower();
        powerMonitor.on('on-battery', () => this.handlePowerModeChange(true));
        powerMonitor.on('on-ac', () => this.handlePowerModeChange(false));
      }
    } catch {
      // powerMonitor may not be available in headless test environments
    }
  }

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  getState(): NetFloState {

    return { ...this.state };
  }

  // ─── System Fixes ─────────────────────────────────────────

  async applySystemFixes(): Promise<void> {
    this.log('[Engine] Applying system fixes...');

    // 1. WCM fix — disable auto-disconnect of Wi-Fi when USB connects
    const wcmResult = applyWcmFix();
    this.state.wcmFixApplied = wcmResult.success;
    if (wcmResult.success) {
      this.log(wcmResult.alreadySet
        ? '[Engine] WCM fix already applied'
        : '[Engine] WCM fix applied — Wi-Fi will stay up with USB tethering');
    } else {
      this.log(`[Engine] WCM fix failed: ${wcmResult.error}`);
    }

    // 2. Discover adapters
    this.refreshAdapters();

    // 3. Fix USB tethering metrics
    const usbFixResults = fixUsbTetherMetrics(this.state.adapters);
    for (const [name, ok] of usbFixResults) {
      this.log(ok
        ? `[Engine] USB metric fixed for ${name}`
        : `[Engine] USB metric fix failed for ${name}`);
    }

    // 4. Detect Killer suite
    const killer = detectKillerSuite();
    this.state.killerWarning = killer.detected;
    this.state.killerServices = killer.services;
    if (killer.detected) {
      this.log(`[Engine] ⚠️  Killer suite detected: ${killer.services.join(', ')}`);
      this.log(`[Engine] ${killer.recommendation}`);
    }

    this.pushState();
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.status === 'running') return;

    this.state.status = 'starting';
    this.pushState();
    this.log('[Engine] Starting NetFlo...');

    try {
      // Refresh adapters and update pool
      this.refreshAdapters();
      this.pool.updateAdapters(this.state.adapters);
      this.socksServer.updateAdapters(this.state.adapters, this.state.mode);

      // Start SOCKS5 proxy
      await this.socksServer.start();
      this.log(`[Engine] SOCKS5 proxy started on 127.0.0.1:${SOCKS5_PORT}`);

      // Start stats collection
      this.pool.startStatsCollection();

      // Start periodic adapter polling
      this.adapterPollTimer = setInterval(() => this.pollAdapters(), this.getAdapterPollInterval());

      // Start stats push to renderer
      this.statsPushTimer = setInterval(() => this.pushStats(), this.getStatsPushInterval());

      // Start ping measurements
      this.pingTimer = setInterval(() => this.measurePings(), this.getPingInterval());
      this.measurePings(); // immediate first measurement

      this.state.status = 'running';

      // Automatically enable system proxy if user had it active or requested
      if (this.state.systemProxyActive) {
        enableSystemProxy(SOCKS5_PORT);
      }

      this.pushState();
      this.log('[Engine] NetFlo running ✓');

    } catch (e) {
      this.state.status = 'error';
      this.state.errorMessage = String(e);
      this.pushState();
      this.log(`[Engine] Start failed: ${e}`);
    }
  }

  async stop(): Promise<void> {
    if (this.state.status === 'stopped') return;

    this.state.status = 'stopping';
    this.pushState();
    this.log('[Engine] Stopping NetFlo...');

    // Restore Windows system proxy
    if (this.state.systemProxyActive) {
      disableSystemProxy();
    }

    // Stop Wintun if running
    if (this.wintun) {
      this.wintun.stop();
      this.wintun = null;
      this.state.wintunActive = false;
    }

    // Clear timers
    if (this.adapterPollTimer) { clearInterval(this.adapterPollTimer); this.adapterPollTimer = null; }
    if (this.statsPushTimer)   { clearInterval(this.statsPushTimer);   this.statsPushTimer = null; }
    if (this.pingTimer)        { clearInterval(this.pingTimer);         this.pingTimer = null; }

    await this.socksServer.stop();
    this.pool.stopStatsCollection();

    this.state.status = 'stopped';
    this.pushState();
    this.log('[Engine] NetFlo stopped');
  }

  // ─── Mode & Adapter Control ───────────────────────────────

  setMode(mode: DispatchMode): void {
    this.state.mode = mode;
    resetRoundRobin();
    this.socksServer.updateAdapters(this.state.adapters, mode);
    this.pushState();
    this.log(`[Engine] Mode set to ${mode}`);
  }

  setAdapterIncluded(ifIndex: number, included: boolean): void {
    const adapter = this.state.adapters.find(a => a.ifIndex === ifIndex);
    if (!adapter) return;
    adapter.includedInBonding = included;
    this.pool.updateAdapters(this.state.adapters);
    this.socksServer.updateAdapters(this.state.adapters, this.state.mode);
    this.pushState();
    this.log(`[Engine] Adapter ${adapter.name} ${included ? 'included in' : 'excluded from'} bonding`);
  }

  setSystemProxy(enabled: boolean): void {
    this.state.systemProxyActive = enabled;
    if (this.state.status === 'running') {
      if (enabled) {
        enableSystemProxy(SOCKS5_PORT);
        this.log('[Engine] Windows system proxy enabled (HTTP/HTTPS and browser traffic routed to SOCKS5)');
      } else {
        disableSystemProxy();
        this.log('[Engine] Windows system proxy disabled');
      }
    }
    this.pushState();
  }

  setWintun(enabled: boolean): void {
    if (enabled) {
      try {
        if (!this.wintun) {
          this.wintun = new WintunAdapter();
        }
        this.wintun.start();
        this.state.wintunActive = true;
        this.log('[Engine] Wintun virtual adapter "NetFlo" started');
      } catch (e) {
        this.log(`[Engine] Wintun start failed: ${e}`);
        this.state.wintunActive = false;
      }
    } else {
      if (this.wintun) {
        this.wintun.stop();
        this.wintun = null;
      }
      this.state.wintunActive = false;
      this.log('[Engine] Wintun virtual adapter stopped');
    }
    this.pushState();
  }

  // ─── Phase 1 Safeguards (Meeting Shield, Power Saver, Quotas) ──

  setMeetingShield(active: boolean): void {
    this.state.meetingShieldActive = active;
    this.socksServer.setMeetingShield(active);
    this.pushState();
    this.log(`[Meeting Shield] ${active ? '🟢 Enabled — VoIP and conference calls prioritized' : '⚪ Disabled'}`);
  }

  setPowerSave(enabled: boolean): void {
    this.state.powerSaveMode = enabled;
    this.restartTimers();
    this.pushState();
    this.log(`[Engine] Power-Saver mode manually ${enabled ? 'enabled' : 'disabled'}`);
  }

  private handlePowerModeChange(isBattery: boolean): void {
    if (this.state.powerSaveMode === isBattery) return;
    this.state.powerSaveMode = isBattery;
    this.restartTimers();
    this.pushState();
    this.log(isBattery
      ? '[Engine] 🔋 On Battery Power — Power-Saver mode active (reduced polling frequency)'
      : '[Engine] ⚡ On AC Power — High performance mode restored');
  }

  private getAdapterPollInterval(): number {
    return this.state.powerSaveMode
      ? ADAPTER_POLL_INTERVAL_POWERSAVE_MS
      : ADAPTER_POLL_INTERVAL_NORMAL_MS;
  }

  private getStatsPushInterval(): number {
    return this.state.powerSaveMode
      ? STATS_PUSH_INTERVAL_POWERSAVE_MS
      : STATS_PUSH_INTERVAL_NORMAL_MS;
  }

  private getPingInterval(): number {
    return this.state.powerSaveMode
      ? PING_INTERVAL_POWERSAVE_MS
      : PING_INTERVAL_NORMAL_MS;
  }

  private restartTimers(): void {
    if (this.state.status !== 'running') return;

    if (this.adapterPollTimer) clearInterval(this.adapterPollTimer);
    if (this.statsPushTimer)   clearInterval(this.statsPushTimer);
    if (this.pingTimer)        clearInterval(this.pingTimer);

    this.adapterPollTimer = setInterval(() => this.pollAdapters(), this.getAdapterPollInterval());
    this.statsPushTimer   = setInterval(() => this.pushStats(), this.getStatsPushInterval());
    this.pingTimer        = setInterval(() => this.measurePings(), this.getPingInterval());
  }

  setQuota(
    ifIndex: number,
    adapterName: string,
    dailyCapBytes: number | null,
    actionOnExceed: 'disconnect' | 'notify-only' = 'disconnect',
    warningThresholdPercent = 80
  ): AdapterQuota {
    const quota = this.quotaManager.setQuota(
      ifIndex,
      adapterName,
      dailyCapBytes,
      actionOnExceed,
      warningThresholdPercent
    );
    this.state.quotas = this.quotaManager.getQuotas();
    this.pushState();
    const capStr = dailyCapBytes !== null ? `${Math.round(dailyCapBytes / (1024 * 1024))} MB` : 'Unlimited';
    this.log(`[Quota Guard] Set quota for ${adapterName}: ${capStr} (Action: ${actionOnExceed})`);
    return quota;
  }

  resetQuota(ifIndex: number): void {
    this.quotaManager.resetQuota(ifIndex);
    this.state.quotas = this.quotaManager.getQuotas();
    this.pushState();
    this.log(`[Quota Guard] Reset daily usage counter for adapter ${ifIndex}`);
  }

  // ─── Polling ──────────────────────────────────────────────

  private refreshAdapters(): void {
    const fresh = getAdapters();
    // Preserve includedInBonding state from previous poll
    for (const adapter of fresh) {
      const prev = this.state.adapters.find(a => a.ifIndex === adapter.ifIndex);
      if (prev) adapter.includedInBonding = prev.includedInBonding;
    }
    this.state.adapters = fresh;
  }

  private pollAdapters(): void {
    const prev = this.state.adapters.map(a => `${a.ifIndex}:${a.status}`).join(',');
    this.refreshAdapters();
    const curr = this.state.adapters.map(a => `${a.ifIndex}:${a.status}`).join(',');

    if (prev !== curr) {
      // Adapter list changed — reapply fixes and update pool
      fixUsbTetherMetrics(this.state.adapters);
      this.pool.updateAdapters(this.state.adapters);
      this.socksServer.updateAdapters(this.state.adapters, this.state.mode);
      resetRoundRobin();
      this.pushState();
      this.log('[Engine] Adapter change detected — pool updated');
    }
  }

  private async measurePings(): Promise<void> {
    const pings = await pingAllAdapters(this.state.adapters);
    const pingMap = new Map<number, number>();
    for (const [ifIndex, ms] of pings) {
      this.pool.updatePing(ifIndex, ms);
      pingMap.set(ifIndex, ms);
    }
    this.socksServer.updatePings(pingMap);
  }

  // ─── IPC Push Helpers ─────────────────────────────────────

  private pushState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC.STATE_UPDATE, this.state);
  }

  private pushStats(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.state.stats = this.pool.getStats();
    this.mainWindow.webContents.send(IPC.STATS_UPDATE, this.state.stats);
  }

  private log(msg: string): void {
    console.log(msg);
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC.LOG, msg);
  }
}
