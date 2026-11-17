import React from 'react';

interface KillerWarningProps {
  services: string[];
  onOpenSettings: () => void;
}

export function KillerWarning({ services, onOpenSettings }: KillerWarningProps) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚠️</span>
        <div className="text-sm font-medium text-amber-300">
          Intel Killer Suite Detected
        </div>
      </div>
      <div className="text-xs text-amber-200/70 leading-relaxed">
        The Killer Prioritization Engine will redirect all traffic to one adapter,
        fighting NetFlo's bonding. Disable{' '}
        <span className="text-amber-300 font-medium">
          "Killer Prioritization"
        </span>{' '}
        in Killer Control Center (you don't need to uninstall).
      </div>
      <div className="text-xs text-amber-500/60">
        Running: {services.join(', ')}
      </div>
      <button
        onClick={onOpenSettings}
        className="btn text-xs py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg w-full"
      >
        Open Killer Control Center →
      </button>
    </div>
  );
}
