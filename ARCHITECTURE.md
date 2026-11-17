# NetFlo Network Engine — Architecture Guide

## Overview

NetFlo Engine is a lightweight Windows network aggregator and bonding engine designed to combine distinct physical connections (Wi-Fi, Ethernet, and USB cellular tethering).

It resolves native Windows routing limitations and allows system applications (including game launchers and web browsers) to utilize aggregate bandwidth.

---

## Core Components

### 1. Windows Routing & Connection Fixes
- **WCM Policy Manager** (`src/main/fixes/wcmFix.ts`): Modifies the Windows Connection Manager registry policy (`Software\Policies\Microsoft\Windows\WcmSvc\GroupPolicy\fMinimizeConnections = 0`) to prevent Windows from dropping Wi-Fi interfaces when a wired or USB tethered connection is established.
- **Metric Normalizer** (`src/main/fixes/metricFix.ts`): Detects cellular USB tethering virtual NDIS adapters and prevents DHCP metric overrides from starving secondary routes.
- **Killer Service Interrogator** (`src/main/fixes/killerDetect.ts`): Identifies background prioritization services that conflict with multi-adapter routing.

### 2. Multi-Adapter SOCKS5 Engine
- **Proxy Server** (`src/main/network/socks5Server.ts`): Listens locally on `127.0.0.1:1080` to accept standard SOCKS5 client requests.
- **Winsock FFI Binding** (`src/main/network/windowsBinding.ts`): Uses native foreign-function interface calls into `ws2_32.dll` to apply socket-level binding (`IP_UNICAST_IF`). This bypasses the default Windows routing table and routes packets out of designated physical adapters.
- **Dispatcher Strategies** (`src/main/network/dispatcher.ts`):
  - *Round-Robin*: Rotates outbound TCP connections across all active adapters.
  - *Failover*: Directs traffic to the primary adapter and automatically fails over if health checks fail.
  - *Gaming Mode*: Binds high-bandwidth TCP traffic to aggregate connections while keeping latency-sensitive traffic on the lowest-ping interface.

### 3. System-Wide Integration
- **WinINet System Proxy** (`src/main/network/systemProxy.ts`): Programmatically configures Windows Internet settings (`InternetSetOption` via `wininet.dll`) to direct system HTTP/HTTPS/SOCKS traffic through the local proxy.
- **Wintun Layer 3 Driver** (`src/main/network/wintun.ts`): *Status: Experimental.* Interfaces with the signed `wintun.dll` driver to create a virtual network adapter for raw IP packet capture and processing. Requires administrative privileges.

### 4. Telemetry and State Management
- **Connection Pool** (`src/main/network/connectionPool.ts`): Tracks active adapters, bytes transmitted, bytes received, and adapter operational state.
- **Latency Monitoring** (`src/main/network/pinger.ts`): Issues regular ICMP probes to assess interface latency.
- **IPC Layer** (`src/main/ipc/handlers.ts`): Pushes state updates and live bandwidth statistics to the Electron renderer via sandboxed preload IPC.

---

## Build and Run

- Development: `npm run build && npm run electron`
- Production Installer: `npm run dist:win` (outputs to `release/`)
