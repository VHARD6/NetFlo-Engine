"use strict";
// ============================================================
// NetFlo — Shared Types
// Used by both main process and renderer (via IPC)
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOWNLOAD_PORTS = exports.GAMING_UDP_PORTS = exports.IPC = void 0;
/** IPC channel names (type-safe) */
exports.IPC = {
    // Main → Renderer
    STATE_UPDATE: 'netflo:state-update',
    STATS_UPDATE: 'netflo:stats-update',
    ADAPTER_CHANGE: 'netflo:adapter-change',
    LOG: 'netflo:log',
    // Renderer → Main
    GET_STATE: 'netflo:get-state',
    SET_MODE: 'netflo:set-mode',
    SET_ADAPTER_INCLUDED: 'netflo:set-adapter-included',
    START: 'netflo:start',
    STOP: 'netflo:stop',
    APPLY_FIXES: 'netflo:apply-fixes',
    OPEN_KILLER_SETTINGS: 'netflo:open-killer-settings',
};
/** Default gaming mode UDP ports — game server traffic */
exports.GAMING_UDP_PORTS = new Set([
    27015, 27016, 27017, 27018, 27019, 27020, // Steam game servers
    3074, // Xbox Live / Call of Duty
    7777, // Unreal Engine games
    25565, // Minecraft
    5795, // Rocket League
    6250, // Rocket League
    7000, 7001, 7002, // various games
    9308, // Rust
    28015, 28016, // Rust
    4380, // Steam peer-to-peer
    443, // keep this as fallback TCP
]);
/** Ports considered "download" traffic — will be load-balanced */
exports.DOWNLOAD_PORTS = new Set([80, 443, 8080]);
//# sourceMappingURL=types.js.map