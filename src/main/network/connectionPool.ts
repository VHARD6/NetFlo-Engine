/**
 * connectionPool.ts
 * ─────────────────────────────────────────────────────────────
 * Manages per-adapter TCP connection pools.
 * Each adapter gets its own pool of outgoing connections, bound
 * to that adapter's IP using IP_UNICAST_IF on Windows.
 *
 * Also tracks per-adapter throughput statistics.
 */

import net from 'net';
import { createBoundConnection } from './windowsBinding';
import type { NetworkAdapter, AdapterStats } from '../../shared/types';

interface AdapterPool {
  adapter: NetworkAdapter;
  txBytes: number;
  rxBytes: number;
  lastTxBytes: number;
  lastRxBytes: number;
  txBps: number;
  rxBps: number;
  pingMs: number;
  activeConnections: number;
}

export class ConnectionPool {
  private pools = new Map<number, AdapterPool>(); // keyed by ifIndex
  private statsInterval: NodeJS.Timeout | null = null;

  constructor() {}

  /** Initialize or update pools based on current adapter list */
  updateAdapters(adapters: NetworkAdapter[]): void {
    const activeIndices = new Set(
      adapters
        .filter(a => a.status === 'connected' && a.includedInBonding && a.ipv4)
        .map(a => a.ifIndex)
    );

    // Remove pools for adapters no longer active
    for (const idx of this.pools.keys()) {
      if (!activeIndices.has(idx)) this.pools.delete(idx);
    }

    // Add pools for new adapters
    for (const adapter of adapters) {
      if (!activeIndices.has(adapter.ifIndex)) continue;
      if (!this.pools.has(adapter.ifIndex)) {
        this.pools.set(adapter.ifIndex, {
          adapter,
          txBytes: 0, rxBytes: 0,
          lastTxBytes: 0, lastRxBytes: 0,
          txBps: 0, rxBps: 0,
          pingMs: 0,
          activeConnections: 0,
        });
      } else {
        // Update adapter metadata
        this.pools.get(adapter.ifIndex)!.adapter = adapter;
      }
    }
  }

  /**
   * Create a new outgoing TCP connection through a specific adapter.
   * Uses IP_UNICAST_IF on Windows to guarantee the packet exits through
   * the correct adapter regardless of the routing table.
   */
  async createConnection(
    adapter: NetworkAdapter,
    dstHost: string,
    dstPort: number
  ): Promise<net.Socket> {
    const pool = this.pools.get(adapter.ifIndex);
    if (!pool) {
      throw new Error(`No pool for adapter ${adapter.name} (ifIndex=${adapter.ifIndex})`);
    }

    const socket = await createBoundConnection(adapter.ifIndex, dstHost, dstPort);
    pool.activeConnections++;

    // Track bytes transferred through this adapter
    socket.on('data', (chunk) => {
      pool.rxBytes += chunk.length;
    });

    const origWrite = socket.write.bind(socket);
    (socket as any).write = function (data: any, ...args: any[]) {
      const len = (data && (data.byteLength ?? data.length)) || (typeof data === 'string' ? Buffer.byteLength(data) : 0);
      pool.txBytes += len;
      return origWrite(data, ...args);
    };

    socket.once('close', () => {
      pool.activeConnections = Math.max(0, pool.activeConnections - 1);
    });

    return socket;
  }

  /** Get current stats snapshot for all pools */
  getStats(): AdapterStats[] {
    return Array.from(this.pools.values()).map(p => ({
      ifIndex: p.adapter.ifIndex,
      name: p.adapter.name,
      txBytes: p.txBytes,
      rxBytes: p.rxBytes,
      txBps: p.txBps,
      rxBps: p.rxBps,
      pingMs: p.pingMs,
      activeConnections: p.activeConnections,
    }));
  }

  /** Start computing bytes/sec every second */
  startStatsCollection(): void {
    if (this.statsInterval) return;
    this.statsInterval = setInterval(() => {
      for (const pool of this.pools.values()) {
        pool.txBps = pool.txBytes - pool.lastTxBytes;
        pool.rxBps = pool.rxBytes - pool.lastRxBytes;
        pool.lastTxBytes = pool.txBytes;
        pool.lastRxBytes = pool.rxBytes;
      }
    }, 1000);
  }

  stopStatsCollection(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /** Update ping measurement for an adapter (called from pinger) */
  updatePing(ifIndex: number, pingMs: number): void {
    const pool = this.pools.get(ifIndex);
    if (pool) pool.pingMs = pingMs;
  }

  destroy(): void {
    this.stopStatsCollection();
    this.pools.clear();
  }
}
