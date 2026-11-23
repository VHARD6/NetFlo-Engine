import React from 'react';
import type { DispatchMode } from '../../../shared/types';
import { IconLayers, IconShield, IconActivity } from './Icons';

interface ModeSelectorProps {
  mode: DispatchMode;
  onChange: (mode: DispatchMode) => void;
  disabled: boolean;
}

interface ModeOption {
  value: DispatchMode;
  label: string;
  badge: string;
  icon: React.ReactNode;
  description: string;
}

const MODES: ModeOption[] = [
  {
    value: 'round-robin',
    label: 'Round-Robin Stream Balancing',
    badge: 'Aggregated Speed',
    icon: <IconLayers size={14} className="text-indigo-400" />,
    description: 'Distributes concurrent TCP flows across all bonded interfaces, pooling download and upload bandwidth for multi-stream tasks.',
  },
  {
    value: 'failover',
    label: 'Failover Sentinel',
    badge: 'Zero Interruption',
    icon: <IconShield size={14} className="text-emerald-400" />,
    description: 'Channels all traffic through the primary low-latency link; hot-swaps to backup links in 150ms upon connection loss.',
  },
  {
    value: 'gaming',
    label: 'Gaming & Latency Prioritization',
    badge: 'Low Jitter',
    icon: <IconActivity size={14} className="text-sky-400" />,
    description: 'Pins games, Discord, and VoIP to the lowest ping adapter while balancing background downloads across other links.',
  },
];

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between pb-1">
        <span className="section-label">Layer 4 Dispatch Engine</span>
        <span className="text-[11px] font-mono text-zinc-400">
          Current Algorithm: <span className="text-zinc-200 capitalize font-medium">{mode}</span>
        </span>
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06] rounded-lg overflow-hidden">
        {MODES.map(opt => {
          const isSelected = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`
                w-full text-left py-3 px-3.5 transition-all duration-150 flex items-start gap-3.5
                disabled:opacity-40 disabled:cursor-not-allowed interactive-row
                ${isSelected ? 'bg-indigo-500/[0.08]' : 'bg-transparent'}
              `}
            >
              {/* Radio Indicator */}
              <div className="pt-0.5 shrink-0">
                <div
                  className={`
                    w-4 h-4 rounded-full border flex items-center justify-center transition-all
                    ${isSelected ? 'border-indigo-400 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'border-zinc-700 bg-transparent'}
                  `}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              {/* Text & Metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {opt.icon}
                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <span className={isSelected ? 'badge-purple text-[10px]' : 'badge-gray text-[10px]'}>
                    {opt.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed pl-5">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
