import React, { useState } from 'react';
import type { BridgeState } from '../../shared/types';
import { IconBridge, IconCopy, IconCheck } from './Icons';

interface BridgeCardProps {
  bridge: BridgeState;
  isRunning: boolean;
}

export const BridgeCard: React.FC<BridgeCardProps> = ({ bridge, isRunning }) => {
  const [copied, setCopied] = useState(false);
  const endpoint = `http://127.0.0.1:${bridge.port}/api/status`;

  const copyEndpoint = () => {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
            <IconBridge size={11} />
          </div>
          <span className="section-label">Download Manager Bridge API</span>
        </div>

        <span className={isRunning ? 'badge-green text-[10px]' : 'badge-gray text-[10px]'}>
          {isRunning ? `127.0.0.1:${bridge.port}` : 'Bridge Idle'}
        </span>
      </div>

      <div className="py-3 px-3.5 border-y border-white/[0.06] rounded-lg flex items-center justify-between gap-4 interactive-row text-xs bg-white/[0.01]">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-zinc-100">
            Local Multi-Stream Aggregation IPC
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
            REST API endpoint allowing NetFlo Download Manager or browser extensions to coordinate parallel chunk
            streams across multiple bonded interfaces.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs shrink-0">
          <span className="text-indigo-300 bg-white/[0.03] px-2.5 py-1 rounded border border-white/[0.08] shadow-sm">
            {endpoint}
          </span>
          <button
            type="button"
            onClick={copyEndpoint}
            className="text-zinc-400 hover:text-white p-1 transition-colors"
            title="Copy API endpoint"
          >
            {copied ? <IconCheck size={12} className="text-emerald-400" /> : <IconCopy size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
};
