/**
 * ipc/handlers.ts
 * ─────────────────────────────────────────────────────────────
 * Registers all IPC handlers between the renderer and the engine.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import type { NetFloEngine } from '../engine';
import { IPC } from '../../shared/types';
import type { DispatchMode } from '../../shared/types';
import { openKillerControlCenter } from '../fixes/killerDetect';

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

  ipcMain.handle(IPC.SET_MODE, (_event, mode: DispatchMode) => {
    engine.setMode(mode);
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_ADAPTER_INCLUDED, (_event, ifIndex: number, included: boolean) => {
    engine.setAdapterIncluded(ifIndex, included);
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_SYSTEM_PROXY, (_event, enabled: boolean) => {
    engine.setSystemProxy(enabled);
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_WINTUN, (_event, enabled: boolean) => {
    engine.setWintun(enabled);
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
      ifIndex: number,
      adapterName: string,
      dailyCapBytes: number | null,
      actionOnExceed?: 'disconnect' | 'notify-only',
      warningThresholdPercent?: number
    ) => {
      engine.setQuota(ifIndex, adapterName, dailyCapBytes, actionOnExceed, warningThresholdPercent);
      return engine.getState();
    }
  );

  ipcMain.handle(IPC.RESET_QUOTA, (_event, ifIndex: number) => {
    engine.resetQuota(ifIndex);
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_POWER_SAVE, (_event, enabled: boolean) => {
    engine.setPowerSave(enabled);
    return engine.getState();
  });

  ipcMain.handle(IPC.SET_MEETING_SHIELD, (_event, enabled: boolean) => {
    engine.setMeetingShield(enabled);
    return engine.getState();
  });

  // ── Phase 2: Per-App Routing & Auto-Turbo ────────────────
  ipcMain.handle(IPC.GET_APP_RULES, () => {
    return engine.getState().appRules;
  });

  ipcMain.handle(IPC.SET_APP_RULES, (_event, rules: any[]) => {
    engine.setAppRules(rules);
    return engine.getState();
  });

  ipcMain.handle(IPC.GET_PORT_RULES, () => {
    return engine.getState().portRules;
  });

  ipcMain.handle(IPC.SET_PORT_RULES, (_event, rules: any[]) => {
    engine.setPortRules(rules);
    return engine.getState();
  });

  ipcMain.handle(IPC.GET_RUNNING_APPS, async () => {
    return engine.getRunningApplications();
  });

  ipcMain.handle(IPC.SET_AUTO_TURBO, (_event, config: any) => {
    engine.setAutoTurbo(config);
    return engine.getState();
  });
}


