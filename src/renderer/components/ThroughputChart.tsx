import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { NetworkAdapter, AdapterStats } from '../../../shared/types';

interface ThroughputChartProps {
  adapters: NetworkAdapter[];
  stats: AdapterStats[];
}

interface DataPoint {
  t: number;
  [adapterName: string]: number;
}

const COLORS = [
  '#6366f1', // Electric Indigo
  '#38bdf8', // Electric Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
];

const MAX_POINTS = 60; // 30 seconds of history at 500ms intervals

function formatBps(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024)      return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

export function ThroughputChart({ adapters, stats }: ThroughputChartProps) {
  const [history, setHistory] = useState<DataPoint[]>([]);

  useEffect(() => {
    if (stats.length === 0) return;

    const point: DataPoint = { t: Date.now() };
    for (const s of stats) {
      point[`${s.name}_rx`] = s.rxBps;
      point[`${s.name}_tx`] = s.txBps;
    }

    setHistory(prev => {
      const next = [...prev, point];
      return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
    });
  }, [stats]);

  const activeAdapters = adapters.filter(
    a => a.status === 'connected' && a.includedInBonding
  );

  if (activeAdapters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-600 text-xs font-mono">
        Waiting for active bonded streams...
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
          <defs>
            {activeAdapters.map((adapter, i) => (
              <React.Fragment key={adapter.ifIndex}>
                <linearGradient id={`grad_rx_${adapter.ifIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id={`grad_tx_${adapter.ifIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.0} />
                </linearGradient>
              </React.Fragment>
            ))}
          </defs>

          <XAxis dataKey="t" hide />
          <YAxis
            tickFormatter={formatBps}
            tick={{ fontSize: 9, fill: '#71717a', fontFamily: 'monospace' }}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0e1017',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'monospace',
              color: '#f4f4f5',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              padding: '6px 10px',
            }}
            labelFormatter={() => ''}
            formatter={(value: number, name: string) => [
              formatBps(value) + '/s',
              name.replace('_rx', ' Download').replace('_tx', ' Upload'),
            ]}
          />
          <Legend
            formatter={(value) => (
              <span className="text-[10px] text-zinc-400 font-mono">
                {value.replace('_rx', ' (Down)').replace('_tx', ' (Up)')}
              </span>
            )}
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
          />

          {activeAdapters.map((adapter, i) => (
            <React.Fragment key={adapter.ifIndex}>
              <Area
                type="monotone"
                dataKey={`${adapter.name}_rx`}
                name={`${adapter.name}_rx`}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.5}
                fill={`url(#grad_rx_${adapter.ifIndex})`}
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey={`${adapter.name}_tx`}
                name={`${adapter.name}_tx`}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                fill={`url(#grad_tx_${adapter.ifIndex})`}
                dot={false}
                isAnimationActive={false}
              />
            </React.Fragment>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
