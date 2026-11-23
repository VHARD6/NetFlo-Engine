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
  '#5e6ad2', // Linear purple
  '#38bdf8', // electric cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
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
      <div className="flex h-full items-center justify-center text-slate-500 text-xs font-mono">
        Waiting for active bonded connections...
      </div>
    );
  }

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
          <defs>
            {activeAdapters.map((adapter, i) => (
              <React.Fragment key={adapter.ifIndex}>
                <linearGradient id={`grad_rx_${adapter.ifIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.0} />
                </linearGradient>
              </React.Fragment>
            ))}
          </defs>

          <XAxis dataKey="t" hide />
          <YAxis
            tickFormatter={formatBps}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={52}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#15161b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              fontSize: 11,
              color: '#f7f8f8',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            }}
            labelFormatter={() => ''}
            formatter={(value: number, name: string) => [
              formatBps(value) + '/s',
              name.replace('_rx', ' Download').replace('_tx', ' Upload'),
            ]}
          />
          <Legend
            formatter={(value) => (
              <span className="text-[11px] text-slate-400 font-mono">
                {value.replace('_rx', ' (Down)').replace('_tx', ' (Up)')}
              </span>
            )}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          />

          {activeAdapters.map((adapter, i) => (
            <Area
              key={`${adapter.ifIndex}_rx`}
              type="monotone"
              dataKey={`${adapter.name}_rx`}
              name={`${adapter.name}_rx`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.75}
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
