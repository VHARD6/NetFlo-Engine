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
    <div className="h-full flex flex-col min-h-0 text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span className="section-label">System Diagnostics & Event Log</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {logs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <div className="flex gap-1 border-r border-white/[0.06] pr-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'all' ? 'bg-white/[0.1] text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter('warn')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'warn' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Warn
            </button>
            <button
              type="button"
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === 'error' ? 'bg-rose-500/20 text-rose-300 font-medium' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Error
            </button>
          </div>

          <button
            type="button"
            onClick={copyAll}
            className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            {copied ? <IconCheck size={11} className="text-emerald-400" /> : <IconCopy size={11} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Terminal log output */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed py-2 space-y-0.5 select-text">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-zinc-600">
            No system events recorded
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isErr = log.toLowerCase().includes('error') || log.toLowerCase().includes('failed');
            const isWarn = log.toLowerCase().includes('warn') || log.toLowerCase().includes('killer');
            const isTurbo = log.includes('[Auto-Turbo]');
            const isShield = log.includes('[Meeting Shield]');
            const isProxy = log.includes('[SystemProxy]');

            return (
              <div
                key={i}
                className={`py-0.5 px-1.5 rounded transition-colors hover:bg-white/[0.03] ${
                  isErr
                    ? 'text-rose-400 bg-rose-500/5'
                    : isWarn
                    ? 'text-amber-400 bg-amber-500/5'
                    : isTurbo
                    ? 'text-sky-300'
                    : isShield
                    ? 'text-emerald-400'
                    : isProxy
                    ? 'text-indigo-300'
                    : 'text-zinc-400'
                }`}
              >
                <span className="text-zinc-600 select-none mr-2">{(i + 1).toString().padStart(3, '0')}</span>
                <span>{log}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
