import React from 'react';
import { IconAlert } from './Icons';

interface KillerWarningProps {
  services: string[];
  onOpenSettings: () => void;
}

export function KillerWarning({ services, onOpenSettings }: KillerWarningProps) {
  return (
    <div className="rounded-[10px] border border-amber-500/30 bg-amber-500/[0.08] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <IconAlert size={15} className="text-amber-400 shrink-0" />
        <div className="text-xs font-semibold text-amber-300">
          Intel Killer Prioritization Engine Detected
        </div>
      </div>
      <div className="text-[11px] text-amber-200/80 leading-relaxed">
        The Killer Network Service overrides Windows sockets and forces streams to a single adapter, preventing bonding. Disable{' '}
        <span className="text-amber-300 font-medium">"Prioritization Engine"</span> in Killer Control Center.
      </div>
      <div className="text-[10px] text-amber-400/70 font-mono">
        Active services: {services.join(', ')}
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full text-xs py-1.5 px-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-md font-medium transition-colors cursor-pointer"
      >
        Open Killer Control Center
      </button>
    </div>
  );
}
