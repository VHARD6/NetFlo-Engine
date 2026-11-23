import React from 'react';
import type { NetworkAdapter, AdapterStats, AdapterType } from '../../../shared/types';
import {
  IconWifi,
  IconEthernet,
  IconPhone,
  IconVirtual,
  IconGlobe,
  IconArrowUp,
  IconArrowDown,
  IconAlert,
  IconCheck,
} from './Icons';

interface AdapterCardProps {
  adapter: NetworkAdapter;
  stats?: AdapterStats;
  onToggle: (included: boolean) => void;
  disabled: boolean;
}

function getAdapterIcon(type: AdapterType, className = 'w-4 h-4') {
  switch (type) {
    case 'wifi':
      return <IconWifi className={className} />;
    case 'ethernet':
      return <IconEthernet className={className} />;
    case 'usb-tether':
      return <IconPhone className={className} />;
    case 'virtual':
      return <IconVirtual className={className} />;
    default:
      return <IconGlobe className={className} />;
  }
}

function formatBytes(bps: number): string {
  if (bps === 0) return '0 B/s';
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function AdapterCard({ adapter, stats, onToggle, disabled }: AdapterCardProps) {
  const isConnected = adapter.status === 'connected';
  const isIncluded = adapter.includedInBonding;

  return (
    <div
      className={`
        relative rounded-[10px] p-3.5 border transition-all duration-150
        ${isIncluded && isConnected
          ? 'bg-surface-2 border-white/[0.12] shadow-sm'
          : 'bg-surface-1 border-white/[0.05] opacity-65'
        }
      `}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`
              w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border
              ${isConnected
                ? 'bg-white/[0.04] text-slate-200 border-white/[0.08]'
                : 'bg-white/[0.02] text-slate-500 border-white/[0.04]'
              }
            `}
          >
            {getAdapterIcon(adapter.type)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#f7f8f8] truncate">
              {adapter.name}
            </div>
            <div className="text-[11px] text-slate-500 font-mono truncate">
              {adapter.ipv4 ?? 'No IPv4 address'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span className={isConnected ? 'badge-green' : 'badge-gray'}>
            <span
              className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                isConnected ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
            {isConnected ? 'Active' : 'Offline'}
          </span>

          {/* Minimal toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isIncluded}
            onClick={() => onToggle(!isIncluded)}
            disabled={disabled || !isConnected}
            className={`
              relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
              focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
              ${isIncluded && isConnected ? 'bg-brand-500' : 'bg-surface-4'}
            `}
          >
            <span
              className={`
                inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                ${isIncluded && isConnected ? 'translate-x-4' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>

      {/* Metrics Row — only when connected and running */}
      {isConnected && stats && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.05] grid grid-cols-3 gap-2 text-[11px]">
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <IconArrowUp size={10} className="text-sky-400" /> Upload
            </span>
            <span className="text-slate-200 font-mono font-medium mt-0.5">
              {formatBytes(stats.txBps)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <IconArrowDown size={10} className="text-emerald-400" /> Download
            </span>
            <span className="text-slate-200 font-mono font-medium mt-0.5">
              {formatBytes(stats.rxBps)}
            </span>
          </div>

          <div className="flex flex-col text-right">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider">
              Latency
            </span>
            <span
              className={`font-mono font-medium mt-0.5 ${
                stats.pingMs >= 999
                  ? 'text-slate-500'
                  : stats.pingMs > 100
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {stats.pingMs >= 999 ? '—' : `${stats.pingMs} ms`}
            </span>
          </div>
        </div>
      )}

      {/* Killer warning indicator */}
      {adapter.killerDetected && (
        <div className="mt-2.5 pt-2 border-t border-amber-500/20 flex items-center gap-1.5 text-[11px] text-amber-400">
          <IconAlert size={12} className="shrink-0" />
          <span>Killer Prioritization active</span>
        </div>
      )}

      {/* Metric 9999 confirmation */}
      {adapter.metric !== undefined && adapter.metric === 9999 && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
          <IconCheck size={11} className="text-emerald-400" />
          <span>Metric pinned to 9999 (Windows WCM protected)</span>
        </div>
      )}
    </div>
  );
}
