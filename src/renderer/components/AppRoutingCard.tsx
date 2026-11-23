import React, { useState, useEffect } from 'react';
import type { AppRule, NetworkAdapter, DispatchMode } from '../../../shared/types';
import { IconSplit, IconPlus, IconCross, IconTrash } from './Icons';

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
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/[0.03] border border-white/[0.06] text-slate-400 flex items-center justify-center">
            <IconSplit size={13} />
          </div>
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            Per-App Split Tunneling
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={disabled}
          className="text-[11px] text-brand-400 hover:text-brand-300 font-medium transition-colors flex items-center gap-1 cursor-pointer"
        >
          {showAddForm ? (
            <>
              <IconCross size={11} />
              <span>Cancel</span>
            </>
          ) : (
            <>
              <IconPlus size={11} />
              <span>Add Rule</span>
            </>
          )}
        </button>
      </div>

      {/* Quick Presets */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => applyPreset('gaming')}
          disabled={disabled}
          className="btn-ghost flex-1 text-[11px] py-1 border border-white/[0.06] rounded-md font-medium"
        >
          Gaming Preset (Discord / Steam / CS2)
        </button>
        <button
          type="button"
          onClick={() => applyPreset('streaming')}
          disabled={disabled}
          className="btn-ghost flex-1 text-[11px] py-1 border border-white/[0.06] rounded-md font-medium"
        >
          Stream Preset (OBS Studio Pin)
        </button>
      </div>

      {/* Add rule dialog */}
      {showAddForm && (
        <div className="bg-surface-1 p-3 rounded-lg border border-white/[0.07] space-y-2.5 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1 font-medium">
              Select Running Process:
            </label>
            <select
              value={selectedProcess}
              onChange={e => setSelectedProcess(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-brand-500/60 font-mono"
            >
              {runningApps.map(app => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1 font-medium">
              Or Custom Executable Name:
            </label>
            <input
              type="text"
              placeholder="e.g. valorant.exe"
              value={customProcess}
              onChange={e => setCustomProcess(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-brand-500/60 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1 font-medium">
                Route Mode:
              </label>
              <select
                value={targetMode}
                onChange={e => setTargetMode(e.target.value as DispatchMode)}
                disabled={pinnedAdapter !== null}
                className="w-full bg-surface-2 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-brand-500/60 disabled:opacity-40"
              >
                <option value="gaming">Gaming (Lowest Ping)</option>
                <option value="round-robin">Round-Robin (Aggregated)</option>
                <option value="failover">Failover (Primary Link)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1 font-medium">
                Pin to Specific Adapter:
              </label>
              <select
                value={pinnedAdapter ?? ''}
                onChange={e => setPinnedAdapter(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full bg-surface-2 border border-white/[0.08] rounded-md px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-brand-500/60"
              >
                <option value="">No Pin (Use Mode Algorithm)</option>
                {adapters.map(a => (
                  <option key={a.ifIndex} value={a.ifIndex}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddRule}
            className="btn-primary w-full text-xs py-1.5 mt-1 font-medium"
          >
            Save Routing Rule
          </button>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
        {rules.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-3 bg-surface-1 rounded-lg border border-white/[0.04]">
            No application routing rules configured
          </div>
        ) : (
          rules.map(rule => {
            const pinnedName = rule.pinnedAdapterIndex
              ? adapters.find(a => a.ifIndex === rule.pinnedAdapterIndex)?.name ?? `Adapter ${rule.pinnedAdapterIndex}`
              : null;

            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                  rule.enabled
                    ? 'bg-surface-1 border-white/[0.07] text-[#f7f8f8]'
                    : 'bg-white/[0.01] border-white/[0.03] text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-xs font-medium text-slate-200 truncate">
                    {rule.processName}
                  </span>
                  <span className="badge-purple text-[10px] py-0">
                    {pinnedName ? `Pinned: ${pinnedName}` : rule.mode ?? 'Default'}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleRule(rule.id)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded border border-white/[0.08]"
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                    title="Delete rule"
                  >
                    <IconTrash size={12} />
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
