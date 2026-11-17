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
}
