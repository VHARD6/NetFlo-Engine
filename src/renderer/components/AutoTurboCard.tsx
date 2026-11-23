import React from 'react';
import type { AutoTurboConfig, NetworkAdapter } from '../../../shared/types';
import { IconZap } from './Icons';

interface AutoTurboCardProps {
  config: AutoTurboConfig;
  adapters: NetworkAdapter[];
  onUpdateConfig: (config: Partial<AutoTurboConfig>) => void;
  disabled: boolean;
}

export function AutoTurboCard({
  config,
  adapters,
  onUpdateConfig,
  disabled,
}: AutoTurboCardProps) {
  const activeAdapters = adapters.filter(a => a.status === 'connected');

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
            <IconZap size={11} />
          </div>
          <span className="section-label">Dynamic Bandwidth Burst (Auto-Turbo)</span>
        </div>

        {config.enabled && (
          <span
            className={
              config.active
                ? 'badge-yellow text-[10px]'
                : 'badge-green text-[10px]'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                config.active ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            {config.active ? 'Burst Engaged (Combined)' : 'Standby (Conserving Data)'}
          </span>
        )}
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06] rounded-lg overflow-hidden">
        {/* Toggle Row */}
        <div className="py-3 px-3.5 flex items-center justify-between gap-4 interactive-row">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100">
              Task-Aware Cellular & Secondary Burst
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Holds mobile tether or metered connections in low-power standby during light tasks (reading, casual browsing)
              and dynamically bursts all links together when heavy uploads/downloads occur.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            onClick={() => onUpdateConfig({ enabled: !config.enabled })}
            disabled={disabled}
            className={`
              relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
              focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
              ${config.enabled ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'bg-zinc-800'}
            `}
          >
            <span
              className={`
                inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                ${config.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>

        {/* Configuration sub-row */}
        {config.enabled && (
          <div className="py-3 px-3.5 flex items-center justify-between gap-4 bg-white/[0.015]">
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-200">
                Secondary Standby Link
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                Trigger: &gt; 2 MB/s demand or &gt; 150 ms latency congestion
              </div>
            </div>

            <select
              value={config.secondaryAdapterIndex ?? ''}
              onChange={e =>
                onUpdateConfig({
                  secondaryAdapterIndex: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="bg-zinc-900 border border-white/[0.1] rounded px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-400 font-mono shadow-sm"
            >
              <option value="">Auto-Detect (Prioritizes USB Tether)</option>
              {activeAdapters.map(a => (
                <option key={a.ifIndex} value={a.ifIndex}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
