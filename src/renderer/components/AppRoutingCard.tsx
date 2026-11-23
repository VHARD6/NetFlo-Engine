import React, { useState, useEffect } from 'react';
import type { AppRule, NetworkAdapter, DispatchMode } from '../../../shared/types';
import { IconSplit, IconPlus, IconTrash } from './Icons';

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
    <div className="glass-panel p-4 space-y-3">
      {/* Header and presets */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400">
            <IconSplit size={11} />
          </div>
          <span className="section-label">Per-Application Split-Tunneling</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset('gaming')}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded border border-white/[0.08] hover:border-white/[0.15] transition-colors"
          >
            + Gaming Bundle
          </button>
          <button
            type="button"
            onClick={() => applyPreset('streaming')}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded border border-white/[0.08] hover:border-white/[0.15] transition-colors"
          >
            + Streaming Preset
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-[10px] text-indigo-300 hover:text-indigo-200 px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 transition-colors flex items-center gap-1"
          >
            <IconPlus size={10} />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Inline Add Rule Form Drawer */}
      {showAddForm && (
        <div className="p-3 bg-white/[0.025] border border-white/[0.08] rounded-lg space-y-2.5 mb-2 shadow-inner">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">Process Name</label>
              <input
                type="text"
                placeholder="e.g. chrome.exe"
                value={customProcess}
                onChange={e => setCustomProcess(e.target.value)}
                className="w-full bg-zinc-900 border border-white/[0.1] rounded px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-400 shadow-sm"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">Or Select Running App</label>
              <select
                value={selectedProcess}
                onChange={e => setSelectedProcess(e.target.value)}
                className="w-full bg-zinc-900 border border-white/[0.1] rounded px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-400 shadow-sm"
              >
                {runningApps.map(app => (
                  <option key={app} value={app}>
                    {app}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-zinc-400 block mb-1">Target Action</label>
              <select
                value={pinnedAdapter !== null ? `pin_${pinnedAdapter}` : targetMode}
                onChange={e => {
                  if (e.target.value.startsWith('pin_')) {
                    setPinnedAdapter(parseInt(e.target.value.replace('pin_', ''), 10));
                  } else {
                    setPinnedAdapter(null);
                    setTargetMode(e.target.value as DispatchMode);
                  }
                }}
                className="w-full bg-zinc-900 border border-white/[0.1] rounded px-2.5 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:border-indigo-400 shadow-sm"
              >
                <optgroup label="Dispatch Algorithm Override">
                  <option value="round-robin">Force Round-Robin</option>
                  <option value="gaming">Force Gaming (Lowest Ping)</option>
                  <option value="failover">Force Failover Shield</option>
                </optgroup>
                <optgroup label="Pin to Specific Hardware Link">
                  {adapters.map(a => (
                    <option key={a.ifIndex} value={`pin_${a.ifIndex}`}>
                      Pin to {a.name} ({a.type})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-white/[0.04]">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddRule}
              className="btn-primary text-xs py-1 px-3"
            >
              Save Application Rule
            </button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="w-full rounded-lg overflow-hidden border border-white/[0.06]">
        <div className="grid grid-cols-12 px-3.5 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.015]">
          <div className="col-span-5">Application Executable</div>
          <div className="col-span-4">Assigned Routing Policy</div>
          <div className="col-span-2 text-center">Status</div>
          <div className="col-span-1 text-right">Delete</div>
        </div>

        {rules.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 font-mono">
            No per-application rules configured. Add an app above.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {rules.map(rule => {
              const pinned =
                rule.pinnedAdapterIndex !== null
                  ? adapters.find(a => a.ifIndex === rule.pinnedAdapterIndex)
                  : null;

              return (
                <div
                  key={rule.id}
                  className={`grid grid-cols-12 items-center px-3.5 py-2.5 interactive-row text-xs ${
                    !rule.enabled ? 'opacity-40' : ''
                  }`}
                >
                  <div className="col-span-5 flex items-center gap-2 font-mono text-zinc-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span>{rule.processName}</span>
                  </div>

                  <div className="col-span-4">
                    {pinned ? (
                      <span className="badge-blue text-[10px] font-mono">
                        Pinned to {pinned.name}
                      </span>
                    ) : rule.mode ? (
                      <span className="badge-purple text-[10px] font-mono capitalize">
                        {rule.mode}
                      </span>
                    ) : (
                      <span className="text-zinc-500 font-mono text-[11px]">Global Default</span>
                    )}
                  </div>

                  <div className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => handleToggleRule(rule.id)}
                      disabled={disabled}
                      className={`
                        relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200
                        focus:outline-none disabled:opacity-30
                        ${rule.enabled ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'bg-zinc-800'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-2 w-2 transform rounded-full bg-white shadow-sm transition-transform duration-200
                          ${rule.enabled ? 'translate-x-3' : 'translate-x-0.5'}
                        `}
                      />
                    </button>
                  </div>

                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={disabled}
                      className="text-zinc-500 hover:text-rose-400 transition-colors p-1"
                      title="Remove rule"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
