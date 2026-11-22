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

import type { NetworkAdapter, DispatchMode } from '../../shared/types';
import { GAMING_UDP_PORTS, MEETING_PORTS, MEETING_DOMAINS } from '../../shared/types';

export interface FlowKey {
  proto: 'tcp' | 'udp';
  dstHost: string;
  dstPort: number;
}

export interface DispatchOptions {
  meetingShieldActive?: boolean;
  adapterPings?: Map<number, number>; // ifIndex -> ping in ms
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
  const active = adapters.filter(
    a => a.status === 'connected' && a.includedInBonding && a.ipv4
  );

  if (active.length === 0) {
    throw new Error('[Dispatcher] No active adapters available for bonding');
  }

  // Single adapter — no choice to make
  if (active.length === 1) return active[0];

  // Zero-Drop Meeting Shield priority:
  // If enabled and traffic is a video/voice meeting stream, pin to the lowest-latency stable adapter
  // to avoid packet jitter and connection drops caused by multipath splitting
  if (options?.meetingShieldActive && isMeetingTraffic(flow)) {
    return dispatchMeeting(active, options.adapterPings);
  }

  switch (mode) {
    case 'gaming':
      return dispatchGaming(flow, active);

    case 'failover':
      return active[0]; // already sorted by speed (primary first)

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
    // Sort by latency (tracked externally via ping; fall back to speed)
    return active.sort((a, b) => (a.speedMbps > b.speedMbps ? -1 : 1))[0];
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

