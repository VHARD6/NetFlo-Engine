/**
 * quotaManager.ts
 * ─────────────────────────────────────────────────────────────
 * Manages daily bandwidth quotas and budget limits per network adapter.
 *
 * Prevents mobile hotspot / 4G / 5G data depletion when bonding cellular
 * tethering with broadband or Wi-Fi.
 *
 * Features:
 *   - Configurable daily MB/GB caps per adapter interface.
 *   - Auto-disengage adapter from bonding when 100% quota is reached.
 *   - 80% threshold early warnings.
 *   - Automatic daily rollover at midnight.
 *   - JSON file persistence.
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { AdapterQuota } from '../../shared/types';

export class QuotaManager extends EventEmitter {
  private quotas = new Map<number, AdapterQuota>();
  private storagePath: string;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(customStorageDir?: string) {
    super();

    // Determine storage path
    let storageDir = customStorageDir ?? '';
    if (!storageDir) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron');
        storageDir = app?.getPath('userData') || process.cwd();
      } catch {
        storageDir = process.cwd();
      }
    }

    this.storagePath = path.join(storageDir, 'quotas.json');
    this.loadFromDisk();
  }

  /** Get all configured quotas */
  getQuotas(): AdapterQuota[] {
    this.checkDayRollover();
    return Array.from(this.quotas.values());
  }

  /** Get quota for a specific adapter interface index */
  getQuota(ifIndex: number): AdapterQuota | undefined {
    this.checkDayRollover();
    return this.quotas.get(ifIndex);
  }

  /** Set or update a quota for an adapter */
  setQuota(
    ifIndex: number,
    adapterName: string,
    dailyCapBytes: number | null,
    actionOnExceed: 'disconnect' | 'notify-only' = 'disconnect',
    warningThresholdPercent = 80
  ): AdapterQuota {
    this.checkDayRollover();
    const existing = this.quotas.get(ifIndex);
    const today = this.getTodayDateString();

    const quota: AdapterQuota = {
      ifIndex,
      adapterName,
      dailyCapBytes,
      usedTodayBytes: existing?.lastResetDate === today ? existing.usedTodayBytes : 0,
      lastResetDate: today,
      actionOnExceed,
      warningThresholdPercent,
      warningTriggered: existing?.warningTriggered ?? false,
      capExceeded: false,
    };

    // Re-evaluate cap state immediately
    if (quota.dailyCapBytes !== null && quota.dailyCapBytes > 0) {
      if (quota.usedTodayBytes >= quota.dailyCapBytes) {
        quota.capExceeded = true;
      }
      const pct = (quota.usedTodayBytes / quota.dailyCapBytes) * 100;
      if (pct >= quota.warningThresholdPercent) {
        quota.warningTriggered = true;
      }
    }

    this.quotas.set(ifIndex, quota);
    this.scheduleSave();
    this.emit('quota-updated', quota);
    return quota;
  }

  /** Reset used bytes for today to 0 for an adapter */
  resetQuota(ifIndex: number): void {
    const quota = this.quotas.get(ifIndex);
    if (!quota) return;

    quota.usedTodayBytes = 0;
    quota.warningTriggered = false;
    quota.capExceeded = false;
    quota.lastResetDate = this.getTodayDateString();

    this.scheduleSave();
    this.emit('quota-updated', quota);
  }

  /**
   * Record newly transferred bytes (rx or tx).
   * Returns whether a threshold or cap was triggered.
   */
  recordBytes(
    ifIndex: number,
    adapterName: string,
    deltaBytes: number
  ): { warning: boolean; exceeded: boolean; action?: 'disconnect' } {
    if (deltaBytes <= 0) return { warning: false, exceeded: false };

    this.checkDayRollover();

    let quota = this.quotas.get(ifIndex);
    if (!quota) {
      quota = {
        ifIndex,
        adapterName,
        dailyCapBytes: null, // default unlimited
        usedTodayBytes: 0,
        lastResetDate: this.getTodayDateString(),
        actionOnExceed: 'disconnect',
        warningThresholdPercent: 80,
        warningTriggered: false,
        capExceeded: false,
      };
      this.quotas.set(ifIndex, quota);
    }

    quota.usedTodayBytes += deltaBytes;

    let warning = false;
    let exceeded = false;
    let action: 'disconnect' | undefined;

    if (quota.dailyCapBytes !== null && quota.dailyCapBytes > 0) {
      const pct = (quota.usedTodayBytes / quota.dailyCapBytes) * 100;

      // Check warning threshold (e.g. 80%)
      if (pct >= quota.warningThresholdPercent && !quota.warningTriggered) {
        quota.warningTriggered = true;
        warning = true;
        this.emit('warning', quota);
      }

      // Check hard cap (100%)
      if (quota.usedTodayBytes >= quota.dailyCapBytes && !quota.capExceeded) {
        quota.capExceeded = true;
        exceeded = true;
        this.emit('exceeded', quota);
        if (quota.actionOnExceed === 'disconnect') {
          action = 'disconnect';
        }
      }
    }

    this.scheduleSave();
    return { warning, exceeded, action };
  }

  /** Ensure quotas reset when date rolls over */
  private checkDayRollover(): void {
    const today = this.getTodayDateString();
    let changed = false;

    for (const quota of this.quotas.values()) {
      if (quota.lastResetDate !== today) {
        quota.usedTodayBytes = 0;
        quota.lastResetDate = today;
        quota.warningTriggered = false;
        quota.capExceeded = false;
        changed = true;
        this.emit('quota-reset-daily', quota);
      }
    }

    if (changed) {
      this.scheduleSave();
    }
  }

  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const list: AdapterQuota[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            this.quotas.set(item.ifIndex, item);
          }
        }
      }
    } catch (e) {
      console.warn(`[QuotaManager] Failed to load quotas from ${this.storagePath}:`, e);
    }
    this.checkDayRollover();
  }

  private scheduleSave(): void {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.saveToDisk();
    }, 1000);
  }

  public saveToDisk(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.quotas.values()), null, 2);
      fs.writeFileSync(this.storagePath, data, 'utf8');
    } catch (e) {
      console.warn(`[QuotaManager] Failed to save quotas to ${this.storagePath}:`, e);
    }
  }
}
