import React, { useState, useEffect } from 'react';
import type { AppRule, NetworkAdapter, DispatchMode } from '../../../shared/types';

interface AppRoutingCardProps {
  rules: AppRule[];
  adapters: NetworkAdapter[];
  onUpdateRules: (rules: AppRule[]) => void;
  onGetRunningApps: () => Promise<string[]>;
  disabled: boolean;
}

export function AppRoutingCard({
  rules,
  adapters,
  onUpdateRules,
  onGetRunningApps,
  disabled,
}: AppRoutingCardProps) {
  const [runningApps, setRunningApps] = useState<string[]>([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [customProcess, setCustomProcess] = useState('');
  const [targetMode, setTargetMode] = useState<DispatchMode>('gaming');
  const [pinnedAdapter, setPinnedAdapter] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    onGetRunningApps()
      .then(apps => {
        setRunningApps(apps);
        if (apps.length > 0 && !selectedProcess) {
          setSelectedProcess(apps[0]);
        }
      })
      .catch(() => {});
  }, [onGetRunningApps]);

  const handleToggleRule = (id: string) => {
    const next = rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    onUpdateRules(next);
  };

  const handleDeleteRule = (id: string) => {
    onUpdateRules(rules.filter(r => r.id !== id));
  };

  const handleAddRule = () => {
    const proc = (customProcess.trim() || selectedProcess).toLowerCase();
    if (!proc) return;

    // Avoid duplicate rule for same process
    if (rules.some(r => r.processName.toLowerCase() === proc)) {
      return;
    }

    const newRule: AppRule = {
      id: 'rule_' + Date.now(),
      processName: proc,
      mode: pinnedAdapter === null ? targetMode : null,
      pinnedAdapterIndex: pinnedAdapter,
      enabled: true,
    };

    onUpdateRules([...rules, newRule]);
    setCustomProcess('');
    setShowAddForm(false);
  };

  const applyPreset = (preset: 'gaming' | 'streaming') => {
    const newRules = [...rules];
    if (preset === 'gaming') {
      const presets = [
        { name: 'discord.exe', mode: 'gaming' as const },
        { name: 'steam.exe', mode: 'round-robin' as const },
        { name: 'cs2.exe', mode: 'gaming' as const },
      ];
      for (const p of presets) {
        if (!newRules.some(r => r.processName.toLowerCase() === p.name)) {
          newRules.push({
            id: 'preset_' + p.name,
            processName: p.name,
            mode: p.mode,
            pinnedAdapterIndex: null,
            enabled: true,
          });
        }
      }
    } else if (preset === 'streaming') {
      const streamAdap = adapters.find(a => a.type === 'ethernet' || a.speedMbps > 100);
      if (!newRules.some(r => r.processName.toLowerCase() === 'obs64.exe')) {
        newRules.push({
          id: 'preset_obs64.exe',
          processName: 'obs64.exe',
          mode: null,
          pinnedAdapterIndex: streamAdap ? streamAdap.ifIndex : null,
          enabled: true,
        });
      }
    }
    onUpdateRules(newRules);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
          <span>⚡ Per-App Split Tunneling</span>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={disabled}
          className="text-[11px] text-netflo-400 hover:text-netflo-300 font-medium transition-colors"
        >
          {showAddForm ? '✕ Close' : '+ Add Rule'}
        </button>
      </div>

      {/* Quick Presets */}
      <div className="flex gap-2">
        <button
          onClick={() => applyPreset('gaming')}
          disabled={disabled}
          className="btn-ghost flex-1 text-[11px] py-1 border border-slate-700/80 rounded"
        >
          🎮 Gaming Preset
        </button>
        <button
          onClick={() => applyPreset('streaming')}
          disabled={disabled}
          className="btn-ghost flex-1 text-[11px] py-1 border border-slate-700/80 rounded"
        >
          🎥 Streaming Preset
        </button>
      </div>

      {/* Add rule dialog */}
      {showAddForm && (
        <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/80 space-y-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Select Running Application:</label>
            <select
              value={selectedProcess}
              onChange={e => setSelectedProcess(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            >
              {runningApps.map(app => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Or type process name (e.g. game.exe):</label>
            <input
              type="text"
              placeholder="e.g. valorant.exe"
              value={customProcess}
              onChange={e => setCustomProcess(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Route Mode:</label>
              <select
                value={targetMode}
                onChange={e => setTargetMode(e.target.value as DispatchMode)}
                disabled={pinnedAdapter !== null}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value="gaming">Gaming (Low Ping)</option>
                <option value="round-robin">Round-Robin (Aggregated)</option>
                <option value="failover">Failover (Primary)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Pin to Adapter:</label>
              <select
                value={pinnedAdapter ?? ''}
                onChange={e => setPinnedAdapter(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value="">No Pin (Use Mode)</option>
                {adapters.map(a => (
                  <option key={a.ifIndex} value={a.ifIndex}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleAddRule}
            className="btn-primary w-full text-xs py-1 mt-1 font-medium"
          >
            Save Rule
          </button>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-2">
            No per-application rules configured
          </div>
        ) : (
          rules.map(rule => {
            const pinnedName = rule.pinnedAdapterIndex
              ? adapters.find(a => a.ifIndex === rule.pinnedAdapterIndex)?.name ?? `Adapter ${rule.pinnedAdapterIndex}`
              : null;

            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-2 rounded border text-xs transition-colors ${
                  rule.enabled
                    ? 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="font-mono font-medium truncate">{rule.processName}</div>
                  <div className="text-[11px] text-slate-400">
                    {pinnedName ? `Pinned → ${pinnedName}` : `Mode → ${rule.mode ?? 'Default'}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    role="switch"
                    aria-checked={rule.enabled}
                    onClick={() => handleToggleRule(rule.id)}
                    disabled={disabled}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      rule.enabled ? 'bg-netflo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    disabled={disabled}
                    className="text-slate-500 hover:text-rose-400 transition-colors text-xs"
                    title="Remove rule"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
