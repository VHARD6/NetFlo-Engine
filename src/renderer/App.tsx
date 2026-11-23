import React, { useState } from 'react';
import { useNetFlo } from './hooks/useNetFlo';
import { AdapterList } from './components/AdapterList';
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
  IconWifi,
  IconArrowUp,
  IconArrowDown,
  IconActivity,
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
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="text-zinc-500 font-mono text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
          <span>Initializing NetFlo Bonding Core...</span>
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
    { id: 'overview', label: 'Overview', icon: <IconOverview size={14} /> },
    { id: 'routing', label: 'Routing & Modes', icon: <IconLayers size={14} />, badge: state.mode },
    {
      id: 'safeguards',
      label: 'Safeguards & Quota',
      icon: <IconShield size={14} />,
      badge: state.meetingShieldActive ? 'Shielded' : undefined,
    },
    {
      id: 'ecosystem',
      label: 'LAN & Ecosystem',
      icon: <IconShare size={14} />,
      badge: state.lanGateway.enabled ? 'Gateway' : undefined,
    },
    {
      id: 'logs',
      label: 'Console & Logs',
      icon: <IconTerminal size={14} />,
      badge: state.killerWarning ? 'Alert' : undefined,
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-canvas text-zinc-100 select-none overflow-hidden">
      {/* ── Frameless Titlebar ───────────────────────────────── */}
      <header className="drag-region flex items-center justify-between px-4 h-9 bg-panel border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5 no-drag">
          <div className="w-4 h-4 rounded bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]">
            <IconWifi size={10} />
          </div>
          <span className="font-semibold text-xs text-white tracking-tight">NetFlo</span>
          <span className="text-[10px] text-zinc-500 font-mono">v0.1.0</span>
        </div>

        <div className="flex items-center gap-3 no-drag">
          <StatusBar
            status={state.status}
            socksPort={state.socksPort}
            meetingShieldActive={state.meetingShieldActive}
            powerSaveMode={state.powerSaveMode}
          />
        </div>
      </header>

      {/* ── Killer Suite Alert Banner (Full Bleed) ────────────── */}
      {state.killerWarning && (
        <KillerWarning
          services={state.killerServices}
          onOpenSettings={openKillerSettings}
        />
      )}

      {/* ── Main App Shell (Sidebar + Viewport) ───────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Modern Sidebar Navigation */}
        <aside className="w-56 shrink-0 bg-panel border-r border-white/[0.06] flex flex-col justify-between p-3.5">
          {/* Top Navigation */}
          <div className="space-y-4">
            {/* Master Action Button */}
            <div>
              {isRunning ? (
                <button
                  type="button"
                  onClick={stop}
                  disabled={loading}
                  className="w-full btn-danger text-xs py-2 font-medium"
                >
                  <IconSquare size={11} />
                  <span>Stop Bonding</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={loading}
                  className="w-full btn-primary text-xs py-2 font-medium"
                >
                  <IconPlay size={11} />
                  <span>Start Bonding</span>
                </button>
              )}
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              {navItems.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer
                      ${isActive
                        ? 'bg-indigo-500/[0.12] text-white border-l-2 border-indigo-400 font-semibold shadow-[inset_0_0_12px_rgba(99,102,241,0.06)]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={isActive ? 'text-indigo-400' : 'text-zinc-500'}>
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
                            ? 'bg-indigo-500/30 text-indigo-200'
                            : 'bg-white/[0.04] text-zinc-500'
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

          {/* Sidebar Ambient Status & Proxy Switch */}
          <div className="space-y-3 pt-3.5 border-t border-white/[0.06]">
            {/* System Proxy Switch */}
            <div className="flex items-center justify-between text-xs">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-zinc-200">System Proxy</div>
                <div className="text-[10px] text-zinc-500">Auto-Route All Apps</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.systemProxyActive}
                onClick={() => setSystemProxy(!state.systemProxyActive)}
                disabled={!isRunning}
                className={`
                  relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
                  focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
                  ${state.systemProxyActive ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}
                `}
              >
                <span
                  className={`
                    inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                    ${state.systemProxyActive ? 'translate-x-3.5' : 'translate-x-0.5'}
                  `}
                />
              </button>
            </div>

            {/* Quick Status Stats */}
            <div className="pt-2 border-t border-white/[0.04] text-[10px] space-y-1 font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Bonded Links</span>
                <span className="text-zinc-200 font-medium">
                  {connectedAdapters.length} of {state.adapters.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Combined Speed</span>
                <span className="text-indigo-300 font-bold">
                  {formatSpeed(totalThroughput)}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Viewport (Card-Free, Continuous Layout) ─────── */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,rgba(99,102,241,0.12),transparent_70%)]">
          {/* ── TAB 1: OVERVIEW ─────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Elevated Telemetry Hero Console with Ambient Lighting */}
              <div className="glass-panel p-5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/30 via-[#0e1017] to-[#0a0b10] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
                  <div>
                    <span className="section-label block mb-1.5 text-zinc-400">
                      Live Aggregated Throughput
                    </span>
                    <div className="flex items-baseline gap-3.5 flex-wrap">
                      <span className="text-4xl font-mono font-bold tracking-tight text-white drop-shadow-[0_2px_16px_rgba(99,102,241,0.35)]">
                        {formatSpeed(totalThroughput)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="badge-green px-2.5 py-1 text-xs">
                          <IconArrowDown size={11} className="mr-1 inline" /> {formatSpeed(totalRxBps)}
                        </span>
                        <span className="badge-blue px-2.5 py-1 text-xs">
                          <IconArrowUp size={11} className="mr-1 inline" /> {formatSpeed(totalTxBps)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('routing')}
                      className="text-[11px] text-zinc-300 hover:text-white px-2.5 py-1 rounded-md border border-white/[0.08] hover:border-white/[0.2] bg-white/[0.02] hover:bg-white/[0.05] transition-all font-mono"
                    >
                      Mode: <span className="text-indigo-300 capitalize font-medium">{state.mode}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('safeguards')}
                      className="text-[11px] text-zinc-300 hover:text-white px-2.5 py-1 rounded-md border border-white/[0.08] hover:border-white/[0.2] bg-white/[0.02] hover:bg-white/[0.05] transition-all font-mono"
                    >
                      {state.meetingShieldActive ? (
                        <span className="text-emerald-400">Shield Active</span>
                      ) : (
                        <span className="text-zinc-400">Shield Off</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Ambient Real-Time Telemetry Graph */}
                <div className="h-44 pt-2 border-t border-white/[0.06]">
                  <ThroughputChart adapters={state.adapters} stats={stats} />
                </div>
              </div>

              {/* Physical Interfaces Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1">
                  <span className="section-label">
                    Physical Interfaces ({connectedAdapters.length} of {state.adapters.length} Bonded)
                  </span>
                  <button
                    type="button"
                    onClick={applyFixes}
                    disabled={loading}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer font-mono"
                  >
                    <IconRefresh size={11} />
                    <span>Re-apply System Fixes</span>
                  </button>
                </div>

                <AdapterList
                  adapters={state.adapters}
                  stats={stats}
                  onToggle={setAdapterIncluded}
                  disabled={!isRunning}
                />
              </div>

              {/* System-Wide Routing Preference Panel */}
              <div className="glass-panel p-4 space-y-3">
                <span className="section-label block pb-1">
                  System-Wide Routing Controls
                </span>

                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06] rounded-lg overflow-hidden">
                  {/* System Proxy Row */}
                  <div className="py-3 px-3.5 flex items-center justify-between gap-4 interactive-row text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-100">Windows System HTTP/HTTPS Proxy</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Directs browser and desktop application traffic (Chrome, Edge, Google Drive, Steam) through NetFlo's multi-path bonding core.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.systemProxyActive}
                      onClick={() => setSystemProxy(!state.systemProxyActive)}
                      disabled={!isRunning}
                      className={`
                        relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
                        focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
                        ${state.systemProxyActive ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                          ${state.systemProxyActive ? 'translate-x-3.5' : 'translate-x-0.5'}
                        `}
                      />
                    </button>
                  </div>

                  {/* Wintun Virtual Device Row */}
                  <div className="py-3 px-3.5 flex items-center justify-between gap-4 interactive-row text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-100">Wintun Layer 3 TUN Device</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Virtual network adapter driver for raw transparent IP packet bonding across non-proxy applications.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.wintunActive}
                      onClick={() => setWintun(!state.wintunActive)}
                      disabled={!isRunning}
                      className={`
                        relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200
                        focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
                        ${state.wintunActive ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'bg-zinc-800'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                          ${state.wintunActive ? 'translate-x-3.5' : 'translate-x-0.5'}
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
            <div className="space-y-5">
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
            <div className="space-y-5">
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
            <div className="space-y-5">
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
            <div className="space-y-4 h-[calc(100vh-100px)] flex flex-col">
              <div className="flex-1 min-h-0 glass-panel p-4">
                <LogPanel logs={logs} />
              </div>

              <div className="glass-panel p-3 flex items-center justify-between text-xs shrink-0">
                <span className="text-[11px] text-zinc-400">
                  Re-enforces Windows WCM Simultaneous Policies and clears interface metrics.
                </span>
                <button
                  type="button"
                  onClick={applyFixes}
                  disabled={loading}
                  className="btn-ghost text-xs py-1"
                >
                  <IconRefresh size={11} />
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
