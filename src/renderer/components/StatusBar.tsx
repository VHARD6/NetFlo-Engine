import React from 'react';
import type { NetFloStatus } from '../../../shared/types';

interface StatusBarProps {
  status: NetFloStatus;
  socksPort: number;
  meetingShieldActive?: boolean;
  powerSaveMode?: boolean;
}

const STATUS_CONFIG: Record<NetFloStatus, { label: string; color: string; dot: string }> = {
  stopped:  { label: 'Stopped',  color: 'text-slate-400', dot: 'bg-slate-500' },
  starting: { label: 'Starting', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  running:  { label: 'Running',  color: 'text-emerald-400', dot: 'bg-emerald-400' },
  stopping: { label: 'Stopping', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  error:    { label: 'Error',    color: 'text-red-400', dot: 'bg-red-400' },
};

export function StatusBar({
  status,
  socksPort,
  meetingShieldActive,
  powerSaveMode,
}: StatusBarProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${cfg.dot}`} />
        <span className={cfg.color}>{cfg.label}</span>
      </div>

      {meetingShieldActive && (
        <span className="text-[11px] text-emerald-400/90 font-medium hidden sm:inline" title="Zero-Drop Meeting Shield is active">
          🛡️ Shielded
        </span>
      )}

      {powerSaveMode && (
        <span className="text-[11px] text-amber-400/90 font-medium hidden sm:inline" title="Power-Saver mode is active">
          🔋 Battery
        </span>
      )}

      {status === 'running' && (
        <span className="text-slate-600 font-mono">
          SOCKS5 :{socksPort}
        </span>
      )}
    </div>
  );
}

