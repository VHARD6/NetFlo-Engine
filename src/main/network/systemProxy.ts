/**
 * systemProxy.ts
 * ─────────────────────────────────────────────────────────────
 * Manages Windows system-wide proxy settings via registry.
 *
 * When enabled, sets Windows Internet Settings (WinINet) to route
 * system traffic (browsers, Steam, Epic Games, Windows Store, etc.)
 * through NetFlo's local SOCKS5 proxy on 127.0.0.1:1080.
 *
 * Also notifies the system via InternetSetOption (wininet.dll)
 * so running applications immediately recognize the change without
 * requiring a system restart.
 */

import { execSync } from 'child_process';
import koffi from 'koffi';

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

let _wininet: any = null;
let _internetSetOption: any = null;

const INTERNET_OPTION_SETTINGS_CHANGED = 39;
const INTERNET_OPTION_REFRESH = 37;

function notifySystemSettingsChanged(): void {
  try {
    if (!_wininet && process.platform === 'win32') {
      _wininet = koffi.load('wininet.dll');
      _internetSetOption = _wininet.func(
        'bool __stdcall InternetSetOptionA(void *hInternet, uint32 dwOption, void *lpBuffer, uint32 dwBufferLength)'
      );
    }
    if (_internetSetOption) {
      _internetSetOption(null, INTERNET_OPTION_SETTINGS_CHANGED, null, 0);
      _internetSetOption(null, INTERNET_OPTION_REFRESH, null, 0);
    }
  } catch {
    // Non-fatal if notification fails
  }
}

/** Enable Windows system-wide proxy pointing to 127.0.0.1:<socksPort> and <httpPort> */
export function enableSystemProxy(socksPort = 1080, httpPort = 8080): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const proxyServer = `http=127.0.0.1:${httpPort};https=127.0.0.1:${httpPort};socks=127.0.0.1:${socksPort}`;
    execSync(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 1 /f`, { stdio: 'ignore' });
    execSync(`reg add "${REG_KEY}" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`, { stdio: 'ignore' });
    // Bypass all local loopback addresses and IPC services
    execSync(`reg add "${REG_KEY}" /v ProxyOverride /t REG_SZ /d "<local>;localhost;127.0.0.1;127.*;::1" /f`, { stdio: 'ignore' });
    notifySystemSettingsChanged();
    console.log(`[SystemProxy] System proxy enabled on 127.0.0.1 (HTTP: ${httpPort}, SOCKS: ${socksPort})`);
    return true;
  } catch (e) {
    console.error('[SystemProxy] Failed to enable system proxy:', e);
    return false;
  }
}

/** Disable Windows system-wide proxy and restore direct internet access */
export function disableSystemProxy(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execSync(`reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 0 /f`, { stdio: 'ignore' });
    notifySystemSettingsChanged();
    console.log('[SystemProxy] System proxy disabled');
    return true;
  } catch (e) {
    console.error('[SystemProxy] Failed to disable system proxy:', e);
    return false;
  }
}

/** Check if Windows system proxy is currently enabled */
export function isSystemProxyEnabled(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(`reg query "${REG_KEY}" /v ProxyEnable`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/REG_DWORD\s+0x(\w+)/i);
    return m ? parseInt(m[1], 16) === 1 : false;
  } catch {
    return false;
  }
}
