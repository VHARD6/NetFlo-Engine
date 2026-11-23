import React, { useState } from 'react';
import { useNetFlo } from './hooks/useNetFlo';
import { AdapterCard } from './components/AdapterCard';
import { ThroughputChart } from './components/ThroughputChart';
import { ModeSelector } from './components/ModeSelector';
import { KillerWarning } from './components/KillerWarning';
import { StatusBar } from './components/StatusBar';
import { LogPanel } from './components/LogPanel';
import { QuotaCard } from './components/QuotaCard';
import { SafeguardsCard } from './components/SafeguardsCard';
import { AppRoutingCard } from './components/AppRoutingCard';
import { AutoTurboCard } from './components/AutoTurboCard';
import { LanGatewayCard } from './components/LanGatewayCard';
import { TetherAssistantCard } from './components/TetherAssistantCard';
import { BridgeCard } from './components/BridgeCard';
import {
  IconOverview,
  IconLayers,
  IconShield,
  IconShare,
  IconTerminal,
  IconPlay,
  IconSquare,
  IconRefresh,
  IconActivity,
  IconWifi,
  IconZap,
  IconAlert,
} from './components/Icons';

type TabId = 'overview' | 'routing' | 'safeguards' | 'ecosystem' | 'logs';

function formatSpeed(bps: number): string {
  if (bps >= 1024 * 1024 * 1024) return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps} B/s`;
}

export default function App() {
  const {
    state,
    stats,
    logs,
    loading,
    start,
    stop,
    setMode,
    setAdapterIncluded,
    setSystemProxy,
    setWintun,
    applyFixes,
    openKillerSettings,
    setQuota,
    resetQuota,
    setPowerSave,
    setMeetingShield,
    setAppRules,
    getRunningApps,
    setAutoTurbo,
    setLanGateway,
    optimizeTether,
    isRunning,
    isStopped,
  } = useNetFlo();

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="text-slate-500 font-mono text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span>Connecting to NetFlo Engine...</span>
        </div>
      </div>
    );
  }

  // Calculate live aggregate bandwidth
  let totalRxBps = 0;
  let totalTxBps = 0;
  for (const s of stats) {
    totalRxBps += s.rxBps;
    totalTxBps += s.txBps;
  }
  const totalThroughput = totalRxBps + totalTxBps;

  const connectedAdapters = state.adapters.filter(a => a.status === 'connected' && a.includedInBonding);

  const navItems: { id: TabId; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: 'Overview', icon: <IconOverview size={15} /> },
    { id: 'routing', label: 'Routing & Modes', icon: <IconLayers size={15} />, badge: state.mode },
    {
      id: 'safeguards',
      label: 'Safeguards & Quota',
      icon: <IconShield size={15} />,
      badge: state.meetingShieldActive ? 'Shielded' : undefined,
    },
    {
      id: 'ecosystem',
      label: 'LAN & Ecosystem',
      icon: <IconShare size={15} />,
      badge: state.lanGateway.enabled ? 'Gateway' : undefined,
    },
    {
      id: 'logs',
      label: 'Console & Logs',
      icon: <IconTerminal size={15} />,
      badge: state.killerWarning ? 'Alert' : undefined,
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-[#f7f8f8] select-none overflow-hidden">
      {/* ── Frameless Titlebar ───────────────────────────────── */}
      <div className="drag-region flex items-center justify-between px-4 h-9 bg-surface-1 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5 no-drag">
          <div className="w-4 h-4 rounded bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400">
            <IconWifi size={10} />
          </div>
          <span className="font-semibold text-xs text-[#f7f8f8] tracking-tight">NetFlo</span>
          <span className="text-[10px] text-slate-500 font-mono">v0.1.0</span>
        </div>

        <div className="flex items-center gap-3 no-drag">
          <StatusBar
            status={state.status}
            socksPort={state.socksPort}
            meetingShieldActive={state.meetingShieldActive}
            powerSaveMode={state.powerSaveMode}
          />
        </div>
      </div>

      {/* ── Main App Shell (Sidebar + Viewport) ───────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-surface-1 border-r border-white/[0.06] flex flex-col justify-between p-3">
          {/* Top Navigation */}
          <div className="space-y-4">
            {/* Master Action Button */}
            <div className="space-y-1.5">
              {isRunning ? (
                <button
                  type="button"
                  onClick={stop}
                  disabled={loading}
                  className="w-full btn-danger text-xs py-2 shadow-sm font-medium"
                >
                  <IconSquare size={12} />
                  <span>Stop Bonding</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={loading}
                  className="w-full btn-primary text-xs py-2 shadow-sm font-medium"
                >
                  <IconPlay size={12} />
                  <span>Start Bonding</span>
                </button>
              )}
            </div>

            {/* Navigation links */}
            <nav className="space-y-0.5">
              {navItems.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`
                      w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer
                      ${isActive
                        ? 'bg-brand-500/15 text-[#f7f8f8] border border-brand-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={isActive ? 'text-brand-400' : 'text-slate-500'}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                          item.badge === 'Alert'
                            ? 'bg-amber-500/20 text-amber-300'
                            : isActive
                            ? 'bg-brand-500/30 text-brand-200'
                            : 'bg-white/[0.05] text-slate-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer Controls */}
          <div className="space-y-3 pt-3 border-t border-white/[0.06]">
            {/* System Proxy Switch */}
            <div className="flex items-center justify-between text-xs">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-slate-300">System Proxy</div>
                <div className="text-[10px] text-slate-500">Route HTTP/HTTPS</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.systemProxyActive}
                onClick={() => setSystemProxy(!state.systemProxyActive)}
                disabled={!isRunning}
                className={`
                  relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150
                  focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
                  ${state.systemProxyActive ? 'bg-emerald-500' : 'bg-surface-4'}
                `}
              >
                <span
                  className={`
                    inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                    ${state.systemProxyActive ? 'translate-x-3.5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </div>

            {/* Quick Status Chip */}
            <div className="p-2 rounded-md bg-surface-2 border border-white/[0.05] text-[10px] space-y-1">
              <div className="flex items-center justify-between text-slate-500">
                <span>Bonded Links</span>
                <span className="font-mono text-slate-300">
                  {connectedAdapters.length} of {state.adapters.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>Aggregate Speed</span>
                <span className="font-mono text-brand-400 font-medium">
                  {formatSpeed(totalThroughput)}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Killer Warning Notification */}
          {state.killerWarning && (
            <KillerWarning
              services={state.killerServices}
              onOpenSettings={openKillerSettings}
            />
          )}

          {/* ── TAB 1: OVERVIEW ─────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Stat Metrics Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Metric 1: Aggregate Speed */}
                <div className="card flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      Aggregate Throughput
                    </div>
                    <div className="text-lg font-mono font-bold text-[#f7f8f8] mt-0.5">
                      {formatSpeed(totalThroughput)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Down: <span className="font-mono text-emerald-400">{formatSpeed(totalRxBps)}</span> · Up:{' '}
                      <span className="font-mono text-sky-400">{formatSpeed(totalTxBps)}</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/25 flex items-center justify-center text-brand-400">
                    <IconActivity size={16} />
                  </div>
                </div>

                {/* Metric 2: Bonding Mode */}
                <div className="card flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      Dispatch Algorithm
                    </div>
                    <div className="text-base font-semibold text-[#f7f8f8] capitalize mt-0.5">
                      {state.mode.replace('-', ' ')}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Active on local port <span className="font-mono text-slate-400">:{state.socksPort}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('routing')}
                    className="text-[11px] text-brand-400 hover:text-brand-300 font-medium px-2 py-1 rounded border border-brand-500/30 bg-brand-500/10 transition-colors"
                  >
                    Change
                  </button>
                </div>

                {/* Metric 3: Active Safeguards */}
                <div className="card flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                      Protection Status
                    </div>
                    <div className="text-base font-semibold text-[#f7f8f8] mt-0.5">
                      {state.meetingShieldActive ? 'Zero-Drop Active' : 'Shield Inactive'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {state.powerSaveMode ? 'Low Power Polling' : 'Standard Polling'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('safeguards')}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 transition-colors"
                  >
                    Manage
                  </button>
                </div>
              </div>

              {/* Live Throughput Area Chart */}
              <div className="card space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                      Real-Time Throughput
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Updated every 500ms
                  </span>
                </div>
                <div className="h-52">
                  <ThroughputChart adapters={state.adapters} stats={stats} />
                </div>
              </div>

              {/* Physical Interfaces Grid */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                    Network Adapters ({connectedAdapters.length}/{state.adapters.length} Bonded)
                  </span>
                  <button
                    type="button"
                    onClick={applyFixes}
                    disabled={loading}
                    className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <IconRefresh size={11} />
                    <span>Re-apply System Fixes</span>
                  </button>
                </div>

                {state.adapters.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-6 bg-surface-1 rounded-lg border border-white/[0.04]">
                    No network interfaces detected
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {state.adapters.map(adapter => {
                      const adapterStats = stats.find(s => s.ifIndex === adapter.ifIndex);
                      return (
                        <AdapterCard
                          key={adapter.ifIndex}
                          adapter={adapter}
                          stats={adapterStats}
                          onToggle={included => setAdapterIncluded(adapter.ifIndex, included)}
                          disabled={!isRunning}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* System Routing Controls */}
              <div className="card space-y-3">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">
                  System-Wide Routing Controls
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* System Proxy */}
                  <div className="p-3 rounded-lg bg-surface-1 border border-white/[0.05] flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-200">System HTTP/HTTPS Proxy</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Directs browser and OS web requests through SOCKS5
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.systemProxyActive}
                      onClick={() => setSystemProxy(!state.systemProxyActive)}
                      disabled={!isRunning}
                      className={`
                        relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
                        focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
                        ${state.systemProxyActive ? 'bg-emerald-500' : 'bg-surface-4'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                          ${state.systemProxyActive ? 'translate-x-4' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>

                  {/* Wintun Virtual Adapter */}
                  <div className="p-3 rounded-lg bg-surface-1 border border-white/[0.05] flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-200">Wintun Layer 3 TUN Device</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Virtual network adapter for transparent IP packet routing
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.wintunActive}
                      onClick={() => setWintun(!state.wintunActive)}
                      disabled={!isRunning}
                      className={`
                        relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
                        focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
                        ${state.wintunActive ? 'bg-brand-500' : 'bg-surface-4'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                          ${state.wintunActive ? 'translate-x-4' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: ROUTING & MODES ───────────────────────────── */}
          {activeTab === 'routing' && (
            <div className="space-y-4">
              <ModeSelector
                mode={state.mode}
                onChange={setMode}
                disabled={!isRunning}
              />

              <AutoTurboCard
                config={state.autoTurbo}
                adapters={state.adapters}
                onUpdateConfig={setAutoTurbo}
                disabled={!isRunning}
              />

              <AppRoutingCard
                rules={state.appRules}
                adapters={state.adapters}
                onUpdateRules={setAppRules}
                onGetRunningApps={getRunningApps}
                disabled={!isRunning}
              />
            </div>
          )}

          {/* ── TAB 3: SAFEGUARDS & QUOTA ───────────────────────── */}
          {activeTab === 'safeguards' && (
            <div className="space-y-4">
              <SafeguardsCard
                meetingShieldActive={state.meetingShieldActive}
                protectedMeetingCount={state.protectedMeetingCount}
                powerSaveMode={state.powerSaveMode}
                onToggleMeetingShield={setMeetingShield}
                onTogglePowerSave={setPowerSave}
                disabled={!isRunning}
              />

              <QuotaCard
                adapters={state.adapters}
                quotas={state.quotas}
                onSetQuota={setQuota}
                onResetQuota={resetQuota}
                disabled={!isRunning}
              />
            </div>
          )}

          {/* ── TAB 4: LAN & ECOSYSTEM ──────────────────────────── */}
          {activeTab === 'ecosystem' && (
            <div className="space-y-4">
              <LanGatewayCard
                config={state.lanGateway}
                onUpdate={setLanGateway}
                isRunning={isRunning}
              />

              <TetherAssistantCard
                state={state.tetherAssistant}
                onOptimize={optimizeTether}
                isRunning={isRunning}
              />

              <BridgeCard
                bridge={state.bridge}
                isRunning={isRunning}
              />
            </div>
          )}

          {/* ── TAB 5: LOGS & DIAGNOSTICS ────────────────────────── */}
          {activeTab === 'logs' && (
            <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
              <div className="flex-1 min-h-0">
                <LogPanel logs={logs} />
              </div>

              <div className="card flex items-center justify-between shrink-0">
                <div>
                  <div className="text-xs font-semibold text-[#f7f8f8]">System Fixes & Diagnostic State</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Re-enforces Windows WCM Simultaneous Policies and clears interface metrics
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyFixes}
                  disabled={loading}
                  className="btn-ghost text-xs"
                >
                  <IconRefresh size={12} />
                  <span>Execute Diagnostic Fixes</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
