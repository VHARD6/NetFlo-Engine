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
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <span className="section-label">Phone Tether Assistant</span>
        <span
          className={
            isOptimized
              ? 'badge-green text-[10px]'
              : isDetected
              ? 'badge-yellow text-[10px]'
              : 'badge-gray text-[10px]'
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
              isOptimized ? 'bg-emerald-400' : isDetected ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'
            }`}
          />
          {isOptimized ? 'Metric 9999 Protected' : isDetected ? 'Tether Detected' : 'No Phone Tether'}
        </span>
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {/* Main status row */}
        <div className="py-3 px-3 flex items-center justify-between gap-4 interactive-row">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100">
              Windows WCM Multi-Homing & USB Priority Fix
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Windows natively disconnects Wi-Fi when USB cellular tethering is connected. NetFlo prevents this disconnect
              and pins the tether interface metric to 9999, allowing Wi-Fi and 5G to bond simultaneously.
            </p>
          </div>

          <button
            type="button"
            onClick={onOptimize}
            disabled={!isRunning}
            className="btn-ghost text-xs py-1 px-2.5 shrink-0"
          >
            <IconZap size={11} className="text-brand-400" />
            <span>Optimize Now</span>
          </button>
        </div>

        {/* Instructions toggle row */}
        <div className="py-2 px-3 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {showInstructions ? 'Hide Setup Guides' : 'View Phone Tether Setup Guide (iOS / Android)'}
          </button>
        </div>

        {/* Expandable guide */}
        {showInstructions && (
          <div className="py-3 px-3 bg-white/[0.015] space-y-2.5 text-xs text-zinc-300">
            <div className="flex gap-2 border-b border-white/[0.05] pb-2">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`text-[11px] font-medium transition-colors ${
                  activeTab === 'android' ? 'text-white border-b border-brand-400 pb-0.5' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Android Setup
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`text-[11px] font-medium transition-colors ${
                  activeTab === 'ios' ? 'text-white border-b border-brand-400 pb-0.5' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                iOS / iPhone Setup
              </button>
            </div>

            {activeTab === 'android' ? (
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                <li>Connect phone to PC with a high-speed USB-C cable.</li>
                <li>Open phone <strong className="text-zinc-200">Settings &rarr; Network & internet &rarr; Hotspot & tethering</strong>.</li>
                <li>Enable <strong className="text-zinc-200">USB tethering</strong>. NetFlo will auto-detect and protect the connection.</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                <li>Connect iPhone to PC with a Lightning / USB-C cable.</li>
                <li>Tap <strong className="text-zinc-200">Trust This Computer</strong> on your iPhone.</li>
                <li>Open <strong className="text-zinc-200">Settings &rarr; Personal Hotspot</strong> and turn on <strong className="text-zinc-200">Allow Others to Join</strong>.</li>
                <li>Select "USB Only" when prompted. NetFlo will bond it with Wi-Fi.</li>
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
