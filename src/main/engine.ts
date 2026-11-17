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
import { BrowserWindow } from 'electron';
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
import type {
  NetFloState,
  NetworkAdapter,
  AdapterStats,
  DispatchMode,
} from '../shared/types';
import { IPC } from '../shared/types';

const SOCKS5_PORT = 1080;
const ADAPTER_POLL_INTERVAL_MS = 3000;
const STATS_PUSH_INTERVAL_MS = 500;
const PING_INTERVAL_MS = 10_000;

export class NetFloEngine extends EventEmitter {
  private pool: ConnectionPool;
  private socksServer: Socks5Server;
  private wintun: WintunAdapter | null = null;
  private mainWindow: BrowserWindow | null = null;

  private state: NetFloState;
  private adapterPollTimer: NodeJS.Timeout | null = null;
  private statsPushTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
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
    };

    this.socksServer.on('log', (msg: string) => this.log(msg));
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
      this.adapterPollTimer = setInterval(() => this.pollAdapters(), ADAPTER_POLL_INTERVAL_MS);

      // Start stats push to renderer
      this.statsPushTimer = setInterval(() => this.pushStats(), STATS_PUSH_INTERVAL_MS);

      // Start ping measurements
      this.pingTimer = setInterval(() => this.measurePings(), PING_INTERVAL_MS);
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
    for (const [ifIndex, ms] of pings) {
      this.pool.updatePing(ifIndex, ms);
    }
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
