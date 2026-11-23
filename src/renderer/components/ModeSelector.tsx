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
    icon: <IconLayers size={14} />,
    description: 'Distributes concurrent TCP flows across all bonded interfaces, pooling download and upload bandwidth.',
  },
  {
    value: 'failover',
    label: 'Failover Sentinel',
    badge: 'Reliability',
    icon: <IconShield size={14} />,
    description: 'Channels all traffic through the primary low-latency link; hot-swaps to secondary links in 150ms upon connection loss.',
  },
  {
    value: 'gaming',
    label: 'Gaming & Latency Prioritization',
    badge: 'Low Jitter',
    icon: <IconActivity size={14} />,
    description: 'Pins games, Discord, and VoIP to the lowest ping adapter while balancing background downloads across other links.',
  },
];

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <span className="section-label">Layer 4 Dispatch Engine</span>
        <span className="text-[11px] font-mono text-zinc-500">Active: {mode}</span>
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {MODES.map(opt => {
          const isSelected = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`
                w-full text-left py-3 px-3 transition-colors duration-150 flex items-start gap-3.5
                disabled:opacity-40 disabled:cursor-not-allowed interactive-row
                ${isSelected ? 'bg-white/[0.035]' : ''}
              `}
            >
              {/* Radio Indicator */}
              <div className="pt-0.5 shrink-0">
                <div
                  className={`
                    w-4 h-4 rounded-full border flex items-center justify-center transition-colors
                    ${isSelected ? 'border-brand-500 bg-brand-500/20' : 'border-zinc-700 bg-transparent'}
                  `}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                </div>
              </div>

              {/* Text & Metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-semibold ${isSelected ? 'text-zinc-100' : 'text-zinc-300'}`}>
                    {opt.label}
                  </span>
                  <span className={isSelected ? 'badge-purple text-[10px]' : 'badge-gray text-[10px]'}>
                    {opt.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
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
