/**
 * metricFix.ts
 * ─────────────────────────────────────────────────────────────
 * USB Tethering Route Metric Fix
 *
 * ROOT CAUSE: When Android/iOS USB tethering connects, the DHCP server
 * on the phone assigns a very low metric to the RNDIS adapter's default
 * route (often metric 25-50), which is lower than Wi-Fi (usually 35-55).
 * Windows always prefers the lowest-metric route, so ALL traffic goes
 * through USB instead of being shared between adapters.
 *
 * FIX: Set the USB RNDIS adapter's metric to 9999 so it's never
 * automatically preferred over Wi-Fi or Ethernet. NetFlo's dispatcher
 * then makes the routing decisions itself.
 *
 * This fix is reapplied whenever a new adapter connects.
 */

import { execSync } from 'child_process';
import type { NetworkAdapter } from '../../shared/types';

const HIGH_METRIC = 9999;

/** Detect adapters that are USB tethering (RNDIS) connections */
export function getUsbTetherAdapters(adapters: NetworkAdapter[]): NetworkAdapter[] {
  return adapters.filter(a => a.type === 'usb-tether' && a.status === 'connected');
}

/** Set a high metric on USB tethering adapters to prevent route hijacking */
export function fixUsbTetherMetrics(adapters: NetworkAdapter[]): Map<string, boolean> {
  const results = new Map<string, boolean>();
  const usbAdapters = getUsbTetherAdapters(adapters);

  for (const adapter of usbAdapters) {
    try {
      execSync(
        `netsh interface ip set interface "${adapter.alias}" metric=${HIGH_METRIC}`,
        { stdio: 'ignore', timeout: 5000 }
      );
      console.log(`[Metric] Set "${adapter.name}" metric to ${HIGH_METRIC} — prevents route hijacking`);
      results.set(adapter.name, true);
    } catch (e) {
      console.error(`[Metric] Failed to set metric for "${adapter.name}":`, e);
      results.set(adapter.name, false);
    }
  }

  return results;
}

/** Get current interface metric */
export function getInterfaceMetric(adapterAlias: string): number | null {
  try {
    const out = execSync(
      `netsh interface ip show interface "${adapterAlias}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    );
    const m = out.match(/Metric\s*:\s*(\d+)/i);
    if (m) return parseInt(m[1]);
  } catch {
    // ignore
  }
  return null;
}
