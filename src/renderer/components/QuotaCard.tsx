import React, { useState } from 'react';
import type { NetworkAdapter, AdapterQuota } from '../../../shared/types';

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
  { label: 'Unlimited', bytes: null },
  { label: '500 MB', bytes: 500 * 1024 * 1024 },
  { label: '1.0 GB', bytes: 1024 * 1024 * 1024 },
  { label: '2.0 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { label: '5.0 GB', bytes: 5 * 1024 * 1024 * 1024 },
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
    : 'bg-emerald-500';

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
          <span>🛡️ Data Quota & Budget Guard</span>
        </div>
        {quota && (
          <button
            onClick={() => onResetQuota(quota.ifIndex)}
            disabled={disabled}
            title="Reset today's usage counter"
            className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            ↺ Reset
          </button>
        )}
      </div>

      {activeAdapters.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-2">
          No connected adapters available
        </div>
      ) : (
        <>
          {/* Adapter selector tabs if multiple connected */}
          {activeAdapters.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              {activeAdapters.map(a => (
                <button
                  key={a.ifIndex}
                  onClick={() => setSelectedIfIndex(a.ifIndex)}
                  className={`px-2 py-1 rounded text-xs transition-colors shrink-0 ${
                    currentAdapter?.ifIndex === a.ifIndex
                      ? 'bg-slate-700 text-netflo-400 font-medium'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {currentAdapter && (
            <div className="space-y-2.5">
              {/* Progress and status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {formatDataSize(usedBytes)}
                  {capBytes ? ` / ${formatDataSize(capBytes)}` : ' used today'}
                </span>
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                    isExceeded
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50'
                      : isWarning
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                      : 'text-slate-400'
                  }`}
                >
                  {capBytes ? `${percentUsed}%` : 'Unlimited'}
                </span>
              </div>

              {/* Progress bar */}
              {capBytes && (
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              )}

              {/* Quick preset selector */}
              <div className="space-y-1 pt-1">
                <label className="text-[11px] text-slate-400">Daily Cap Preset:</label>
                <div className="grid grid-cols-5 gap-1 text-[11px]">
                  {PRESET_OPTIONS.map(opt => {
                    const isSelected = capBytes === opt.bytes;
                    return (
                      <button
                        key={opt.label}
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
                        className={`py-1 rounded text-center transition-colors ${
                          isSelected
                            ? 'bg-netflo-600 text-white font-medium'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action on exceed */}
              {capBytes && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span>When Cap Reached:</span>
                  <button
                    onClick={() => {
                      const nextAction =
                        quota?.actionOnExceed === 'disconnect'
                          ? 'notify-only'
                          : 'disconnect';
                      onSetQuota(
                        currentAdapter.ifIndex,
                        currentAdapter.name,
                        capBytes,
                        nextAction,
                        quota?.warningThresholdPercent ?? 80
                      );
                    }}
                    disabled={disabled}
                    className="text-netflo-400 hover:underline font-medium"
                  >
                    {quota?.actionOnExceed === 'disconnect'
                      ? '🛑 Disconnect Adapter'
                      : '⚠️ Notify Only'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
