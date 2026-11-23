/**
 * dispatcher.ts
 * ─────────────────────────────────────────────────────────────
 * Chooses which adapter to route a given TCP/UDP flow through,
 * based on the current dispatch mode.
 *
 * Modes:
 *   round-robin  — spreads connections evenly across all active adapters
 *   failover     — uses the primary (fastest) adapter; falls back on failure
 *   gaming       — bonds HTTP download traffic, pins UDP game traffic to
 *                  the lowest-latency adapter
 */

import type { NetworkAdapter, DispatchMode, AppRule, PortRule, AutoTurboConfig } from '../../shared/types';
import { GAMING_UDP_PORTS, MEETING_PORTS, MEETING_DOMAINS } from '../../shared/types';

export interface FlowKey {
  proto: 'tcp' | 'udp';
  dstHost: string;
  dstPort: number;
  processName?: string;
}

export interface DispatchOptions {
  meetingShieldActive?: boolean;
  adapterPings?: Map<number, number>; // ifIndex -> ping in ms
  appRules?: AppRule[];
  portRules?: PortRule[];
  autoTurbo?: AutoTurboConfig;
}

// ─── Round-Robin State ───────────────────────────────────────
let rrIndex = 0;

/** Check if flow is meeting / VoIP / WebRTC traffic (Zoom, Teams, Meet, Discord, etc.) */
export function isMeetingTraffic(flow: FlowKey): boolean {
  if (MEETING_PORTS.has(flow.dstPort)) return true;
  const host = flow.dstHost.toLowerCase();
  for (const domain of MEETING_DOMAINS) {
    if (host === domain || host.endsWith('.' + domain)) {
      return true;
    }
  }
  return false;
}

export function chooseAdapter(
  flow: FlowKey,
  mode: DispatchMode,
  adapters: NetworkAdapter[],
  options?: DispatchOptions
): NetworkAdapter {
  let active = adapters.filter(
    a => a.status === 'connected' && a.includedInBonding && a.ipv4
  );

  // Auto-Turbo Standby Filtering:
  // If autoTurbo is enabled, but NOT active, exclude the secondary adapter from general bonding
  // to conserve mobile tethering data during light tasks, unless a high-demand task triggers it!
  if (
    options?.autoTurbo?.enabled &&
    !options.autoTurbo.active
  ) {
    let secondaryIndex = options.autoTurbo.secondaryAdapterIndex;
    if (secondaryIndex === null && active.length > 1) {
      const tether = active.find(a => a.type === 'usb-tether');
      if (tether) {
        secondaryIndex = tether.ifIndex;
      } else {
        const sorted = [...active].sort((a, b) => (a.speedMbps || 100) - (b.speedMbps || 100));
        secondaryIndex = sorted[0].ifIndex;
      }
    }
    if (secondaryIndex !== null) {
      const withoutSecondary = active.filter(a => a.ifIndex !== secondaryIndex);
      if (withoutSecondary.length > 0) {
        active = withoutSecondary;
      }
    }
  }

  if (active.length === 0) {
    throw new Error('[Dispatcher] No active adapters available for bonding');
  }

  // 1. Check Per-App Rule override
  if (flow.processName && options?.appRules) {
    const proc = flow.processName.toLowerCase();
    const matchedRule = options.appRules.find(
      r => r.enabled && r.processName.toLowerCase() === proc
    );
    if (matchedRule) {
      if (matchedRule.pinnedAdapterIndex !== null) {
        const pinned = adapters.find(
          a => a.ifIndex === matchedRule.pinnedAdapterIndex && a.status === 'connected' && a.ipv4
        );
        if (pinned) return pinned;
      }
      if (matchedRule.mode) {
        return dispatchByMode(flow, matchedRule.mode, active, options);
      }
    }
  }

  // 2. Check Port Rule override
  if (options?.portRules) {
    const matchedPortRule = options.portRules.find(
      r =>
        r.enabled &&
        r.port === flow.dstPort &&
        (r.protocol === 'both' || r.protocol === flow.proto)
    );
    if (matchedPortRule) {
      if (matchedPortRule.pinnedAdapterIndex !== null) {
        const pinned = adapters.find(
          a => a.ifIndex === matchedPortRule.pinnedAdapterIndex && a.status === 'connected' && a.ipv4
        );
        if (pinned) return pinned;
      }
      if (matchedPortRule.mode) {
        return dispatchByMode(flow, matchedPortRule.mode, active, options);
      }
    }
  }

  // Single adapter remaining — no choice to make
  if (active.length === 1) return active[0];

  // 3. Zero-Drop Meeting Shield priority:
  // Pin to lowest-latency adapter to avoid multipath jitter & packet reordering
  if (options?.meetingShieldActive && isMeetingTraffic(flow)) {
    return dispatchMeeting(active, options.adapterPings);
  }

  // 4. Global Dispatch Mode
  return dispatchByMode(flow, mode, active, options);
}

function dispatchByMode(
  flow: FlowKey,
  mode: DispatchMode,
  active: NetworkAdapter[],
  options?: DispatchOptions
): NetworkAdapter {
  if (active.length === 1) return active[0];

  switch (mode) {
    case 'gaming':
      return dispatchGaming(flow, active);

    case 'failover':
      return active[0]; // primary first

    case 'round-robin':
    default:
      return roundRobin(active);
  }
}


function dispatchMeeting(
  active: NetworkAdapter[],
  pings?: Map<number, number>
): NetworkAdapter {
  // Sort adapters: prefer lowest ping (if ping > 0); fallback to speed
  const sorted = [...active].sort((a, b) => {
    const pingA = (pings?.get(a.ifIndex) ?? 0) || 9999;
    const pingB = (pings?.get(b.ifIndex) ?? 0) || 9999;
    if (pingA !== pingB) return pingA - pingB;
    return b.speedMbps - a.speedMbps;
  });
  return sorted[0];
}

function dispatchGaming(flow: FlowKey, active: NetworkAdapter[]): NetworkAdapter {
  // UDP game traffic → pin to single lowest-latency adapter
  // This prevents jitter caused by out-of-order packets across adapters
  if (flow.proto === 'udp' && GAMING_UDP_PORTS.has(flow.dstPort)) {
    // Sort by latency (tracked externally via ping; fall back to speed) without mutating active array
    return [...active].sort((a, b) => (a.speedMbps > b.speedMbps ? -1 : 1))[0];
  }

  // HTTP/HTTPS downloads → round-robin across all adapters for bonded throughput
  if (flow.dstPort === 80 || flow.dstPort === 443) {
    return roundRobin(active);
  }

  // Everything else → primary adapter
  return active[0];
}

function roundRobin(active: NetworkAdapter[]): NetworkAdapter {
  const adapter = active[rrIndex % active.length];
  rrIndex = (rrIndex + 1) % active.length;
  return adapter;
}

/** Reset round-robin index (call when adapter list changes) */
export function resetRoundRobin(): void {
  rrIndex = 0;
}

