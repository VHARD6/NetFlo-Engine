import React from 'react';
import type { DispatchMode } from '../../../shared/types';

interface ModeSelectorProps {
  mode: DispatchMode;
  onChange: (mode: DispatchMode) => void;
  disabled: boolean;
}

interface ModeOption {
  value: DispatchMode;
  label: string;
  icon: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    value: 'round-robin',
    label: 'Round-Robin',
    icon: '⚖️',
    description: 'Spread all connections evenly across adapters',
  },
  {
    value: 'failover',
    label: 'Failover',
    icon: '🛡️',
    description: 'Use primary adapter; switch to backup if it fails',
  },
  {
    value: 'gaming',
    label: 'Gaming Mode',
    icon: '🎮',
    description: 'Bond downloads (HTTP/S), pin game UDP to fastest adapter',
  },
];

export function ModeSelector({ mode, onChange, disabled }: ModeSelectorProps) {
  return (
    <div className="card space-y-2">
      <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">
        Bonding Mode
      </div>
      <div className="space-y-1.5">
        {MODES.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`
              w-full text-left rounded-lg px-3 py-2.5 transition-all duration-150
              border flex items-start gap-3
              disabled:opacity-40 disabled:cursor-not-allowed
              ${mode === opt.value
                ? 'bg-netflo-600/20 border-netflo-500/50 text-netflo-300'
                : 'bg-slate-700/30 border-slate-700/40 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
              }
            `}
          >
            <span className="text-lg shrink-0 mt-0.5">{opt.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{opt.description}</div>
            </div>
            {mode === opt.value && (
              <span className="ml-auto shrink-0 text-netflo-400 mt-0.5">●</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
