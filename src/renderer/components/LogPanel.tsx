import React, { useEffect, useRef, useState } from 'react';
import { IconTerminal, IconCopy, IconTrash, IconCheck } from './Icons';

interface LogPanelProps {
  logs: string[];
}

export function LogPanel({ logs }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyAll = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter(line => {
    if (filter === 'error') return line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');
    if (filter === 'warn') return line.toLowerCase().includes('warn') || line.toLowerCase().includes('killer');
    return true;
  });

  return (
    <div className="h-full flex flex-col min-h-0 bg-surface-1 border border-white/[0.06] rounded-[10px] p-3 text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] shrink-0 mb-2">
        <div className="flex items-center gap-2">
          <IconTerminal size={13} className="text-slate-400" />
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            System Event Log
          </span>
          <span className="badge-gray text-[10px] py-0 font-mono">
            {logs.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 mr-2 text-[10px]">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'all' ? 'bg-white/[0.1] text-white font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('warn')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'warn' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Warnings
            </button>
            <button
              type="button"
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'error' ? 'bg-rose-500/20 text-rose-300 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Errors
            </button>
          </div>

          <button
            type="button"
            onClick={copyAll}
            disabled={logs.length === 0}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-white/[0.05] transition-colors disabled:opacity-30 cursor-pointer"
            title="Copy logs to clipboard"
          >
            {copied ? <IconCheck size={12} className="text-emerald-400" /> : <IconCopy size={12} />}
          </button>
        </div>
      </div>

      {/* Log lines */}
      {filteredLogs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-xs font-mono">
          No log entries recorded
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1 pr-1 leading-relaxed select-text">
          {filteredLogs.map((rawLine, i) => {
            // Strip any emojis from existing logs
            const cleanLine = rawLine.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            const isError = cleanLine.toLowerCase().includes('error') || cleanLine.toLowerCase().includes('failed');
            const isWarning = cleanLine.toLowerCase().includes('warning') || cleanLine.toLowerCase().includes('killer') || cleanLine.toLowerCase().includes('rejected');
            const isSuccess = cleanLine.toLowerCase().includes('listening') || cleanLine.toLowerCase().includes('applied') || cleanLine.toLowerCase().includes('connected');

            return (
              <div
                key={i}
                className={`break-all flex items-start gap-2 ${
                  isError
                    ? 'text-rose-400'
                    : isWarning
                    ? 'text-amber-400'
                    : isSuccess
                    ? 'text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-600 select-none text-[10px]">
                  {String(i + 1).padStart(3, '0')}
                </span>
                <span>{cleanLine}</span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
