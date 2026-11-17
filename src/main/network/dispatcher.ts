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
import { GAMING_UDP_PORTS } from '../../shared/types';

export interface FlowKey {
  proto: 'tcp' | 'udp';
  dstHost: string;
  dstPort: number;
}

// ─── Round-Robin State ───────────────────────────────────────
let rrIndex = 0;

export function chooseAdapter(
  flow: FlowKey,
  mode: DispatchMode,
  adapters: NetworkAdapter[]
): NetworkAdapter {
  const active = adapters.filter(
    a => a.status === 'connected' && a.includedInBonding && a.ipv4
  );

  if (active.length === 0) {
    throw new Error('[Dispatcher] No active adapters available for bonding');
  }

  // Single adapter — no choice to make
  if (active.length === 1) return active[0];

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
