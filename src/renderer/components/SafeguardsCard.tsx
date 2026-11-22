import React from 'react';

interface SafeguardsCardProps {
  meetingShieldActive: boolean;
  protectedMeetingCount: number;
  powerSaveMode: boolean;
  onToggleMeetingShield: (active: boolean) => void;
  onTogglePowerSave: (enabled: boolean) => void;
  disabled: boolean;
}

export function SafeguardsCard({
  meetingShieldActive,
  protectedMeetingCount,
  powerSaveMode,
  onToggleMeetingShield,
  onTogglePowerSave,
  disabled,
}: SafeguardsCardProps) {
  return (
    <div className="card space-y-3">
      <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">
        Daily Safeguards
      </div>

      {/* Meeting Shield Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <span>Zero-Drop Meeting Shield</span>
            {meetingShieldActive && (
              <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 px-1 rounded font-medium">
                Active
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {protectedMeetingCount > 0
              ? `🛡️ Protected ${protectedMeetingCount} meeting flow${protectedMeetingCount === 1 ? '' : 's'}`
              : 'Auto-shields Zoom, Teams, Meet & Discord calls'}
          </div>
        </div>

        <button
          role="switch"
          aria-checked={meetingShieldActive}
          onClick={() => onToggleMeetingShield(!meetingShieldActive)}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${meetingShieldActive ? 'bg-emerald-600' : 'bg-slate-600'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
              ${meetingShieldActive ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* Power Saver Mode Toggle */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-700/50 pt-2.5">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <span>Battery & Power Saver</span>
            <span
              className={`text-[10px] px-1 rounded font-medium ${
                powerSaveMode
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {powerSaveMode ? '🔋 On' : '⚡ Normal'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Relaxes polling & ping rates to save laptop battery
          </div>
        </div>

        <button
          role="switch"
          aria-checked={powerSaveMode}
          onClick={() => onTogglePowerSave(!powerSaveMode)}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${powerSaveMode ? 'bg-amber-600' : 'bg-slate-600'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
              ${powerSaveMode ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
    </div>
  );
}
