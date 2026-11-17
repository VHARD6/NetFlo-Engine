import React from 'react';
import type { NetworkAdapter, AdapterStats, AdapterType } from '../../../shared/types';

interface AdapterCardProps {
  adapter: NetworkAdapter;
  stats?: AdapterStats;
  onToggle: (included: boolean) => void;
  disabled: boolean;
}

const TYPE_ICONS: Record<AdapterType, string> = {
  wifi:        '📶',
  ethernet:    '🔌',
  'usb-tether':'📱',
  virtual:     '🔄',
  unknown:     '🌐',
};

function formatBytes(bps: number): string {
  if (bps === 0) return '0 B/s';
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function AdapterCard({ adapter, stats, onToggle, disabled }: AdapterCardProps) {
  const isConnected = adapter.status === 'connected';
  const isIncluded  = adapter.includedInBonding;

  return (
    <div
      className={`
        card relative transition-all duration-200
        ${isIncluded && isConnected ? 'border-netflo-500/40 bg-slate-800' : 'opacity-60'}
        ${!isConnected ? 'border-slate-700/30' : ''}
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{TYPE_ICONS[adapter.type]}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{adapter.name}</div>
            <div className="text-xs text-slate-500 truncate">
              {adapter.ipv4 ?? 'No IP'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span className={isConnected ? 'badge-green' : 'badge-gray'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>

          {/* Toggle switch */}
          <button
            role="switch"
            aria-checked={isIncluded}
            onClick={() => onToggle(!isIncluded)}
            disabled={disabled || !isConnected}
            className={`
              relative inline-flex h-5 w-9 items-center rounded-full transition-colors
              focus:outline-none focus:ring-2 focus:ring-netflo-500 focus:ring-offset-2 focus:ring-offset-slate-800
              disabled:cursor-not-allowed
              ${isIncluded && isConnected ? 'bg-netflo-600' : 'bg-slate-600'}
            `}
          >
            <span
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                ${isIncluded && isConnected ? 'translate-x-4' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Stats row — only when connected and running */}
      {isConnected && stats && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="text-netflo-400 font-mono">↑ {formatBytes(stats.txBps)}</div>
            <div className="text-slate-600">Upload</div>
          </div>
          <div className="text-center">
            <div className="text-emerald-400 font-mono">↓ {formatBytes(stats.rxBps)}</div>
            <div className="text-slate-600">Download</div>
          </div>
          <div className="text-center">
            <div className={`font-mono ${stats.pingMs >= 999 ? 'text-red-400' : stats.pingMs > 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stats.pingMs >= 999 ? '—' : `${stats.pingMs}ms`}
            </div>
            <div className="text-slate-600">Ping</div>
          </div>
        </div>
      )}

      {/* Killer warning badge */}
      {adapter.killerDetected && (
        <div className="mt-2">
          <span className="badge-yellow text-xs">⚠️ Killer suite active</span>
        </div>
      )}

      {/* Metric info */}
      {adapter.metric !== undefined && adapter.metric === 9999 && (
        <div className="mt-1 text-xs text-slate-600">Metric pinned to 9999 ✓</div>
      )}
    </div>
  );
}
