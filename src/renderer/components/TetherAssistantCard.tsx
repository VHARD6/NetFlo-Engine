import React, { useState } from 'react';
import type { TetherAssistantState } from '../../shared/types';
import { IconPhone, IconZap, IconCheck } from './Icons';

interface TetherAssistantCardProps {
  state: TetherAssistantState;
  onOptimize: () => void;
  isRunning: boolean;
}

export const TetherAssistantCard: React.FC<TetherAssistantCardProps> = ({ state, onOptimize, isRunning }) => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>('android');
  const [showInstructions, setShowInstructions] = useState(false);

  const isDetected = state.detected;
  const isOptimized = state.status === 'optimized';

  return (
    <div className="card space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400">
            <IconPhone size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[#f7f8f8]">Phone Tether Assistant</h3>
              <span className="badge-blue text-[10px] py-0 px-1.5">Auto-Protect</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Auto-detects USB tethering, applies metric 9999, and prevents Windows Wi-Fi auto-disconnect.
            </p>
          </div>
        </div>

        {/* Optimize Button */}
        <button
          type="button"
          onClick={onOptimize}
          className="btn-primary text-xs py-1.5 px-3"
        >
          <IconZap size={12} />
          <span>Optimize Now</span>
        </button>
      </div>

      {/* Detection Status Banner */}
      <div className="p-3 bg-surface-1 border border-white/[0.06] rounded-lg flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isOptimized
                ? 'bg-emerald-400'
                : isDetected
                ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <div className="min-w-0">
            <div className="font-medium text-slate-200 truncate">
              {isOptimized ? (
                <span>
                  Tether Protected &amp; Optimized:{' '}
                  <span className="font-mono text-emerald-400 font-semibold">{state.adapterName}</span>
                </span>
              ) : isDetected ? (
                <span className="text-amber-300">
                  Phone Detected ({state.adapterName}) — ready for auto-optimization
                </span>
              ) : (
                <span className="text-slate-400">Waiting for USB tether connection...</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {isOptimized
                ? 'Metric 9999 applied and WCM simultaneous policy locked. Ready to bond.'
                : 'Connect your iPhone or Android phone via USB cable and toggle USB Tethering.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowInstructions(!showInstructions)}
          className="text-[11px] text-brand-400 hover:text-brand-300 font-medium shrink-0 ml-3 cursor-pointer"
        >
          {showInstructions ? 'Hide Setup' : 'Setup Guide'}
        </button>
      </div>

      {/* Step-by-Step Guide */}
      {showInstructions && (
        <div className="p-3 bg-surface-1 border border-white/[0.06] rounded-lg space-y-2.5 text-xs">
          <div className="flex gap-1.5 border-b border-white/[0.05] pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === 'android' ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Android Setup
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === 'ios' ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              iOS (iPhone) Setup
            </button>
          </div>

          {activeTab === 'android' ? (
            <div className="text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">1.</span>
                <span>Connect your Android phone to your PC via a USB data cable.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">2.</span>
                <span>Open phone <strong>Settings</strong> &gt; <strong>Network &amp; Internet</strong> (or <strong>Connections</strong>).</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">3.</span>
                <span>Tap <strong>Hotspot &amp; Tethering</strong> and toggle <strong>USB Tethering</strong> ON.</span>
              </div>
              <div className="flex gap-2 text-emerald-400 pt-1 border-t border-white/[0.04]">
                <IconCheck size={13} className="shrink-0 mt-0.5" />
                <span>NetFlo will instantly detect the RNDIS adapter and apply metric 9999 automatically.</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">1.</span>
                <span>Connect iPhone to your PC via Lightning or USB-C cable (tap <em>Trust This Computer</em>).</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">2.</span>
                <span>Open iPhone <strong>Settings</strong> &gt; <strong>Personal Hotspot</strong>.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-mono text-sky-400">3.</span>
                <span>Enable <strong>Allow Others to Join</strong> (select <em>USB Only</em> if prompted).</span>
              </div>
              <div className="flex gap-2 text-emerald-400 pt-1 border-t border-white/[0.04]">
                <IconCheck size={13} className="shrink-0 mt-0.5" />
                <span>NetFlo detects the Apple Mobile Device Ethernet interface and locks concurrent Wi-Fi.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
