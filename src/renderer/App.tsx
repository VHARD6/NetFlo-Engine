import React from 'react';
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

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-sm animate-pulse">Connecting to NetFlo engine...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 overflow-hidden">
      {/* ── Title Bar ─────────────────────────────────────── */}
      <div className="drag-region flex items-center justify-between px-4 h-8 bg-slate-900 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center gap-2 no-drag">
          <span className="text-netflo-400 font-bold text-sm tracking-wider">NetFlo</span>
          <span className="text-slate-600 text-xs">v0.1.0</span>
        </div>
        <div className="no-drag">
          <StatusBar
            status={state.status}
            socksPort={state.socksPort}
            meetingShieldActive={state.meetingShieldActive}
            powerSaveMode={state.powerSaveMode}
          />
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — adapters + controls */}
        <div className="flex flex-col w-84 shrink-0 border-r border-slate-800 overflow-y-auto p-4 gap-4">

          {/* Killer Warning */}
          {state.killerWarning && (
            <KillerWarning
              services={state.killerServices}
              onOpenSettings={openKillerSettings}
            />
          )}

          {/* Start / Stop */}
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={start}
              disabled={loading || isRunning}
            >
              {loading && !isRunning ? '...' : '▶ Start Bonding'}
            </button>
            <button
              className="btn-danger flex-1"
              onClick={stop}
              disabled={loading || isStopped}
            >
              {loading && isRunning ? '...' : '■ Stop'}
            </button>
          </div>

          {/* Mode Selector */}
          <ModeSelector
            mode={state.mode}
            onChange={setMode}
            disabled={!isRunning}
          />

          {/* Daily Safeguards (Meeting Shield & Power Saver) */}
          <SafeguardsCard
            meetingShieldActive={state.meetingShieldActive}
            protectedMeetingCount={state.protectedMeetingCount}
            powerSaveMode={state.powerSaveMode}
            onToggleMeetingShield={setMeetingShield}
            onTogglePowerSave={setPowerSave}
            disabled={!isRunning}
          />

          {/* Dynamic Congestion Assist (Auto-Turbo) */}
          <AutoTurboCard
            config={state.autoTurbo}
            adapters={state.adapters}
            onUpdateConfig={setAutoTurbo}
            disabled={!isRunning}
          />

          {/* Metered Data Quota & Budget Guard */}
          <QuotaCard
            adapters={state.adapters}
            quotas={state.quotas}
            onSetQuota={setQuota}
            onResetQuota={resetQuota}
            disabled={!isRunning}
          />

          {/* Per-App Split Tunneling */}
          <AppRoutingCard
            rules={state.appRules}
            adapters={state.adapters}
            onUpdateRules={setAppRules}
            onGetRunningApps={getRunningApps}
            disabled={!isRunning}
          />

          {/* LAN Gateway & Hotspot Share */}
          <LanGatewayCard
            config={state.lanGateway}
            onUpdate={setLanGateway}
            isRunning={isRunning}
          />

          {/* One-Click Phone Tether Assistant */}
          <TetherAssistantCard
            state={state.tetherAssistant}
            onOptimize={optimizeTether}
            isRunning={isRunning}
          />

          {/* NetFlo Download Manager Bridge */}
          <BridgeCard
            bridge={state.bridge}
            isRunning={isRunning}
          />

          {/* System-wide Routing Switches */}
          <div className="card space-y-3">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">
              System Routing
            </div>

            {/* Windows System Proxy Toggle */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">System Proxy (HTTP / HTTPS / Web)</div>
                <div className="text-[11px] text-slate-500">Auto-routes browser & system HTTP/HTTPS via SOCKS5</div>
              </div>
              <button
                role="switch"
                aria-checked={state.systemProxyActive}
                onClick={() => setSystemProxy(!state.systemProxyActive)}
                disabled={!isRunning}
                className={`
                  relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
                  focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
                  ${state.systemProxyActive ? 'bg-emerald-600' : 'bg-slate-600'}
                `}
              >
                <span
                  className={`
                    inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                    ${state.systemProxyActive ? 'translate-x-4' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Wintun Virtual Adapter Toggle */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-700/50 pt-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-200">Wintun Virtual Adapter</div>
                <div className="text-[11px] text-slate-500">Virtual Ethernet Layer 3 interface</div>
              </div>
              <button
                role="switch"
                aria-checked={state.wintunActive}
                onClick={() => setWintun(!state.wintunActive)}
                disabled={!isRunning}
                className={`
                  relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
                  focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
                  ${state.wintunActive ? 'bg-netflo-600' : 'bg-slate-600'}
                `}
              >
                <span
                  className={`
                    inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                    ${state.wintunActive ? 'translate-x-4' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Adapter Cards */}
          <div className="space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium px-1">
              Adapters
            </div>
            {state.adapters.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-4">No adapters found</div>
            )}
            {state.adapters.map(adapter => {
              const adapterStats = stats.find(s => s.ifIndex === adapter.ifIndex);
              return (
                <AdapterCard
                  key={adapter.ifIndex}
                  adapter={adapter}
                  stats={adapterStats}
                  onToggle={(included) => setAdapterIncluded(adapter.ifIndex, included)}
                  disabled={!isRunning}
                />
              );
            })}
          </div>

          {/* Apply fixes button */}
          <button
            className="btn-ghost text-sm w-full"
            onClick={applyFixes}
            disabled={loading}
          >
            🔧 Re-apply System Fixes
          </button>

          {/* SOCKS5 info */}
          {isRunning && (
            <div className="card text-xs text-slate-400 space-y-1">
              <div className="font-medium text-slate-300">SOCKS5 Proxy Active</div>
              <div className="font-mono text-netflo-400">127.0.0.1:{state.socksPort}</div>
              <div className="text-slate-500">
                Listening locally. Enable System Proxy above to route browser & system web traffic.
              </div>
            </div>
          )}
        </div>

        {/* Right column — charts + logs */}
        <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">
          {/* Throughput Charts */}
          <div className="card flex-1 min-h-0">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
              Live Throughput
            </div>
            <ThroughputChart adapters={state.adapters} stats={stats} />
          </div>

          {/* Log Panel */}
          <div className="card h-44 min-h-0">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">
              Log
            </div>
            <LogPanel logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
}
