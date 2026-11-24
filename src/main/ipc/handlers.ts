/**
 * ipc/handlers.ts
 * ─────────────────────────────────────────────────────────────
 * Registers all IPC handlers between the renderer and the engine.
 * Applies strict type, bounds, and string sanitization on all
 * incoming IPC payloads to enforce the trust boundary.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import type { NetFloEngine } from '../engine';
import { IPC } from '../../shared/types';
import type {
  DispatchMode,
  AppRule,
  PortRule,
  AutoTurboConfig,
  LanGatewayConfig,
} from '../../shared/types';
import { openKillerControlCenter } from '../fixes/killerDetect';

const VALID_MODES: ReadonlySet<string> = new Set(['round-robin', 'failover', 'gaming']);
const VALID_ACTIONS: ReadonlySet<string> = new Set(['disconnect', 'notify-only']);
const VALID_PROTOCOLS: ReadonlySet<string> = new Set(['tcp', 'udp', 'both']);

function isPositiveInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}

function sanitizeString(val: unknown, maxLen = 128): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function setupIpcHandlers(
  ipcMain: IpcMain,
  engine: NetFloEngine,
  win: BrowserWindow
): void {
  // Give engine a reference to the window for push notifications
  engine.setWindow(win);

  // ── Query ──────────────────────────────────────────────────
  ipcMain.handle(IPC.GET_STATE, () => engine.getState());

  // ── Commands ───────────────────────────────────────────────
  ipcMain.handle(IPC.START, async () => {
    await engine.start();
    return engine.getState();
  });

  ipcMain.handle(IPC.STOP, async () => {
    await engine.stop();
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_MODE, (_event, mode: unknown) => {
    if (typeof mode === 'string' && VALID_MODES.has(mode)) {
      engine.setMode(mode as DispatchMode);
    }
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_ADAPTER_INCLUDED, (_event, ifIndex: unknown, included: unknown) => {
    if (isPositiveInteger(ifIndex)) {
      engine.setAdapterIncluded(ifIndex, Boolean(included));
    }
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_SYSTEM_PROXY, (_event, enabled: unknown) => {
    engine.setSystemProxy(Boolean(enabled));
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_WINTUN, (_event, enabled: unknown) => {
    engine.setWintun(Boolean(enabled));
    return engine.getState();
  });

  ipcMain.handle(IPC.APPLY_FIXES, async () => {
    await engine.applySystemFixes();
    return engine.getState();
  });

  ipcMain.handle(IPC.OPEN_KILLER_SETTINGS, () => {
    openKillerControlCenter();
  });

  // ── Phase 1 Safeguards (Quotas, Meeting Shield, Power Saver) ─
  ipcMain.handle(IPC.GET_QUOTAS, () => {
    return engine.getState().quotas;
  });

  ipcMain.handle(
    IPC.SET_QUOTA,
    (
      _event,
      ifIndex: unknown,
      adapterName: unknown,
      dailyCapBytes: unknown,
      actionOnExceed?: unknown,
      warningThresholdPercent?: unknown
    ) => {
      if (!isPositiveInteger(ifIndex)) return engine.getState();
      const sanitizedName = sanitizeString(adapterName, 128);
      const cap =
        typeof dailyCapBytes === 'number' && Number.isFinite(dailyCapBytes) && dailyCapBytes > 0
          ? Math.floor(dailyCapBytes)
          : null;
      const action =
        typeof actionOnExceed === 'string' && VALID_ACTIONS.has(actionOnExceed)
          ? (actionOnExceed as 'disconnect' | 'notify-only')
          : 'notify-only';
      const warning =
        typeof warningThresholdPercent === 'number' && Number.isFinite(warningThresholdPercent)
          ? Math.max(1, Math.min(100, Math.floor(warningThresholdPercent)))
          : 80;

      engine.setQuota(ifIndex, sanitizedName, cap, action, warning);
      return engine.getState();
    }
  );

  ipcMain.handle(IPC.RESET_QUOTA, (_event, ifIndex: unknown) => {
    if (isPositiveInteger(ifIndex)) {
      engine.resetQuota(ifIndex);
    }
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_POWER_SAVE, (_event, enabled: unknown) => {
    engine.setPowerSave(Boolean(enabled));
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_MEETING_SHIELD, (_event, enabled: unknown) => {
    engine.setMeetingShield(Boolean(enabled));
    return engine.getState();
  });

  // ── Phase 2: Per-App Routing & Auto-Turbo ────────────────
  ipcMain.handle(IPC.GET_APP_RULES, () => {
    return engine.getState().appRules;
  });

  ipcMain.handle(IPC.SET_APP_RULES, (_event, rawRules: unknown) => {
    if (!Array.isArray(rawRules)) return engine.getState();
    const validatedRules: AppRule[] = [];
    const maxRules = Math.min(rawRules.length, 200);

    for (let i = 0; i < maxRules; i++) {
      const r = rawRules[i];
      if (!r || typeof r !== 'object') continue;
      const processName = sanitizeString((r as any).processName, 128);
      if (!processName || !/^[a-zA-Z0-9_\-\. ]+$/.test(processName)) continue;

      const rawMode = (r as any).mode;
      const mode =
        typeof rawMode === 'string' && VALID_MODES.has(rawMode)
          ? (rawMode as DispatchMode)
          : null;
      const rawPinned = (r as any).pinnedAdapterIndex;
      const pinnedAdapterIndex = isPositiveInteger(rawPinned) ? rawPinned : null;

      validatedRules.push({
        id: sanitizeString((r as any).id, 64) || `rule_${Date.now()}_${i}`,
        processName: processName.toLowerCase(),
        mode,
        pinnedAdapterIndex,
        enabled: Boolean((r as any).enabled),
      });
    }

    engine.setAppRules(validatedRules);
    return engine.getState();
  });

  ipcMain.handle(IPC.GET_PORT_RULES, () => {
    return engine.getState().portRules;
  });

  ipcMain.handle(IPC.SET_PORT_RULES, (_event, rawRules: unknown) => {
    if (!Array.isArray(rawRules)) return engine.getState();
    const validatedRules: PortRule[] = [];
    const maxRules = Math.min(rawRules.length, 200);

    for (let i = 0; i < maxRules; i++) {
      const r = rawRules[i];
      if (!r || typeof r !== 'object') continue;
      const rawPort = (r as any).port;
      if (!isPositiveInteger(rawPort) || rawPort < 1 || rawPort > 65535) continue;

      const rawProto = (r as any).protocol;
      const protocol =
        typeof rawProto === 'string' && VALID_PROTOCOLS.has(rawProto)
          ? (rawProto as 'tcp' | 'udp' | 'both')
          : 'tcp';

      const rawMode = (r as any).mode;
      const mode =
        typeof rawMode === 'string' && VALID_MODES.has(rawMode)
          ? (rawMode as DispatchMode)
          : null;
      const rawPinned = (r as any).pinnedAdapterIndex;
      const pinnedAdapterIndex = isPositiveInteger(rawPinned) ? rawPinned : null;

      validatedRules.push({
        id: sanitizeString((r as any).id, 64) || `port_rule_${Date.now()}_${i}`,
        protocol,
        port: rawPort,
        mode,
        pinnedAdapterIndex,
        enabled: Boolean((r as any).enabled),
        description: sanitizeString((r as any).description, 256),
      });
    }

    engine.setPortRules(validatedRules);
    return engine.getState();
  });

  ipcMain.handle(IPC.GET_RUNNING_APPS, async () => {
    return engine.getRunningApplications();
  });

  ipcMain.handle(IPC.SET_AUTO_TURBO, (_event, rawConfig: unknown) => {
    if (!rawConfig || typeof rawConfig !== 'object') return engine.getState();
    const c = rawConfig as Partial<AutoTurboConfig>;
    const sanitized: Partial<AutoTurboConfig> = {};
    if (typeof c.enabled === 'boolean') sanitized.enabled = c.enabled;
    if (
      typeof c.highThroughputThresholdBps === 'number' &&
      Number.isFinite(c.highThroughputThresholdBps) &&
      c.highThroughputThresholdBps >= 0
    ) {
      sanitized.highThroughputThresholdBps = Math.floor(c.highThroughputThresholdBps);
    }
    if (
      typeof c.highLatencyThresholdMs === 'number' &&
      Number.isFinite(c.highLatencyThresholdMs) &&
      c.highLatencyThresholdMs >= 0
    ) {
      sanitized.highLatencyThresholdMs = Math.floor(c.highLatencyThresholdMs);
    }
    if (c.secondaryAdapterIndex === null || isPositiveInteger(c.secondaryAdapterIndex)) {
      sanitized.secondaryAdapterIndex = c.secondaryAdapterIndex;
    }

    engine.setAutoTurbo(sanitized);
    return engine.getState();
  });

  // ── Phase 3: LAN Gateway & Tether Assistant ──────────────
  ipcMain.handle(IPC.SET_LAN_GATEWAY, async (_event, rawConfig: unknown) => {
    if (!rawConfig || typeof rawConfig !== 'object') return engine.getState();
    const c = rawConfig as Partial<LanGatewayConfig>;
    const sanitized: Partial<LanGatewayConfig> = {};
    if (typeof c.enabled === 'boolean') sanitized.enabled = c.enabled;
    if (typeof c.allowedSubnetsOnly === 'boolean') sanitized.allowedSubnetsOnly = c.allowedSubnetsOnly;
    if (
      typeof c.socksPort === 'number' &&
      Number.isInteger(c.socksPort) &&
      c.socksPort >= 1024 &&
      c.socksPort <= 65535
    ) {
      sanitized.socksPort = c.socksPort;
    }
    if (
      typeof c.httpPort === 'number' &&
      Number.isInteger(c.httpPort) &&
      c.httpPort >= 1024 &&
      c.httpPort <= 65535
    ) {
      sanitized.httpPort = c.httpPort;
    }

    await engine.setLanGateway(sanitized);
    return engine.getState();
  });

  ipcMain.handle(IPC.OPTIMIZE_TETHER, () => {
    engine.optimizeTether();
    return engine.getState();
  });
}
