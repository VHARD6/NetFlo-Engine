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
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`
              w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border
              ${config.enabled
                ? config.active
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                : 'bg-white/[0.03] text-slate-500 border-white/[0.06]'
              }
            `}
          >
            <IconZap size={14} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#f7f8f8]">
                Auto-Turbo Congestion Assist
              </span>
              {config.enabled && (
                <span
                  className={
                    config.active
                      ? 'badge-yellow text-[10px] py-0 px-1.5'
                      : 'badge-green text-[10px] py-0 px-1.5'
                  }
                >
                  {config.active ? 'Turbo Engaged' : 'Standby'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {config.enabled
                ? config.active
                  ? 'Secondary link dynamically activated to burst high throughput'
                  : 'Secondary link held in standby to conserve cellular data'
                : 'Holds secondary mobile link idle until peak bandwidth or latency spike'}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onUpdateConfig({ enabled: !config.enabled })}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${config.enabled ? 'bg-brand-500' : 'bg-surface-4'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
              ${config.enabled ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {config.enabled && (
        <div className="bg-surface-1 p-3 rounded-lg border border-white/[0.06] space-y-2.5 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1 font-medium">
              Standby Adapter (e.g. Phone 5G / Tether):
            </label>
            <select
              value={config.secondaryAdapterIndex ?? ''}
              onChange={e =>
                onUpdateConfig({
                  secondaryAdapterIndex: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-full bg-surface-2 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-brand-500/60"
            >
              <option value="">Choose an adapter for auto-standby</option>
              {activeAdapters.map(a => (
                <option key={a.ifIndex} value={a.ifIndex}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-white/[0.04] pt-2">
            <span>Engagement threshold</span>
            <span className="font-mono text-slate-300">
              &gt; 10 MB/s or &gt; 150 ms latency
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
