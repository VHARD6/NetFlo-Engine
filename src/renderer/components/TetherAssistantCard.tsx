import React, { useState } from 'react';
import type { TetherAssistantState } from '../../shared/types';

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
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-base">One-Click Phone Tether Assistant</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Phase 3
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Auto-detects USB tethering, applies metric 9999, and prevents Windows Wi-Fi auto-disconnect.
            </p>
          </div>
        </div>

        {/* Manual Optimize Button */}
        <button
          onClick={onOptimize}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center gap-1.5 shadow"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Optimize Now
        </button>
      </div>

      {/* Detection Status Banner */}
      <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-3 h-3 rounded-full ${
              isOptimized
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                : isDetected
                ? 'bg-amber-400 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <div>
            <div className="text-xs font-medium text-slate-200">
              {isOptimized ? (
                <span>
                  🟢 Tether Adapter Protected &amp; Optimized:{' '}
                  <span className="font-mono text-emerald-300 font-semibold">{state.adapterName}</span>
                </span>
              ) : isDetected ? (
                <span>
                  🟡 Phone Detected ({state.adapterName}) — ready for auto-optimization
                </span>
              ) : (
                <span className="text-slate-400">⚪ Waiting for USB tether connection...</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isOptimized
                ? 'Metric 9999 applied + WCM simultaneous policy locked. Ready to bond.'
                : 'Connect your iPhone or Android phone via USB cable and turn on Tethering.'}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
        >
          {showInstructions ? 'Hide Guide' : 'Setup Guide'}
        </button>
      </div>

      {/* Step-by-Step Accordion / Guide */}
      {showInstructions && (
        <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-lg space-y-3">
          <div className="flex gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveTab('android')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'android' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Android Setup
            </button>
            <button
              onClick={() => setActiveTab('ios')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'ios' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              iOS (iPhone) Setup
            </button>
          </div>

          {activeTab === 'android' ? (
            <div className="text-xs text-slate-300 space-y-1.5">
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">1.</span>
                <span>Connect your Android phone to your PC via a USB cable.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">2.</span>
                <span>Open phone <strong>Settings</strong> &gt; <strong>Network &amp; Internet</strong> (or <strong>Connections</strong>).</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">3.</span>
                <span>Tap <strong>Hotspot &amp; Tethering</strong> and toggle <strong>USB Tethering</strong> ON.</span>
              </div>
              <div className="flex gap-2 text-emerald-300">
                <span className="font-bold">✓</span>
                <span>NetFlo will instantly detect the RNDIS adapter and apply metric 9999 automatically!</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-300 space-y-1.5">
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">1.</span>
                <span>Connect iPhone to your PC via Lightning or USB-C cable (tap <em>Trust This Computer</em>).</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">2.</span>
                <span>Open iPhone <strong>Settings</strong> &gt; <strong>Personal Hotspot</strong>.</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-sky-400">3.</span>
                <span>Enable <strong>Allow Others to Join</strong> (select <em>USB Only</em> if prompted).</span>
              </div>
              <div className="flex gap-2 text-emerald-300">
                <span className="font-bold">✓</span>
                <span>NetFlo detects the Apple Mobile Device Ethernet interface and locks concurrent Wi-Fi!</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
