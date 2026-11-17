/**
 * pinger.ts
 * ─────────────────────────────────────────────────────────────
 * Measures round-trip latency to 8.8.8.8 through each active adapter.
 * Uses TCP connect to port 53 (more reliable than ICMP ping on Windows
 * which often requires elevation and can be blocked by firewalls).
 */

import { createBoundConnection } from './windowsBinding';
import type { NetworkAdapter } from '../../shared/types';

export async function pingAdapter(adapter: NetworkAdapter): Promise<number> {
  if (!adapter.ipv4 || adapter.status !== 'connected') return 999;

  const start = Date.now();
  let timer: NodeJS.Timeout | null = null;
  const connPromise = createBoundConnection(adapter.ifIndex, '8.8.8.8', 53);
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 3000);
    });
    const socket = await Promise.race([connPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    const rtt = Date.now() - start;
    socket.destroy();
    return rtt;
  } catch {
    if (timer) clearTimeout(timer);
    // Destroy socket if connection resolves after timeout
    connPromise.then(s => s.destroy()).catch(() => {});
    return 999;
  }
}

/** Ping all adapters concurrently and return a map of ifIndex → pingMs */
export async function pingAllAdapters(
  adapters: NetworkAdapter[]
): Promise<Map<number, number>> {
  const results = new Map<number, number>();
  const active = adapters.filter(
    a => a.status === 'connected' && a.includedInBonding && a.ipv4
  );

  await Promise.all(
    active.map(async adapter => {
      const ms = await pingAdapter(adapter);
      results.set(adapter.ifIndex, ms);
    })
  );

  return results;
}
