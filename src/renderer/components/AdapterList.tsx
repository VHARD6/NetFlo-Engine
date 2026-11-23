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

interface AdapterListProps {
  adapters: NetworkAdapter[];
  stats: AdapterStats[];
  onToggle: (ifIndex: number, included: boolean) => void;
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

export function AdapterList({ adapters, stats, onToggle, disabled }: AdapterListProps) {
  if (adapters.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-zinc-500 font-mono">
        No network adapters detected
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Table Column Guide Header */}
      <div className="grid grid-cols-12 px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-white/[0.06]">
        <div className="col-span-5">Interface & Address</div>
        <div className="col-span-2 text-center">Status</div>
        <div className="col-span-3 text-right">Throughput (Down / Up)</div>
        <div className="col-span-1 text-right">Ping</div>
        <div className="col-span-1 text-right">Bond</div>
      </div>

      {/* Row List */}
      <div className="divide-y divide-white/[0.05]">
        {adapters.map(adapter => {
          const adapterStats = stats.find(s => s.ifIndex === adapter.ifIndex);
          const isConnected = adapter.status === 'connected';
          const isIncluded = adapter.includedInBonding;
          const rxBps = adapterStats?.rxBps ?? 0;
          const txBps = adapterStats?.txBps ?? 0;
          const pingMs = adapterStats?.pingMs ?? 0;

          return (
            <div
              key={adapter.ifIndex}
              className={`grid grid-cols-12 items-center px-3 py-3 transition-colors duration-150 interactive-row ${
                !isConnected ? 'opacity-50' : ''
              }`}
            >
              {/* Col 1: Interface & Name */}
              <div className="col-span-5 flex items-center gap-3 min-w-0">
                <span
                  className={`shrink-0 ${
                    isConnected && isIncluded ? 'text-zinc-200' : 'text-zinc-500'
                  }`}
                >
                  {getAdapterIcon(adapter.type, 'w-4 h-4')}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-100 truncate">
                      {adapter.name}
                    </span>
                    {adapter.killerDetected && (
                      <span className="badge-yellow text-[9px] py-0 px-1">
                        Killer
                      </span>
                    )}
                    {adapter.metric === 9999 && (
                      <span className="badge-gray text-[9px] py-0 px-1 font-mono">
                        Metric 9999
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-500 flex items-center gap-2">
                    <span>{adapter.ipv4 ?? 'No IPv4'}</span>
                    <span className="text-zinc-700">/</span>
                    <span className="capitalize">{adapter.type.replace('-', ' ')}</span>
                  </div>
                </div>
              </div>

              {/* Col 2: Status */}
              <div className="col-span-2 flex items-center justify-center">
                <span className={isConnected ? 'badge-green' : 'badge-gray'}>
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      isConnected ? 'bg-emerald-400' : 'bg-zinc-500'
                    }`}
                  />
                  {isConnected ? (isIncluded ? 'Bonded' : 'Standby') : 'Offline'}
                </span>
              </div>

              {/* Col 3: Throughput */}
              <div className="col-span-3 text-right font-mono text-xs">
                {isConnected && adapterStats ? (
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-emerald-400 font-medium">
                      <IconArrowDown size={10} />
                      <span>{formatBytes(rxBps)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sky-400 text-[10px]">
                      <IconArrowUp size={9} />
                      <span>{formatBytes(txBps)}</span>
                    </div>
                  </div>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>

              {/* Col 4: Latency */}
              <div className="col-span-1 text-right font-mono text-xs">
                {isConnected && adapterStats && pingMs > 0 && pingMs < 999 ? (
                  <span
                    className={
                      pingMs > 120
                        ? 'text-amber-400'
                        : pingMs > 250
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                    }
                  >
                    {pingMs}ms
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>

              {/* Col 5: Bonding Switch */}
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isIncluded}
                  onClick={() => onToggle(adapter.ifIndex, !isIncluded)}
                  disabled={disabled || !isConnected}
                  className={`
                    relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150
                    focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
                    ${isIncluded && isConnected ? 'bg-brand-500' : 'bg-zinc-800'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                      ${isIncluded && isConnected ? 'translate-x-3.5' : 'translate-x-0.5'}
                    `}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
