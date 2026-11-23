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
} from './Icons';

interface AdapterListProps {
  adapters: NetworkAdapter[];
  stats: AdapterStats[];
  onToggle: (ifIndex: number, included: boolean) => void;
  disabled: boolean;
}

function getAdapterIconMeta(type: AdapterType) {
  switch (type) {
    case 'wifi':
      return {
        icon: <IconWifi className="w-3.5 h-3.5" />,
        color: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
      };
    case 'ethernet':
      return {
        icon: <IconEthernet className="w-3.5 h-3.5" />,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      };
    case 'usb-tether':
      return {
        icon: <IconPhone className="w-3.5 h-3.5" />,
        color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
      };
    case 'virtual':
      return {
        icon: <IconVirtual className="w-3.5 h-3.5" />,
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
      };
    default:
      return {
        icon: <IconGlobe className="w-3.5 h-3.5" />,
        color: 'text-zinc-400 bg-white/[0.05] border-white/[0.1]',
      };
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
      <div className="glass-panel py-10 text-center text-xs text-zinc-500 font-mono">
        No network interfaces detected
      </div>
    );
  }

  // Calculate highest link throughput for proportional micro-meter scaling
  let maxRx = 1024 * 1024;
  let maxTx = 1024 * 1024;
  for (const s of stats) {
    if (s.rxBps > maxRx) maxRx = s.rxBps;
    if (s.txBps > maxTx) maxTx = s.txBps;
  }

  return (
    <div className="glass-panel overflow-hidden">
      {/* Table Column Guide Header */}
      <div className="grid grid-cols-12 px-4 py-2.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.015]">
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
          const iconMeta = getAdapterIconMeta(adapter.type);

          const rxPercent = Math.min(100, Math.round((rxBps / maxRx) * 100));
          const txPercent = Math.min(100, Math.round((txBps / maxTx) * 100));

          return (
            <div
              key={adapter.ifIndex}
              className={`grid grid-cols-12 items-center px-4 py-3.5 transition-colors duration-150 interactive-row ${
                !isConnected ? 'opacity-40' : ''
              } ${isIncluded && isConnected ? 'bg-white/[0.01]' : ''}`}
            >
              {/* Col 1: Interface & Name */}
              <div className="col-span-5 flex items-center gap-3 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${iconMeta.color}`}
                >
                  {iconMeta.icon}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100 truncate">
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
                  <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
                    <span className="text-zinc-300">{adapter.ipv4 ?? 'No IPv4'}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="capitalize text-zinc-500">{adapter.type.replace('-', ' ')}</span>
                  </div>
                </div>
              </div>

              {/* Col 2: Status */}
              <div className="col-span-2 flex items-center justify-center">
                <span className={isConnected ? (isIncluded ? 'badge-green' : 'badge-yellow') : 'badge-gray'}>
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      isConnected
                        ? isIncluded
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-amber-400'
                        : 'bg-zinc-600'
                    }`}
                  />
                  {isConnected ? (isIncluded ? 'Bonded' : 'Standby') : 'Offline'}
                </span>
              </div>

              {/* Col 3: Throughput with proportional visual meters */}
              <div className="col-span-3 text-right font-mono text-xs pr-1">
                {isConnected && adapterStats ? (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: `${rxPercent}%` }}
                        />
                      </div>
                      <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                        <IconArrowDown size={10} />
                        {formatBytes(rxBps)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px]">
                      <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                        <div
                          className="h-full bg-sky-400 rounded-full transition-all duration-300"
                          style={{ width: `${txPercent}%` }}
                        />
                      </div>
                      <span className="text-sky-400 flex items-center gap-0.5">
                        <IconArrowUp size={9} />
                        {formatBytes(txBps)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-zinc-600 font-mono">—</span>
                )}
              </div>

              {/* Col 4: Latency */}
              <div className="col-span-1 text-right font-mono text-xs">
                {isConnected && adapterStats && pingMs > 0 && pingMs < 999 ? (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      pingMs > 150
                        ? 'text-amber-400'
                        : pingMs > 250
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full ${
                        pingMs > 150 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                    {pingMs}ms
                  </span>
                ) : (
                  <span className="text-zinc-600 font-mono">—</span>
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
                    relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
                    focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
                    ${isIncluded && isConnected ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-zinc-800'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
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
