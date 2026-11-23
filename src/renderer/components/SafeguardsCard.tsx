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
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <IconShield size={11} />
          </div>
          <span className="section-label">Active Safeguards & QoS</span>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">Continuous Protection</span>
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06] rounded-lg overflow-hidden">
        {/* Meeting Shield Row */}
        <div className="py-3 px-3.5 flex items-center justify-between gap-4 interactive-row">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100">
                Zero-Drop Meeting Shield
              </span>
              {meetingShieldActive && (
                <span className="badge-green text-[10px]">
                  {protectedMeetingCount > 0
                    ? `${protectedMeetingCount} stream${protectedMeetingCount === 1 ? '' : 's'} shielded`
                    : 'Active'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Detects and isolates VoIP, Zoom, Google Meet, Microsoft Teams, and Discord traffic. Pins call packets to
              the lowest-jitter adapter so large uploads and downloads cannot cause audio glitching or frame drops.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={meetingShieldActive}
            onClick={() => onToggleMeetingShield(!meetingShieldActive)}
            disabled={disabled}
            className={`
              relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
              focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
              ${meetingShieldActive ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}
            `}
          >
            <span
              className={`
                inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                ${meetingShieldActive ? 'translate-x-3.5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>

        {/* Battery & Power Saver Row */}
        <div className="py-3 px-3.5 flex items-center justify-between gap-4 interactive-row">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100">
                Dynamic Power Saver
              </span>
              <span className={powerSaveMode ? 'badge-yellow text-[10px]' : 'badge-gray text-[10px]'}>
                {powerSaveMode ? 'Battery Mode' : 'Standard (AC)'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Dynamically relaxes health pings and interface telemetry polling from 500ms to 2.5s when running on battery
              power, extending laptop battery life.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={powerSaveMode}
            onClick={() => onTogglePowerSave(!powerSaveMode)}
            disabled={disabled}
            className={`
              relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
              focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
              ${powerSaveMode ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'bg-zinc-800'}
            `}
          >
            <span
              className={`
                inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                ${powerSaveMode ? 'translate-x-3.5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
