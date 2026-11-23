import React from 'react';
import type { BridgeState } from '../../shared/types';

interface BridgeCardProps {
  bridge: BridgeState;
  isRunning: boolean;
}

export const BridgeCard: React.FC<BridgeCardProps> = ({ bridge, isRunning }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-base">NetFlo Download Manager Bridge</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 3
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Inter-process API allowing NetFlo Download Manager to coordinate multi-chunk stream aggregation.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isRunning
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {isRunning ? `Listening on 127.0.0.1:${bridge.port}` : 'Bridge Idle'}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-300 flex justify-between items-center">
          <span>Bridge Endpoint:</span>
          <span className="font-mono text-indigo-300 font-medium">http://127.0.0.1:{bridge.port}/api/status</span>
        </div>
        <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-300 flex justify-between items-center">
          <span>Sync Status:</span>
          <span className="text-slate-200">
            {bridge.connectedClients > 0
              ? `⚡ ${bridge.connectedClients} Download Client(s) Synced`
              : 'Waiting for Download Manager connection'}
          </span>
        </div>
      </div>
    </div>
  );
};
