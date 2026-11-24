/**
 * killerDetect.ts
 * ─────────────────────────────────────────────────────────────
 * Intel Killer Network Suite Detection
 *
 * ROOT CAUSE: The Killer Prioritization Engine (KPE) is an NDIS filter
 * driver that sits between the network stack and adapters. It actively
 * redirects all traffic to the "best" adapter (usually wired), overriding
 * any application-level adapter selection — including NetFlo's.
 *
 * IMPACT: Even with IP_UNICAST_IF set correctly, the Killer driver can
 * rewrite the outgoing interface at the kernel level, defeating bonding.
 *
 * SOLUTION: Detect if Killer services are running and warn the user to
 * disable "Advanced Stream Detect" / "Killer Prioritization" in
 * Killer Control Center. Full uninstall is NOT required.
 *
 * User's system has: KillerNetworkService, IntelNetworkHelperService
 */

import { execSync } from 'child_process';

export interface KillerStatus {
  detected: boolean;
  services: string[];
  recommendation: string;
}

const KILLER_SERVICES = [
  'KillerNetworkService',
  'KillerControlCenter',
  'IntelNetworkHelperService',
  'KillerAnalyticsService',
  'DoubleAgent',
];

const KILLER_PROCESSES = [
  'KillerControlCenter.exe',
  'IntelNetworkAdapterDiagnostics.exe',
];

export function detectKillerSuite(): KillerStatus {
  const foundServices: string[] = [];

  try {
    const out = execSync('sc query type= all state= running', {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    for (const svc of KILLER_SERVICES) {
      if (out.includes(svc)) {
        foundServices.push(svc);
      }
    }
  } catch {
    // sc query failed — can't detect
  }

  const detected = foundServices.length > 0;

  return {
    detected,
    services: foundServices,
    recommendation: detected
      ? 'Open Killer Control Center → Settings → disable "Killer Prioritization" / "Advanced Stream Detect". ' +
        'You do NOT need to uninstall Killer — just disable traffic prioritization.'
      : '',
  };
}

import fs from 'fs';
import { shell } from 'electron';

/** Open Killer Control Center if installed */
export function openKillerControlCenter(): void {
  const killerExe = 'C:\\Program Files\\Killer Networking\\Killer Control Center\\KillerControlCenter.exe';
  try {
    if (fs.existsSync(killerExe)) {
      if (shell && typeof shell.openPath === 'function') {
        shell.openPath(killerExe);
      }
    } else {
      if (shell && typeof shell.openExternal === 'function') {
        shell.openExternal('ms-settings:network');
      }
    }
  } catch {
    // ignore
  }
}
