import React from 'react';
import type { NetFloStatus } from '../../../shared/types';
import { IconShield, IconBattery } from './Icons';

interface StatusBarProps {
  status: NetFloStatus;
  socksPort: number;
  meetingShieldActive?: boolean;
  powerSaveMode?: boolean;
}

const STATUS_CONFIG: Record<NetFloStatus, { label: string; color: string; dot: string }> = {
  stopped:  { label: 'Idle',     color: 'text-slate-400',   dot: 'bg-slate-500' },
  starting: { label: 'Starting', color: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse' },
  running:  { label: 'Running',  color: 'text-emerald-400', dot: 'bg-emerald-400' },
  stopping: { label: 'Stopping', color: 'text-amber-400',   dot: 'bg-amber-400 animate-pulse' },
  error:    { label: 'Error',    color: 'text-rose-400',    dot: 'bg-rose-400' },
};

export function StatusBar({
  status,
  socksPort,
  meetingShieldActive,
  powerSaveMode,
}: StatusBarProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;

  return (
    <div className="flex items-center gap-2.5 text-xs">
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${cfg.dot}`} />
        <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
      </div>

      {meetingShieldActive && (
        <span className="badge-green hidden sm:inline-flex items-center gap-1 text-[10px]" title="Zero-Drop Meeting Shield is active">
          <IconShield size={10} />
          <span>Shielded</span>
        </span>
      )}

      {powerSaveMode && (
        <span className="badge-yellow hidden sm:inline-flex items-center gap-1 text-[10px]" title="Power-Saver mode is active">
          <IconBattery size={10} />
          <span>Low Power</span>
        </span>
      )}

      {status === 'running' && (
        <span className="text-slate-500 font-mono text-[11px] hidden md:inline">
          SOCKS5 :{socksPort}
        </span>
      )}
    </div>
  );
}
