import React, { useState } from 'react';
import type { NetworkAdapter, AdapterQuota } from '../../../shared/types';
import { IconGauge, IconRefresh } from './Icons';

interface QuotaCardProps {
  adapters: NetworkAdapter[];
  quotas: AdapterQuota[];
  onSetQuota: (
    ifIndex: number,
    adapterName: string,
    dailyCapBytes: number | null,
    actionOnExceed?: 'disconnect' | 'notify-only',
    warningThresholdPercent?: number
  ) => void;
  onResetQuota: (ifIndex: number) => void;
  disabled: boolean;
}

function formatDataSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PRESET_OPTIONS = [
  { label: 'None', bytes: null },
  { label: '500 MB', bytes: 500 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '2 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { label: '5 GB', bytes: 5 * 1024 * 1024 * 1024 },
];

export function QuotaCard({
  adapters,
  quotas,
  onSetQuota,
  onResetQuota,
  disabled,
}: QuotaCardProps) {
  const [selectedIfIndex, setSelectedIfIndex] = useState<number>(
    adapters[0]?.ifIndex ?? 0
  );

  const activeAdapters = adapters.filter(a => a.status === 'connected');
  const currentAdapter =
    adapters.find(a => a.ifIndex === selectedIfIndex) || activeAdapters[0];
  const quota = currentAdapter
    ? quotas.find(q => q.ifIndex === currentAdapter.ifIndex)
    : undefined;

  const usedBytes = quota?.usedTodayBytes ?? 0;
  const capBytes = quota?.dailyCapBytes ?? null;

  const percentUsed =
    capBytes && capBytes > 0
      ? Math.min(100, Math.round((usedBytes / capBytes) * 100))
      : 0;

  const isExceeded = quota?.capExceeded ?? false;
  const isWarning = quota?.warningTriggered ?? false;

  const barColor = isExceeded
    ? 'bg-rose-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-brand-500';

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/[0.03] border border-white/[0.06] text-slate-400 flex items-center justify-center">
            <IconGauge size={13} />
          </div>
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            Data Quota & Budget Guard
          </span>
        </div>

        {quota && (
          <button
            type="button"
            onClick={() => onResetQuota(quota.ifIndex)}
            disabled={disabled}
            title="Reset today's usage counter"
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <IconRefresh size={11} />
            <span>Reset Counter</span>
          </button>
        )}
      </div>

      {activeAdapters.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-3 bg-surface-1 rounded-lg border border-white/[0.04]">
          No active interfaces to meter
        </div>
      ) : (
        <>
          {/* Adapter tabs */}
          {activeAdapters.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              {activeAdapters.map(a => (
                <button
                  key={a.ifIndex}
                  type="button"
                  onClick={() => setSelectedIfIndex(a.ifIndex)}
                  className={`px-2.5 py-1 rounded-md text-[11px] transition-all duration-150 shrink-0 font-medium ${
                    currentAdapter?.ifIndex === a.ifIndex
                      ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-white/[0.02] border border-transparent'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {currentAdapter && (
            <div className="space-y-2.5 bg-surface-1 p-3 rounded-lg border border-white/[0.05]">
              {/* Progress and status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#f7f8f8] font-mono font-medium">
                  {formatDataSize(usedBytes)}
                  <span className="text-slate-500 font-sans ml-1">
                    {capBytes ? `/ ${formatDataSize(capBytes)}` : 'used today'}
                  </span>
                </span>
                <span
                  className={
                    isExceeded
                      ? 'badge-red text-[10px] py-0'
                      : isWarning
                      ? 'badge-yellow text-[10px] py-0'
                      : 'badge-gray text-[10px] py-0 font-mono'
                  }
                >
                  {capBytes ? `${percentUsed}% used` : 'No Cap'}
                </span>
              </div>

              {/* Progress bar */}
              {capBytes && (
                <div className="w-full bg-surface-3 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              )}

              {/* Presets */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-slate-500">Daily Cap Presets:</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_OPTIONS.map(opt => {
                    const isSelected = capBytes === opt.bytes;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          onSetQuota(
                            currentAdapter.ifIndex,
                            currentAdapter.name,
                            opt.bytes,
                            quota?.actionOnExceed ?? 'disconnect',
                            quota?.warningThresholdPercent ?? 80
                          )
                        }
                        disabled={disabled}
                        className={`py-1 text-[11px] rounded-md text-center transition-all duration-150 font-medium ${
                          isSelected
                            ? 'bg-brand-500 text-white shadow-sm'
                            : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-white/[0.05]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action when exceeded */}
              {capBytes && (
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-white/[0.04]">
                  <span className="text-slate-500">Action on limit reach:</span>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name={`action_${currentAdapter.ifIndex}`}
                        checked={(quota?.actionOnExceed ?? 'disconnect') === 'disconnect'}
                        onChange={() =>
                          onSetQuota(
                            currentAdapter.ifIndex,
                            currentAdapter.name,
                            capBytes,
                            'disconnect',
                            quota?.warningThresholdPercent ?? 80
                          )
                        }
                        className="accent-brand-500"
                      />
                      <span>Disconnect link</span>
                    </label>
                    <label className="flex items-center gap-1 text-slate-400 cursor-pointer">
                      <input
                        type="radio"
                        name={`action_${currentAdapter.ifIndex}`}
                        checked={quota?.actionOnExceed === 'notify-only'}
                        onChange={() =>
                          onSetQuota(
                            currentAdapter.ifIndex,
                            currentAdapter.name,
                            capBytes,
                            'notify-only',
                            quota?.warningThresholdPercent ?? 80
                          )
                        }
                        className="accent-brand-500"
                      />
                      <span>Notify only</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
