/**
 * useNetFlo.ts
 * ─────────────────────────────────────────────────────────────
 * React hook that manages NetFlo state, subscribes to IPC events,
 * and exposes all engine control actions to the UI.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NetFloState, AdapterStats, DispatchMode } from '../../shared/types';

// window.netflo is typed here — injected by preload.ts
declare global {
  interface Window {
    netflo: {
      getState: () => Promise<NetFloState>;
      start: () => Promise<NetFloState>;
      stop: () => Promise<NetFloState>;
      setMode: (mode: DispatchMode) => Promise<NetFloState>;
      setAdapterIncluded: (ifIndex: number, included: boolean) => Promise<NetFloState>;
      setSystemProxy: (enabled: boolean) => Promise<NetFloState>;
      setWintun: (enabled: boolean) => Promise<NetFloState>;
      applyFixes: () => Promise<NetFloState>;
      openKillerSettings: () => void;
      getQuotas: () => Promise<any[]>;
      setQuota: (
        ifIndex: number,
        adapterName: string,
        dailyCapBytes: number | null,
        actionOnExceed?: string,
        warningThresholdPercent?: number
      ) => Promise<NetFloState>;
      resetQuota: (ifIndex: number) => Promise<NetFloState>;
      setPowerSave: (enabled: boolean) => Promise<NetFloState>;
      setMeetingShield: (enabled: boolean) => Promise<NetFloState>;
      getAppRules: () => Promise<any[]>;
      setAppRules: (rules: any[]) => Promise<NetFloState>;
      getPortRules: () => Promise<any[]>;
      setPortRules: (rules: any[]) => Promise<NetFloState>;
      getRunningApps: () => Promise<string[]>;
      setAutoTurbo: (config: any) => Promise<NetFloState>;
      onStateUpdate: (cb: (state: NetFloState) => void) => () => void;
      onStatsUpdate: (cb: (stats: AdapterStats[]) => void) => () => void;
      onLog: (cb: (msg: string) => void) => () => void;
    };
  }
}

const MAX_LOG_LINES = 200;

export function useNetFlo() {
  const [state, setState] = useState<NetFloState | null>(null);
  const [stats, setStats] = useState<AdapterStats[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Bootstrap ───────────────────────────────────────────────
  useEffect(() => {
    if (!window.netflo) {
      console.error('window.netflo is not available');
      return;
    }
    window.netflo.getState()
      .then(setState)
      .catch((err) => console.error('Failed to get initial state:', err));

    const offState = window.netflo.onStateUpdate(setState);
    const offStats = window.netflo.onStatsUpdate(setStats);
    const offLog   = window.netflo.onLog(msg => {
      setLogs(prev => [...prev.slice(-(MAX_LOG_LINES - 1)), msg]);
    });

    return () => { offState(); offStats(); offLog(); };
  }, []);

  // ── Actions ─────────────────────────────────────────────────
  const start = useCallback(async () => {
    setLoading(true);
    try { setState(await window.netflo.start()); }
    finally { setLoading(false); }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    try { setState(await window.netflo.stop()); }
    finally { setLoading(false); }
  }, []);

  const setMode = useCallback(async (mode: DispatchMode) => {
    setState(await window.netflo.setMode(mode));
  }, []);

  const setAdapterIncluded = useCallback(async (ifIndex: number, included: boolean) => {
    setState(await window.netflo.setAdapterIncluded(ifIndex, included));
  }, []);

  const setSystemProxy = useCallback(async (enabled: boolean) => {
    setState(await window.netflo.setSystemProxy(enabled));
  }, []);

  const setWintun = useCallback(async (enabled: boolean) => {
    setState(await window.netflo.setWintun(enabled));
  }, []);

  const applyFixes = useCallback(async () => {
    setLoading(true);
    try { setState(await window.netflo.applyFixes()); }
    finally { setLoading(false); }
  }, []);

  const openKillerSettings = useCallback(() => {
    window.netflo.openKillerSettings();
  }, []);

  const setQuota = useCallback(
    async (
      ifIndex: number,
      adapterName: string,
      dailyCapBytes: number | null,
      actionOnExceed?: string,
      warningThresholdPercent?: number
    ) => {
      setState(
        await window.netflo.setQuota(
          ifIndex,
          adapterName,
          dailyCapBytes,
          actionOnExceed,
          warningThresholdPercent
        )
      );
    },
    []
  );

  const resetQuota = useCallback(async (ifIndex: number) => {
    setState(await window.netflo.resetQuota(ifIndex));
  }, []);

  const setPowerSave = useCallback(async (enabled: boolean) => {
    setState(await window.netflo.setPowerSave(enabled));
  }, []);

  const setMeetingShield = useCallback(async (enabled: boolean) => {
    setState(await window.netflo.setMeetingShield(enabled));
  }, []);

  const setAppRules = useCallback(async (rules: any[]) => {
    setState(await window.netflo.setAppRules(rules));
  }, []);

  const setPortRules = useCallback(async (rules: any[]) => {
    setState(await window.netflo.setPortRules(rules));
  }, []);

  const getRunningApps = useCallback(async () => {
    return window.netflo.getRunningApps();
  }, []);

  const setAutoTurbo = useCallback(async (config: any) => {
    setState(await window.netflo.setAutoTurbo(config));
  }, []);

  return {
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
    setPortRules,
    getRunningApps,
    setAutoTurbo,
    isRunning: state?.status === 'running',
    isStopped: state?.status === 'stopped',
  };
}

