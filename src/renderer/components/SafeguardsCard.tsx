import React from 'react';
import { IconShield, IconBattery } from './Icons';

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
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
          Daily Safeguards
        </span>
        <span className="text-[10px] text-slate-500 font-mono">Automated QoS</span>
      </div>

      {/* Meeting Shield Toggle */}
      <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-1 border border-white/[0.05]">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`
              w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border
              ${meetingShieldActive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-white/[0.03] text-slate-500 border-white/[0.06]'
              }
            `}
          >
            <IconShield size={14} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#f7f8f8]">Zero-Drop Meeting Shield</span>
              {meetingShieldActive && (
                <span className="badge-green text-[10px] py-0 px-1.5">Active</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {protectedMeetingCount > 0
                ? `Protected ${protectedMeetingCount} active VoIP/meeting stream${protectedMeetingCount === 1 ? '' : 's'}`
                : 'Prevents dropped calls on Zoom, Teams, Google Meet & Discord'}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={meetingShieldActive}
          onClick={() => onToggleMeetingShield(!meetingShieldActive)}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${meetingShieldActive ? 'bg-emerald-500' : 'bg-surface-4'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
              ${meetingShieldActive ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* Power Saver Mode Toggle */}
      <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-1 border border-white/[0.05]">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`
              w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border
              ${powerSaveMode
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'bg-white/[0.03] text-slate-500 border-white/[0.06]'
              }
            `}
          >
            <IconBattery size={14} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#f7f8f8]">Battery & Power Saver</span>
              <span className={powerSaveMode ? 'badge-yellow text-[10px] py-0 px-1.5' : 'badge-gray text-[10px] py-0 px-1.5'}>
                {powerSaveMode ? 'Low Power' : 'Standard'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Relaxes background polling and health pings to conserve laptop battery
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={powerSaveMode}
          onClick={() => onTogglePowerSave(!powerSaveMode)}
          disabled={disabled}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${powerSaveMode ? 'bg-amber-500' : 'bg-surface-4'}
          `}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
              ${powerSaveMode ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
    </div>
  );
}
