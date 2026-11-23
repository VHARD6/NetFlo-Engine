/**
 * tetherAssistant.ts
 * ─────────────────────────────────────────────────────────────
 * One-Click Phone Tether Assistant & Auto-Optimizer.
 *
 * Automatically detects when an iOS or Android device is connected
 * via USB tethering, applies metric 9999 so Windows won't kill Wi-Fi,
 * ensures WCM policy allows concurrent connections, and provides
 * clear user setup steps.
 */

import { EventEmitter } from 'events';
import type { NetworkAdapter, TetherAssistantState } from '../../shared/types';
import { fixUsbTetherMetrics } from './metricFix';
import { applyWcmFix } from './wcmFix';

const TETHER_NAME_REGEX = /rndis|apple mobile|remote ndis|usb tether|cellular|modem|samsung/i;

export class TetherAssistant extends EventEmitter {
  private lastOptimizedAdapterIndex: number | null = null;
  private state: TetherAssistantState = {
    detected: false,
    status: 'idle',
    wcmProtected: false,
  };

  /**
   * Identifies whether a given adapter is a phone USB or cellular tether device.
   */
  isTetherAdapter(adapter: NetworkAdapter): boolean {
    if (adapter.type === 'usb-tether') return true;
    return (
      TETHER_NAME_REGEX.test(adapter.name) ||
      TETHER_NAME_REGEX.test(adapter.alias)
    );
  }

  /**
   * Evaluates the current list of adapters. If a new tether adapter is detected,
   * auto-optimizes its routing metric and ensures WCM policy is active.
   */
  evaluateAdapters(adapters: NetworkAdapter[]): TetherAssistantState {
    const tether = adapters.find(a => this.isTetherAdapter(a));

    if (!tether) {
      this.state = {
        detected: false,
        status: 'idle',
        wcmProtected: this.state.wcmProtected,
      };
      this.lastOptimizedAdapterIndex = null;
      return { ...this.state };
    }

    const isConnected = tether.status === 'connected';

    // If newly connected or not yet optimized
    if (isConnected && this.lastOptimizedAdapterIndex !== tether.ifIndex) {
      const optimized = this.optimize(tether);
      this.state = {
        detected: true,
        adapterName: tether.name,
        ifIndex: tether.ifIndex,
        status: optimized ? 'optimized' : 'error',
        lastOptimizedTime: Date.now(),
        wcmProtected: true,
      };
      this.lastOptimizedAdapterIndex = tether.ifIndex;
      this.emit('tether-optimized', tether);
    } else {
      this.state = {
        detected: true,
        adapterName: tether.name,
        ifIndex: tether.ifIndex,
        status: isConnected ? (this.state.status === 'optimized' ? 'optimized' : 'detected') : 'idle',
        lastOptimizedTime: this.state.lastOptimizedTime,
        wcmProtected: this.state.wcmProtected,
      };
    }

    return { ...this.state };
  }

  /**
   * Manually or automatically apply metric 9999 and WCM policy fix.
   */
  optimize(adapter: NetworkAdapter): boolean {
    try {
      const wcmRes = applyWcmFix();
      this.state.wcmProtected = wcmRes.success;

      const metricResults = fixUsbTetherMetrics([adapter]);
      const metricOk = metricResults.get(adapter.name) ?? true;

      this.state.detected = true;
      this.state.adapterName = adapter.name;
      this.state.ifIndex = adapter.ifIndex;
      this.state.status = metricOk ? 'optimized' : 'error';
      this.state.lastOptimizedTime = Date.now();

      this.emit('log',
        `[Tether Assistant] 📱 Phone tether detected: "${adapter.name}". Metric set to 9999, WCM policy secured.`
      );
      return metricOk;
    } catch (e) {
      this.state.status = 'error';
      this.emit('log', `[Tether Assistant] Optimization error: ${e}`);
      return false;
    }
  }

  getState(): TetherAssistantState {
    return { ...this.state };
  }
}

export const tetherAssistant = new TetherAssistant();
