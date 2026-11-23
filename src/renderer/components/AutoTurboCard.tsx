import React from 'react';
import type { AutoTurboConfig, NetworkAdapter } from '../../../shared/types';

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
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <span>🚀 Auto-Turbo Congestion Assist</span>
            {config.enabled && (
              <span
                className={`text-[10px] px-1 rounded font-medium border ${
                  config.active
                    ? 'bg-amber-950/80 text-amber-300 border-amber-800/40 animate-pulse'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/40'
                }`}
              >
                {config.active ? 'Turbo Active' : 'Standby'}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {config.enabled
              ? config.active
                ? 'Secondary link engaged to boost heavy load'
                : 'Secondary link held idle in standby to conserve data'
              : 'Keeps secondary mobile tether on standby until needed'}
          </div>
        </div>

        <button
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onUpdateConfig({ enabled: !config.enabled })}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${config.enabled ? 'bg-amber-600' : 'bg-slate-600'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
              ${config.enabled ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {config.enabled && (
        <div className="bg-slate-800/70 p-2.5 rounded border border-slate-700/60 space-y-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">
              Standby Adapter (e.g. Phone 5G / Tether):
            </label>
            <select
              value={config.secondaryAdapterIndex ?? ''}
              onChange={e =>
                onUpdateConfig({
                  secondaryAdapterIndex: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            >
              <option value="">Select Adapter to Keep on Standby</option>
              {activeAdapters.map(a => (
                <option key={a.ifIndex} value={a.ifIndex}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-slate-400">
            Triggers when download exceeds <span className="text-slate-200 font-medium">10 MB/s</span> or Wi-Fi latency exceeds <span className="text-slate-200 font-medium">150 ms</span>.
          </div>
        </div>
      )}
    </div>
  );
}
