import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names defined inline so preload has ZERO external module dependencies
// (Electron's sandboxed preload cannot resolve relative modules without a bundler)
const IPC = {
  STATE_UPDATE: 'netflo:state-update',
  STATS_UPDATE: 'netflo:stats-update',
  ADAPTER_CHANGE: 'netflo:adapter-change',
  LOG: 'netflo:log',
  GET_STATE: 'netflo:get-state',
  SET_MODE: 'netflo:set-mode',
  SET_ADAPTER_INCLUDED: 'netflo:set-adapter-included',
  SET_SYSTEM_PROXY: 'netflo:set-system-proxy',
  SET_WINTUN: 'netflo:set-wintun',
  START: 'netflo:start',
  STOP: 'netflo:stop',
  APPLY_FIXES: 'netflo:apply-fixes',
  OPEN_KILLER_SETTINGS: 'netflo:open-killer-settings',
  GET_QUOTAS: 'netflo:get-quotas',
  SET_QUOTA: 'netflo:set-quota',
  RESET_QUOTA: 'netflo:reset-quota',
  SET_POWER_SAVE: 'netflo:set-power-save',
  SET_MEETING_SHIELD: 'netflo:set-meeting-shield',
  GET_APP_RULES: 'netflo:get-app-rules',
  SET_APP_RULES: 'netflo:set-app-rules',
  GET_PORT_RULES: 'netflo:get-port-rules',
  SET_PORT_RULES: 'netflo:set-port-rules',
  GET_RUNNING_APPS: 'netflo:get-running-apps',
  SET_AUTO_TURBO: 'netflo:set-auto-turbo',
  SET_LAN_GATEWAY: 'netflo:set-lan-gateway',
  OPTIMIZE_TETHER: 'netflo:optimize-tether',
} as const;

// ─── Expose safe IPC API to renderer ─────────────────────────
// The renderer accesses this via window.netflo.*
contextBridge.exposeInMainWorld('netflo', {
  // ── Commands ──────────────────────────────────────────────
  getState: () => ipcRenderer.invoke(IPC.GET_STATE),
  start: () => ipcRenderer.invoke(IPC.START),
  stop: () => ipcRenderer.invoke(IPC.STOP),
  setMode: (mode: string) => ipcRenderer.invoke(IPC.SET_MODE, mode),
  setAdapterIncluded: (ifIndex: number, included: boolean) =>
    ipcRenderer.invoke(IPC.SET_ADAPTER_INCLUDED, ifIndex, included),
  setSystemProxy: (enabled: boolean) => ipcRenderer.invoke(IPC.SET_SYSTEM_PROXY, enabled),
  setWintun: (enabled: boolean) => ipcRenderer.invoke(IPC.SET_WINTUN, enabled),
  applyFixes: () => ipcRenderer.invoke(IPC.APPLY_FIXES),
  openKillerSettings: () => ipcRenderer.invoke(IPC.OPEN_KILLER_SETTINGS),
  getQuotas: () => ipcRenderer.invoke(IPC.GET_QUOTAS),
  setQuota: (
    ifIndex: number,
    adapterName: string,
    dailyCapBytes: number | null,
    actionOnExceed?: string,
    warningThresholdPercent?: number
  ) =>
    ipcRenderer.invoke(
      IPC.SET_QUOTA,
      ifIndex,
      adapterName,
      dailyCapBytes,
      actionOnExceed,
      warningThresholdPercent
    ),
  resetQuota: (ifIndex: number) => ipcRenderer.invoke(IPC.RESET_QUOTA, ifIndex),
  setPowerSave: (enabled: boolean) => ipcRenderer.invoke(IPC.SET_POWER_SAVE, enabled),
  setMeetingShield: (enabled: boolean) => ipcRenderer.invoke(IPC.SET_MEETING_SHIELD, enabled),
  getAppRules: () => ipcRenderer.invoke(IPC.GET_APP_RULES),
  setAppRules: (rules: unknown[]) => ipcRenderer.invoke(IPC.SET_APP_RULES, rules),
  getPortRules: () => ipcRenderer.invoke(IPC.GET_PORT_RULES),
  setPortRules: (rules: unknown[]) => ipcRenderer.invoke(IPC.SET_PORT_RULES, rules),
  getRunningApps: () => ipcRenderer.invoke(IPC.GET_RUNNING_APPS),
  setAutoTurbo: (config: unknown) => ipcRenderer.invoke(IPC.SET_AUTO_TURBO, config),
  setLanGateway: (config: unknown) => ipcRenderer.invoke(IPC.SET_LAN_GATEWAY, config),
  optimizeTether: () => ipcRenderer.invoke(IPC.OPTIMIZE_TETHER),


  // ── Event listeners ───────────────────────────────────────
  onStateUpdate: (cb: (state: unknown) => void) => {
    const listener = (_: unknown, state: unknown) => cb(state);
    ipcRenderer.on(IPC.STATE_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.STATE_UPDATE, listener);
  },
  onStatsUpdate: (cb: (stats: unknown) => void) => {
    const listener = (_: unknown, stats: unknown) => cb(stats);
    ipcRenderer.on(IPC.STATS_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC.STATS_UPDATE, listener);
  },
  onLog: (cb: (msg: string) => void) => {
    const listener = (_: unknown, msg: string) => cb(msg);
    ipcRenderer.on(IPC.LOG, listener);
    return () => ipcRenderer.removeListener(IPC.LOG, listener);
  },
});
