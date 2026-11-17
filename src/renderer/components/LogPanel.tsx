import React, { useEffect, useRef } from 'react';

interface LogPanelProps {
  logs: string[];
}

export function LogPanel({ logs }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new log lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-600 text-xs">
        No log output yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto font-mono text-xs space-y-0.5 pr-1">
      {logs.map((line, i) => {
        const isError   = line.includes('error') || line.includes('Error') || line.includes('failed');
        const isWarning = line.includes('⚠️') || line.includes('Warning') || line.includes('Killer');
        const isSuccess = line.includes('✓') || line.includes('applied') || line.includes('started');

        return (
          <div
            key={i}
            className={`
              leading-relaxed break-all
              ${isError   ? 'text-red-400'     : ''}
              ${isWarning ? 'text-amber-400'   : ''}
              ${isSuccess ? 'text-emerald-400' : ''}
              ${!isError && !isWarning && !isSuccess ? 'text-slate-500' : ''}
            `}
          >
            {line}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
