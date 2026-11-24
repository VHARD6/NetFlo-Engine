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
import os from 'os';
import { BrowserWindow, powerMonitor } from 'electron';
import { getAdapters, detectKillerServices } from './network/interfaces';
import { ConnectionPool } from './network/connectionPool';
import { Socks5Server } from './network/socks5Server';
import { HttpProxyServer } from './network/httpProxyServer';
import { BridgeServer } from './network/bridgeServer';
import { pingAllAdapters } from './network/pinger';
import { applyWcmFix } from './fixes/wcmFix';
import { fixUsbTetherMetrics } from './fixes/metricFix';
import { detectKillerSuite } from './fixes/killerDetect';
import { tetherAssistant } from './fixes/tetherAssistant';
import { resetRoundRobin } from './network/dispatcher';
import { enableSystemProxy, disableSystemProxy, isSystemProxyEnabled } from './network/systemProxy';
import { WintunAdapter } from './network/wintun';
import { QuotaManager } from './fixes/quotaManager';
import { appDetector } from './network/appDetector';
import type {
  NetFloState,
  NetworkAdapter,
  AdapterStats,
  DispatchMode,
  AdapterQuota,
  AppRule,
  PortRule,
  AutoTurboConfig,
  LanGatewayConfig,
  TetherAssistantState,
} from '../shared/types';
import { IPC } from '../shared/types';

const SOCKS5_PORT = 1080;
const HTTP_PROXY_PORT = 8080;
const BRIDGE_PORT = 1088;
const ADAPTER_POLL_INTERVAL_NORMAL_MS = 3000;
const STATS_PUSH_INTERVAL_NORMAL_MS = 500;
const PING_INTERVAL_NORMAL_MS = 10_000;

const ADAPTER_POLL_INTERVAL_POWERSAVE_MS = 6000;
const STATS_PUSH_INTERVAL_POWERSAVE_MS = 1500;
const PING_INTERVAL_POWERSAVE_MS = 30_000;

function getPrimaryLocalIp(adapters: NetworkAdapter[]): string {
  for (const a of adapters) {
    if (a.status === 'connected' && a.ipv4 && !a.ipv4.startsWith('127.')) {
      return a.ipv4;
    }
  }
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

export class NetFloEngine extends EventEmitter {
  private pool: ConnectionPool;
  private socksServer: Socks5Server;
  private httpProxyServer: HttpProxyServer;
  private bridgeServer: BridgeServer;
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
    this.socksServer = new Socks5Server(this.pool, SOCKS5_PORT, '127.0.0.1', true);
    this.httpProxyServer = new HttpProxyServer(this.pool, HTTP_PROXY_PORT, '127.0.0.1', true);
    this.bridgeServer = new BridgeServer(this, BRIDGE_PORT);

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
      appRules: [
        { id: 'discord', processName: 'discord.exe', mode: 'gaming', pinnedAdapterIndex: null, enabled: true },
        { id: 'steam', processName: 'steam.exe', mode: 'round-robin', pinnedAdapterIndex: null, enabled: true },
        { id: 'obs', processName: 'obs64.exe', mode: 'failover', pinnedAdapterIndex: null, enabled: false },
      ],
      portRules: [],
      autoTurbo: {
        enabled: false,
        active: false,
        highThroughputThresholdBps: 2 * 1024 * 1024,
        highLatencyThresholdMs: 150,
        secondaryAdapterIndex: null,
      },
      lanGateway: {
        enabled: false,
        bindHost: '127.0.0.1',
        socksPort: SOCKS5_PORT,
        httpPort: HTTP_PROXY_PORT,
        allowedSubnetsOnly: true,
        localIp: '127.0.0.1',
        activeClients: 0,
      },
      tetherAssistant: {
        detected: false,
        status: 'idle',
        wcmProtected: false,
      },
      bridge: {
        enabled: true,
        port: BRIDGE_PORT,
        connectedClients: 0,
      },
    };

    this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);

    this.socksServer.on('log', (msg: string) => this.log(msg));
    this.socksServer.on('meeting-protected', () => {
      this.state.protectedMeetingCount++;
      this.pushState();
    });
    this.socksServer.on('client-connected', () => {
      this.state.lanGateway.activeClients = this.socksServer.getActiveClientCount() + this.httpProxyServer.getActiveClientCount();
      this.pushState();
    });

    this.httpProxyServer.on('log', (msg: string) => this.log(msg));
    this.httpProxyServer.on('meeting-protected', () => {
      this.state.protectedMeetingCount++;
      this.pushState();
    });
    this.httpProxyServer.on('client-connected', () => {
      this.state.lanGateway.activeClients = this.socksServer.getActiveClientCount() + this.httpProxyServer.getActiveClientCount();
      this.pushState();
    });

    this.bridgeServer.on('log', (msg: string) => this.log(msg));

    tetherAssistant.on('log', (msg: string) => this.log(msg));
    tetherAssistant.on('tether-optimized', (adapter: NetworkAdapter) => {
      this.state.tetherAssistant = tetherAssistant.getState();
      this.pushState();
      this.log(`[Tether Assistant] Auto-optimized tether adapter "${adapter.name}" with metric 9999`);
    });

    // Wire quota tracking to connection pool byte counts
    this.pool.setOnBytesTransferred((ifIndex, adapterName, deltaBytes) => {
      const res = this.quotaManager.recordBytes(ifIndex, adapterName, deltaBytes);
      if (res.action === 'disconnect') {
        this.setAdapterIncluded(ifIndex, false);
        this.log(`[Quota Guard] Adapter "${adapterName}" reached daily quota cap! Automatically disconnected from bonding.`);
      } else if (res.warning) {
        this.log(`[Quota Guard] Adapter "${adapterName}" reached 80% of daily data quota limit.`);
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

    // 4. Detect Killer suite
    const killer = detectKillerSuite();
    this.state.killerWarning = killer.detected;
    this.state.killerServices = killer.services;
    if (killer.detected) {
      this.log(`[Engine] Killer suite detected: ${killer.services.join(', ')}`);
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
      this.state.lanGateway.localIp = getPrimaryLocalIp(this.state.adapters);
      this.pool.updateAdapters(this.state.adapters);
      this.socksServer.updateAdapters(this.state.adapters, this.state.mode);
      this.httpProxyServer.updateAdapters(this.state.adapters, this.state.mode);

      // Start SOCKS5 proxy
      await this.socksServer.start(this.state.socksPort, this.state.lanGateway.bindHost);
      this.log(`[Engine] SOCKS5 proxy started on ${this.state.lanGateway.bindHost}:${this.state.socksPort}`);

      // Start HTTP CONNECT proxy for LAN & browser support
      await this.httpProxyServer.start(this.state.lanGateway.httpPort, this.state.lanGateway.bindHost);
      this.log(`[Engine] HTTP proxy started on ${this.state.lanGateway.bindHost}:${this.state.lanGateway.httpPort}`);

      // Start local IPC Bridge API for Download Manager integration
      await this.bridgeServer.start();
      this.log(`[Engine] Local Bridge API started on 127.0.0.1:${BRIDGE_PORT}`);

      // Evaluate tether assistant
      tetherAssistant.evaluateAdapters(this.state.adapters);
      this.state.tetherAssistant = tetherAssistant.getState();

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

      this.pushState();
      this.log('[Engine] NetFlo running');

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

    // Always unconditionally revert and clear Windows system proxy whenever bonding stops
    disableSystemProxy();
    this.state.systemProxyActive = false;

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
    await this.httpProxyServer.stop();
    await this.bridgeServer.stop();
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
    this.httpProxyServer.updateAdapters(this.state.adapters, mode);
    this.pushState();
    this.log(`[Engine] Mode set to ${mode}`);
  }

  setAdapterIncluded(ifIndex: number, included: boolean): void {
    const adapter = this.state.adapters.find(a => a.ifIndex === ifIndex);
    if (!adapter) return;
    adapter.includedInBonding = included;
    this.pool.updateAdapters(this.state.adapters);
    this.socksServer.updateAdapters(this.state.adapters, this.state.mode);
    this.httpProxyServer.updateAdapters(this.state.adapters, this.state.mode);
    this.pushState();
    this.log(`[Engine] Adapter ${adapter.name} ${included ? 'included in' : 'excluded from'} bonding`);
  }

  setSystemProxy(enabled: boolean): void {
    this.state.systemProxyActive = enabled;
    if (this.state.status === 'running') {
      if (enabled) {
        enableSystemProxy(this.state.socksPort, this.state.lanGateway.httpPort);
        this.log('[Engine] Windows system proxy enabled (HTTP/HTTPS and browser traffic routed to NetFlo)');
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
    this.httpProxyServer.setMeetingShield(active);
    this.pushState();
    this.log(`[Meeting Shield] ${active ? 'Enabled — VoIP and conference calls prioritized' : 'Disabled'}`);
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
      ? '[Engine] On Battery Power — Power-Saver mode active (reduced polling frequency)'
      : '[Engine] On AC Power — High performance mode restored');
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

  // ─── Phase 2: Per-App Routing & Auto-Turbo ────────────────

  setAppRules(rules: AppRule[]): void {
    this.state.appRules = rules;
    this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.pushState();
    this.log(`[Engine] Configured ${rules.length} per-application split-tunneling rules`);
  }

  setPortRules(rules: PortRule[]): void {
    this.state.portRules = rules;
    this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.pushState();
    this.log(`[Engine] Configured ${rules.length} port routing rules`);
  }

  setAutoTurbo(config: Partial<AutoTurboConfig>): void {
    this.state.autoTurbo = { ...this.state.autoTurbo, ...config };
    this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
    this.pushState();
    this.log(
      `[Engine] Dynamic Congestion Assist (Auto-Turbo) ${this.state.autoTurbo.enabled ? 'enabled' : 'disabled'}`
    );
  }

  async getRunningApplications(): Promise<string[]> {
    return appDetector.getRunningApplications();
  }

  // ─── Phase 3: LAN Gateway & Tether Assistant ──────────────

  async setLanGateway(config: Partial<LanGatewayConfig>): Promise<void> {
    this.state.lanGateway = { ...this.state.lanGateway, ...config };

    if (config.enabled !== undefined) {
      this.state.lanGateway.bindHost = config.enabled ? '0.0.0.0' : '127.0.0.1';
    }

    if (this.state.status === 'running') {
      try {
        await this.socksServer.start(this.state.socksPort, this.state.lanGateway.bindHost);
        await this.httpProxyServer.start(this.state.lanGateway.httpPort, this.state.lanGateway.bindHost);
        this.log(
          `[LAN Gateway] ${this.state.lanGateway.enabled ? 'Activated on 0.0.0.0' : 'Restricted to loopback (127.0.0.1)'} (SOCKS: ${this.state.socksPort}, HTTP: ${this.state.lanGateway.httpPort})`
        );
      } catch (e) {
        this.log(`[LAN Gateway] Failed to restart proxies: ${e}`);
      }
    }

    this.pushState();
  }

  optimizeTether(): TetherAssistantState {
    const tether = this.state.adapters.find(a => tetherAssistant.isTetherAdapter(a));
    if (tether) {
      tetherAssistant.optimize(tether);
    } else {
      applyWcmFix();
    }
    this.state.tetherAssistant = tetherAssistant.getState();
    this.pushState();
    return this.state.tetherAssistant;
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

    // Tether assistant inspection
    tetherAssistant.evaluateAdapters(this.state.adapters);
    this.state.tetherAssistant = tetherAssistant.getState();
    this.state.lanGateway.localIp = getPrimaryLocalIp(this.state.adapters);

    if (prev !== curr) {
      // Adapter list changed — reapply fixes and update pool
      fixUsbTetherMetrics(this.state.adapters);
      this.pool.updateAdapters(this.state.adapters);
      this.socksServer.updateAdapters(this.state.adapters, this.state.mode);
      this.httpProxyServer.updateAdapters(this.state.adapters, this.state.mode);
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
    this.httpProxyServer.updatePings(pingMap);
  }

  // ─── IPC Push Helpers ─────────────────────────────────────

  private pushState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC.STATE_UPDATE, this.state);
  }

  private pushStats(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.state.stats = this.pool.getStats();
    this.state.bridge.connectedClients = this.bridgeServer.getClientCount();
    this.state.lanGateway.activeClients =
      this.socksServer.getActiveClientCount() + this.httpProxyServer.getActiveClientCount();

    // Evaluate Auto-Turbo Congestion Assist
    if (this.state.autoTurbo.enabled) {
      let secondaryIndex = this.state.autoTurbo.secondaryAdapterIndex;
      const connected = this.state.adapters.filter(
        a => a.status === 'connected' && a.includedInBonding && a.ipv4
      );
      if (secondaryIndex === null && connected.length > 1) {
        const tether = connected.find(a => a.type === 'usb-tether');
        if (tether) {
          secondaryIndex = tether.ifIndex;
        } else {
          const sorted = [...connected].sort((a, b) => (a.speedMbps || 100) - (b.speedMbps || 100));
          secondaryIndex = sorted[0].ifIndex;
        }
      }

      if (secondaryIndex !== null) {
        let totalBps = 0;
        for (const s of this.state.stats) {
          totalBps += (s.rxBps + s.txBps);
        }
        const primaryStat = this.state.stats.find(s => s.ifIndex !== secondaryIndex);
        const primaryPing = primaryStat?.pingMs ?? 0;

        const shouldTurbo =
          totalBps >= this.state.autoTurbo.highThroughputThresholdBps ||
          (primaryPing > 0 && primaryPing >= this.state.autoTurbo.highLatencyThresholdMs);

        if (shouldTurbo && !this.state.autoTurbo.active) {
          this.state.autoTurbo.active = true;
          this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
          this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
          this.log(
            `[Auto-Turbo] High demand detected (${(totalBps / (1024 * 1024)).toFixed(1)} MB/s, Ping: ${primaryPing}ms) — Engaging secondary link`
          );
          this.pushState();
        } else if (!shouldTurbo && this.state.autoTurbo.active) {
          if (
            totalBps < this.state.autoTurbo.highThroughputThresholdBps * 0.5 &&
            (primaryPing === 0 || primaryPing < this.state.autoTurbo.highLatencyThresholdMs * 0.8)
          ) {
            this.state.autoTurbo.active = false;
            this.socksServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
            this.httpProxyServer.updateRules(this.state.appRules, this.state.portRules, this.state.autoTurbo);
            this.log('[Auto-Turbo] Traffic normalized — Secondary link returned to standby');
            this.pushState();
          }
        }
      }
    }

    this.mainWindow.webContents.send(IPC.STATS_UPDATE, this.state.stats);
  }

  private log(msg: string): void {
    console.log(msg);
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC.LOG, msg);
  }
}
