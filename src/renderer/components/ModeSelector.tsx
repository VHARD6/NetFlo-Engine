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
  icon: React.ReactNode;
  description: string;
}

const MODES: ModeOption[] = [
  {
    value: 'round-robin',
    label: 'Round-Robin',
    icon: <IconLayers size={15} />,
    description: 'Distributes TCP streams evenly across all bonded interfaces',
  },
  {
    value: 'failover',
    label: 'Failover Shield',
    icon: <IconShield size={15} />,
    description: 'Directs traffic via primary adapter; hot-swaps to backup on loss',
  },
  {
    value: 'gaming',
    label: 'Gaming & Low-Latency',
    icon: <IconActivity size={15} />,
    description: 'Aggregates bulk downloads while pinning UDP/games to lowest ping',
  },
];

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="card space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
          Bonding Algorithm
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          Layer 4 Dispatch
        </span>
      </div>

      <div className="space-y-1.5">
        {MODES.map(opt => {
          const isSelected = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              className={`
                w-full text-left rounded-lg p-2.5 transition-all duration-150 border
                flex items-start gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed
                ${isSelected
                  ? 'bg-brand-500/10 border-brand-500/40 text-[#f7f8f8]'
                  : 'bg-surface-1 border-white/[0.05] text-slate-400 hover:bg-white/[0.03] hover:text-slate-200 hover:border-white/[0.09]'
                }
              `}
            >
              <div
                className={`
                  w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 border
                  ${isSelected
                    ? 'bg-brand-500 text-white border-brand-400/50'
                    : 'bg-white/[0.03] text-slate-400 border-white/[0.06]'
                  }
                `}
              >
                {opt.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isSelected ? 'text-[#f7f8f8]' : 'text-slate-300'}`}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
