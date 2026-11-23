import React from 'react';
import { IconAlert } from './Icons';

interface KillerWarningProps {
  services: string[];
  onOpenSettings: () => void;
}

export function KillerWarning({ services, onOpenSettings }: KillerWarningProps) {
  return (
    <div className="border-b border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
      <div className="flex items-start gap-2.5 min-w-0">
        <IconAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="font-semibold text-amber-200">
            Intel Killer Prioritization Engine Detected
          </span>
          <span className="text-amber-300/80 ml-2">
            Forces all streams onto a single adapter. Disable "Prioritization Engine" in Killer Control Center.
          </span>
          <span className="text-[10px] text-amber-400/60 font-mono ml-2">
            ({services.join(', ')})
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className="text-[11px] font-medium text-amber-300 hover:text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2.5 py-1 rounded transition-colors shrink-0"
      >
        Open Killer Control
      </button>
    </div>
  );
}
