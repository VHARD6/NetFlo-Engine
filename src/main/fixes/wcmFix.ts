/**
 * wcmFix.ts
 * ─────────────────────────────────────────────────────────────
 * Windows Connection Manager (WCM) Fix
 *
 * ROOT CAUSE: When USB tethering connects, WCM's fMinimizeConnections
 * policy treats the RNDIS (USB) adapter as a "wired" connection and
 * automatically disconnects Wi-Fi, assuming wired is always better.
 *
 * FIX: Set fMinimizeConnections = 0 in the WCM Group Policy registry
 * key to disable this automatic disconnection behavior.
 *
 * Requires: app running as Administrator (enforced in electron-builder config)
 */

import { execSync } from 'child_process';

const WCM_KEY = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WcmSvc\\GroupPolicy';
const VALUE_NAME = 'fMinimizeConnections';

export interface WcmFixResult {
  success: boolean;
  alreadySet: boolean;
  error?: string;
}

/** Check the current value of fMinimizeConnections */
export function getWcmSetting(): number | null {
  try {
    const out = execSync(
      `reg query "${WCM_KEY}" /v ${VALUE_NAME}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    );
    const m = out.match(/REG_DWORD\s+0x(\w+)/i);
    if (m) return parseInt(m[1], 16);
  } catch {
    // Key does not exist — default is 1 (minimize connections = ON)
  }
  return null;
}

/** Disable WCM's automatic Wi-Fi disconnection when wired connects */
export function applyWcmFix(): WcmFixResult {
  const current = getWcmSetting();

  if (current === 0) {
    return { success: true, alreadySet: true };
  }

  try {
    execSync(
      `reg add "${WCM_KEY}" /v ${VALUE_NAME} /t REG_DWORD /d 0 /f`,
      { stdio: 'ignore', timeout: 5000 }
    );
    console.log('[WCM] fMinimizeConnections disabled — Wi-Fi will stay connected alongside USB tethering');
    return { success: true, alreadySet: false };
  } catch (e) {
    const error = String(e);
    console.error('[WCM] Failed to apply fix:', error);
    return { success: false, alreadySet: false, error };
  }
}

/** Restore WCM to default (re-enable auto disconnect) — called on uninstall */
export function revertWcmFix(): void {
  try {
    execSync(
      `reg add "${WCM_KEY}" /v ${VALUE_NAME} /t REG_DWORD /d 1 /f`,
      { stdio: 'ignore', timeout: 5000 }
    );
    console.log('[WCM] fMinimizeConnections restored to default (1)');
  } catch (e) {
    console.error('[WCM] Failed to revert:', e);
  }
}
