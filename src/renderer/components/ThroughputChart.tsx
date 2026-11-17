import React, { useMemo, useRef, useEffect, useState } from 'react';
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
  '#0ea5e9', // netflo blue   — Wi-Fi
  '#10b981', // emerald       — Ethernet
  '#f59e0b', // amber         — USB tether
  '#a78bfa', // violet        — 4th adapter
  '#f43f5e', // rose          — 5th adapter
];

const MAX_POINTS = 60; // 30 seconds of history at 500ms intervals

function formatBps(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)}M`;
  if (value >= 1024)      return `${(value / 1024).toFixed(0)}K`;
  return `${value}B`;
}

export function ThroughputChart({ adapters, stats }: ThroughputChartProps) {
  const [history, setHistory] = useState<DataPoint[]>([]);
  const prevStatsRef = useRef<AdapterStats[]>([]);

  // Append a new data point every time stats update
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
      <div className="flex h-full items-center justify-center text-slate-600 text-sm">
        No active adapters — start bonding to see throughput
      </div>
    );
  }

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {activeAdapters.map((adapter, i) => (
              <React.Fragment key={adapter.ifIndex}>
                <linearGradient id={`grad_rx_${adapter.ifIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.0} />
                </linearGradient>
              </React.Fragment>
            ))}
          </defs>

          <XAxis dataKey="t" hide />
          <YAxis
            tickFormatter={formatBps}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={48}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={() => ''}
            formatter={(value: number, name: string) => [
              formatBps(value) + '/s',
              name.replace('_rx', ' ↓').replace('_tx', ' ↑'),
            ]}
          />
          <Legend
            formatter={(value) =>
              value.replace('_rx', ' ↓').replace('_tx', ' ↑')
            }
            wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
          />

          {activeAdapters.map((adapter, i) => (
            <Area
              key={`${adapter.ifIndex}_rx`}
              type="monotone"
              dataKey={`${adapter.name}_rx`}
              name={`${adapter.name}_rx`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              fill={`url(#grad_rx_${adapter.ifIndex})`}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
