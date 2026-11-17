# ⚡ NetFlo

> **Bond Wi-Fi, Ethernet, and USB Tethering into a unified high-speed internet connection on Windows.**

NetFlo solves the fundamental Windows issue where connecting a phone via USB tethering disconnects or stalls Wi-Fi, and allows you to combine your network connections for Steam downloads, Epic Games, web browsers, and gaming.

---

## 🎯 What NetFlo Solves

On standard Windows systems, connecting multiple internet adapters causes conflicts:
1. **Windows Connection Manager (WCM)**: Automatically disconnects Wi-Fi when USB tethering connects, assuming "wired" is always preferred.
2. **Weak Host Send Model**: Windows ignores source IP binding and routes packets strictly by route metrics, causing Wi-Fi packets to exit through the USB adapter and get dropped by carrier Reverse Path Filtering (RPF).
3. **Route Metric Hijacking**: Android/iOS tethering assigns low metrics that override all default routes.
4. **Killer Prioritization Conflicts**: Intel/Killer Network services actively divert traffic to a single adapter.

**NetFlo fixes all of these:**
- ✅ **WCM Group Policy patch**: Automatically disables `fMinimizeConnections` on startup so Wi-Fi and USB tethering remain active together.
- ✅ **Native `IP_UNICAST_IF` Winsock binding**: Bypasses Windows routing table conflicts using Koffi FFI into `ws2_32.dll`, guaranteeing packets exit through the intended adapter.
- ✅ **Automated metric management**: Deprioritizes DHCP default route takeovers.
- ✅ **Killer suite detection**: Alerts and guides disabling prioritization features without uninstalling drivers.
- ✅ **System-wide Proxy**: One-click routing for Steam, Epic Games, browsers, and desktop applications via WinINet.
- 🔬 **Wintun Virtual Adapter (Experimental)**: Native Layer 3 TUN adapter integration for low-level packet capture (requires Administrator).

---

## 🚀 Features

- **Bonding Modes**:
  - ⚖️ **Round-Robin**: Spreads outbound TCP connections evenly across all active adapters for maximum aggregate download speeds.
  - 🛡️ **Failover**: Uses your primary connection and instantly switches to backup connections if one drops.
  - 🎮 **Gaming Mode**: Bonds high-throughput download traffic across all adapters, while reserving low-latency traffic for your fastest adapter.
- **System-Wide One-Click Routing**:
  - **Windows System Proxy (Production)**: Automatically configures WinINet to route all Windows apps (Steam, Epic Games, Chrome, Edge) through the local bonded SOCKS5 pool.
  - **Wintun Virtual Adapter (Experimental)**: Layer 3 TUN virtual adapter utilizing official signed `wintun.dll` (in active development).
- **Live Throughput Monitoring**:
  - Real-time per-adapter download (RX), upload (TX), and latency (ping to 8.8.8.8) graphs.

---

## 🛠️ Tech Stack

- **Shell**: Electron 33 (Windows x64 & ARM64)
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts
- **Native FFI**: Koffi (calling `ws2_32.dll` and `wininet.dll`)
- **Virtual Adapter**: Official signed Wintun DLL (WireGuard / ZX2C4)
- **Packaging**: electron-builder (NSIS `.exe` installer)

---

## 📦 Building and Running

### Development
```powershell
# Install dependencies
npm install --legacy-peer-deps

# Build main process and renderer
npm run build

# Start Electron app
npm run electron
```

### Build Distributable Windows Installer (.exe)
```powershell
npm run dist:win
```
The installer will be generated in `release/NetFlo Setup 0.1.0.exe`.

---

## 🎮 Using with Steam & Epic Games

1. Open NetFlo and click **Start Bonding**.
2. Toggle **System Proxy (Steam / Epic / Web)** to `ON`.
3. Open Steam or Epic Games and start a download:
   - Both your Wi-Fi and USB tethering counters will immediately show incoming data simultaneously.
   - For multiplayer games, switch the mode to **Gaming Mode** to keep your in-game ping stable on your lowest-latency adapter.

---

## 📜 License & Credits

- NetFlo: MIT License
- Wintun: Distributed under the Wintun binary license (WireGuard / Jason A. Donenfeld)
