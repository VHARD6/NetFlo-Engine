// Scale libuv threadpool to 64 threads to eliminate DNS lookup bottlenecks
process.env.UV_THREADPOOL_SIZE = '64';

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { NetFloEngine } from './engine';
import { setupIpcHandlers } from './ipc/handlers';
import { disableSystemProxy } from './network/systemProxy';

// ─── Globals ────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: NetFloEngine | null = null;
let isQuitting = false;
let isStoppingEngine = false;

const isDev = !app.isPackaged;

// ─── Emergency Cleanup Hooks ─────────────────────────────────
function emergencyCleanup(): void {
  try {
    disableSystemProxy();
  } catch {}
}
process.on('exit', emergencyCleanup);
process.on('SIGINT', () => { emergencyCleanup(); process.exit(0); });
process.on('SIGTERM', () => { emergencyCleanup(); process.exit(0); });
process.on('uncaughtException', (err) => {
  console.error('[NetFlo] Uncaught exception:', err);
  emergencyCleanup();
  process.exit(1);
});

// ─── Single instance lock ────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(async () => {
  // Always ensure clean proxy state on launch
  disableSystemProxy();

  createWindow();
  createTray();

  engine = new NetFloEngine();
  setupIpcHandlers(ipcMain, engine, mainWindow!);

  // Apply system fixes immediately (requires elevation — app is launched as admin)
  await engine.applySystemFixes().catch((err) => {
    console.error('[NetFlo] Failed to apply system fixes:', err);
  });

  app.on('activate', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  disableSystemProxy();
  app.quit();
});

app.on('before-quit', (e) => {
  if (isQuitting) return;
  if (engine && engine.getState().status !== 'stopped' && !isStoppingEngine) {
    e.preventDefault();
    isStoppingEngine = true;
    engine.stop().finally(() => {
      disableSystemProxy();
      isQuitting = true;
      app.quit();
    });
    return;
  }
  disableSystemProxy();
  isQuitting = true;
});

// ─── Window creation ─────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    title: 'NetFlo',
    backgroundColor: '#0f172a', // slate-900 dark background
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#94a3b8',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (engine) {
    engine.setWindow(mainWindow);
  }

  const htmlPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Window] WebContents loaded successfully');
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Window] Failed to load:', code, desc);
  });
  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[Renderer Console]', message);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(htmlPath);
  }

  // Prevent external navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Stop bonding, revert system proxy, and quit when window is closed
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      isQuitting = true;
      e.preventDefault();
      const finalizeQuit = () => {
        disableSystemProxy();
        app.quit();
      };
      if (engine && engine.getState().status !== 'stopped') {
        engine.stop().finally(finalizeQuit);
      } else {
        finalizeQuit();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Tray ─────────────────────────────────────────────────────
function createTray(): void {
  try {
    let iconPath = path.join(__dirname, '../../resources/icon.ico');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(process.resourcesPath, 'icon.ico');
    }
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty();
    if (icon.isEmpty()) {
      console.warn('[Tray] Icon not found, skipping tray creation');
      return;
    }
    tray = new Tray(icon);
    tray.setToolTip('NetFlo — Network Bonding');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NetFlo',
      click: () => {
        if (mainWindow?.isMinimized()) mainWindow.restore();
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Start Bonding',
      click: () => engine?.start(),
    },
    {
      label: 'Stop Bonding',
      click: () => engine?.stop(),
    },
    { type: 'separator' },
    {
      label: 'Quit NetFlo',
      click: () => {
        isQuitting = true;
        const finalizeQuit = () => {
          disableSystemProxy();
          app.quit();
        };
        if (engine && engine.getState().status !== 'stopped') {
          engine.stop().finally(finalizeQuit);
        } else {
          finalizeQuit();
        }
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  const showWindow = () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  };

  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  } catch (err) {
    console.warn('[Tray] Failed to initialize tray:', err);
  }
}

// ─── Re-export for use in ipc handlers ───────────────────────
export { mainWindow };
