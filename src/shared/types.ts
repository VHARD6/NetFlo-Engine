// ============================================================
// NetFlo — Shared Types
// Used by both main process and renderer (via IPC)
// ============================================================

export type AdapterType = 'wifi' | 'ethernet' | 'usb-tether' | 'virtual' | 'unknown';
export type AdapterStatus = 'connected' | 'disconnected' | 'disabled';
export type DispatchMode = 'round-robin' | 'failover' | 'gaming';
export type NetFloStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface NetworkAdapter {
  /** Interface index from Windows (matches IP_UNICAST_IF) */
  ifIndex: number;
  /** Human-readable name, e.g. "Wi-Fi" */
  name: string;
  /** Internal GUID/alias used by netsh */
  alias: string;
  type: AdapterType;
  status: AdapterStatus;
  /** IPv4 address if connected */
  ipv4?: string;
  /** IPv6 address if connected */
  ipv6?: string;
  /** MAC address */
  mac: string;
  /** Link speed in Mbps (0 if disconnected) */
  speedMbps: number;
  /** Gateway IP for this adapter */
  gateway?: string;
  /** Current route metric (lower = preferred by Windows) */
  metric?: number;
  /** Whether this adapter is currently included in NetFlo bonding */
  includedInBonding: boolean;
  /** Whether Killer Network prioritization is detected on this adapter */
  killerDetected: boolean;
}

export interface AdapterStats {
  ifIndex: number;
  name: string;
  /** Bytes sent in the last interval */
  txBytes: number;
  /** Bytes received in the last interval */
  rxBytes: number;
  /** Bytes per second sent (calculated) */
  txBps: number;
  /** Bytes per second received (calculated) */
  rxBps: number;
  /** Ping to 8.8.8.8 in ms (updated every ~5s) */
  pingMs: number;
  /** Number of active connections routed through this adapter */
  activeConnections: number;
}

export interface NetFloState {
  status: NetFloStatus;
  mode: DispatchMode;
  adapters: NetworkAdapter[];
  stats: AdapterStats[];
  socksPort: number;
  errorMessage?: string;
  wcmFixApplied: boolean;
  killerWarning: boolean;
  /** Names of Killer services detected */
  killerServices: string[];
  /** Whether Windows System Proxy is enabled pointing to NetFlo */
  systemProxyActive: boolean;
  /** Whether Wintun Virtual Adapter is active */
  wintunActive: boolean;
}

export interface AppRule {
  id: string;
  /** Process name, e.g. "steam.exe" */
  processName: string;
  /** null = use global mode */
  mode: DispatchMode | null;
  /** null = all adapters, otherwise pin to specific adapter ifIndex */
  pinnedAdapterIndex: number | null;
  enabled: boolean;
}

export interface PortRule {
  id: string;
  protocol: 'tcp' | 'udp' | 'both';
  port: number;
  /** null = use global mode */
  mode: DispatchMode | null;
  pinnedAdapterIndex: number | null;
  enabled: boolean;
  description: string;
}

/** IPC channel names (type-safe) */
export const IPC = {
  // Main → Renderer
  STATE_UPDATE: 'netflo:state-update',
  STATS_UPDATE: 'netflo:stats-update',
  ADAPTER_CHANGE: 'netflo:adapter-change',
  LOG: 'netflo:log',

  // Renderer → Main
  GET_STATE: 'netflo:get-state',
  SET_MODE: 'netflo:set-mode',
  SET_ADAPTER_INCLUDED: 'netflo:set-adapter-included',
  SET_SYSTEM_PROXY: 'netflo:set-system-proxy',
  SET_WINTUN: 'netflo:set-wintun',
  START: 'netflo:start',
  STOP: 'netflo:stop',
  APPLY_FIXES: 'netflo:apply-fixes',
  OPEN_KILLER_SETTINGS: 'netflo:open-killer-settings',
} as const;

/** Default gaming mode UDP ports — game server traffic */
export const GAMING_UDP_PORTS = new Set([
  27015, 27016, 27017, 27018, 27019, 27020, // Steam game servers
  3074,  // Xbox Live / Call of Duty
  7777,  // Unreal Engine games
  25565, // Minecraft
  5795,  // Rocket League
  6250,  // Rocket League
  7000, 7001, 7002, // various games
  9308,  // Rust
  28015, 28016, // Rust
  4380,  // Steam peer-to-peer
  443,   // keep this as fallback TCP
]);

/** Ports considered "download" traffic — will be load-balanced */
export const DOWNLOAD_PORTS = new Set([80, 443, 8080]);
