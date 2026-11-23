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
    <div className="card space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/25 flex items-center justify-center text-brand-400">
            <IconBridge size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[#f7f8f8]">Download Manager Bridge</h3>
              <span className="badge-purple text-[10px] py-0 px-1.5">IPC API</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Inter-process API allowing NetFlo Download Manager to coordinate multi-chunk stream aggregation.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span
            className={`badge text-[11px] font-mono ${
              isRunning ? 'badge-green' : 'badge-gray'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isRunning ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {isRunning ? `127.0.0.1:${bridge.port}` : 'Bridge Idle'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        <div className="p-2.5 bg-surface-1 border border-white/[0.06] rounded-lg text-slate-300 flex justify-between items-center">
          <span className="text-[11px] text-slate-400">Bridge Endpoint:</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-brand-300 text-[11px]">{endpoint}</span>
            <button
              type="button"
              onClick={copyEndpoint}
              className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 cursor-pointer"
              title="Copy endpoint"
            >
              {copied ? <IconCheck size={11} className="text-emerald-400" /> : <IconCopy size={11} />}
            </button>
          </div>
        </div>

        <div className="p-2.5 bg-surface-1 border border-white/[0.06] rounded-lg text-slate-300 flex justify-between items-center">
          <span className="text-[11px] text-slate-400">Sync Status:</span>
          <span className="text-[11px] font-medium text-slate-200">
            {bridge.connectedClients > 0
              ? `${bridge.connectedClients} Download Client(s) Synced`
              : 'Waiting for Download Manager link'}
          </span>
        </div>
      </div>
    </div>
  );
};
