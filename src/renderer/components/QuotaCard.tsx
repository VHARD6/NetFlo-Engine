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
  { label: 'No Cap', bytes: null },
  { label: '500 MB', bytes: 500 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '2 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { label: '5 GB', bytes: 5 * 1024 * 1024 * 1024 },
  { label: '10 GB', bytes: 10 * 1024 * 1024 * 1024 },
];

export function QuotaCard({
  adapters,
  quotas,
  onSetQuota,
  onResetQuota,
  disabled,
}: QuotaCardProps) {
  const activeAdapters = adapters.filter(a => a.status === 'connected');
  const [selectedIfIndex, setSelectedIfIndex] = useState<number>(
    adapters[0]?.ifIndex ?? 0
  );

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
    ? 'bg-amber-400'
    : 'bg-brand-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="section-label">Metered Data Quota & Budget Guard</span>
        {quota && isExceeded && (
          <span className="badge-red text-[10px]">Quota Cap Exceeded</span>
        )}
        {quota && isWarning && !isExceeded && (
          <span className="badge-yellow text-[10px]">80% Threshold Reached</span>
        )}
      </div>

      {/* Adapter selector pills */}
      <div className="flex flex-wrap gap-1.5">
        {adapters.map(adapter => {
          const isSelected = (currentAdapter?.ifIndex ?? 0) === adapter.ifIndex;
          const q = quotas.find(x => x.ifIndex === adapter.ifIndex);
          return (
            <button
              key={adapter.ifIndex}
              type="button"
              onClick={() => setSelectedIfIndex(adapter.ifIndex)}
              className={`
                px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer border
                ${isSelected
                  ? 'bg-white/[0.08] text-white border-white/[0.15]'
                  : 'bg-transparent text-zinc-500 hover:text-zinc-300 border-white/[0.05]'
                }
              `}
            >
              <span>{adapter.name}</span>
              {q?.dailyCapBytes && (
                <span className="ml-1.5 text-[10px] text-zinc-500">
                  ({formatDataSize(q.usedTodayBytes)} / {formatDataSize(q.dailyCapBytes)})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {currentAdapter ? (
        <div className="border-t border-white/[0.06] pt-3 space-y-3">
          {/* Usage typography and progress line */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-base font-mono font-semibold text-zinc-100">
                {formatDataSize(usedBytes)}{' '}
                <span className="text-xs font-normal text-zinc-500">
                  {capBytes ? `of ${formatDataSize(capBytes)} daily limit` : '(No daily limit)'}
                </span>
              </div>
              {capBytes && (
                <div className="text-xs font-mono text-zinc-400">
                  {percentUsed}%
                </div>
              )}
            </div>

            {/* Hairline Progress Bar */}
            <div className="w-full h-1.5 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${barColor}`}
                style={{ width: `${capBytes ? percentUsed : 0}%` }}
              />
            </div>
          </div>

          {/* Quick preset limits */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-zinc-500 mr-1">Daily Cap:</span>
              {PRESET_OPTIONS.map(opt => {
                const isActive = (quota?.dailyCapBytes ?? null) === opt.bytes;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onSetQuota(
                        currentAdapter.ifIndex,
                        currentAdapter.name,
                        opt.bytes,
                        'disconnect',
                        80
                      )
                    }
                    className={`
                      px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer border
                      ${isActive
                        ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                        : 'bg-white/[0.02] text-zinc-400 hover:text-zinc-200 border-white/[0.06]'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={disabled || usedBytes === 0}
              onClick={() => onResetQuota(currentAdapter.ifIndex)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-30"
              title="Reset today's usage accumulator"
            >
              <IconRefresh size={11} />
              <span>Reset Counter</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-4 font-mono">
          Select an adapter above to configure daily data limits.
        </div>
      )}
    </div>
  );
}
