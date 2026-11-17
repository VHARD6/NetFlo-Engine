import os from 'os';
import { execSync } from 'child_process';
import type { NetworkAdapter, AdapterType, AdapterStatus } from '../../shared/types';

// ─── Interface Discovery ──────────────────────────────────────
// Combines Node.js os.networkInterfaces() with netsh output
// to build a richer picture than Node.js alone provides.

interface NetshInterface {
  alias: string;
  ifIndex: number;
  metric?: number;
  gateway?: string;
  type: string;
}

/** Parse `netsh interface ip show interfaces` output */
function parseNetshInterfaces(): Map<string, NetshInterface> {
  const result = new Map<string, NetshInterface>();
  try {
    const out = execSync('netsh interface ip show interfaces', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    for (const line of out.split(/\r?\n/)) {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length >= 5 && /^\d+$/.test(tokens[0]) && /^\d+$/.test(tokens[1])) {
        const ifIndex = parseInt(tokens[0], 10);
        const metric = parseInt(tokens[1], 10);
        const name = tokens.slice(4).join(' ');
        result.set(name, {
          alias: name,
          ifIndex,
          metric,
          type: 'unknown',
        });
      }
    }
  } catch {
    // netsh can fail in limited contexts; fall back gracefully
  }
  return result;
}

/** Get default gateway for each interface via route table */
function parseGateways(): Map<number, string> {
  const gateways = new Map<number, string>();
  try {
    const out = execSync('netsh interface ip show route', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split(/\r?\n/)) {
      const tokens = line.trim().split(/\s+/);
      if (tokens.includes('0.0.0.0/0')) {
        const prefixIdx = tokens.indexOf('0.0.0.0/0');
        if (tokens.length > prefixIdx + 2) {
          const gwIdx = parseInt(tokens[prefixIdx + 1], 10);
          const gateway = tokens[prefixIdx + 2];
          if (!isNaN(gwIdx) && /^\d+\.\d+\.\d+\.\d+$/.test(gateway)) {
            gateways.set(gwIdx, gateway);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return gateways;
}

/** Detect Killer Network suite — this will conflict with multi-adapter bonding */
export function detectKillerServices(): string[] {
  const killerServiceNames = [
    'KillerNetworkService',
    'KillerControlCenter',
    'IntelNetworkHelperService',
    'KillerAnalyticsService',
  ];
  const found: string[] = [];
  try {
    const out = execSync('sc query type= all state= running', {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const svc of killerServiceNames) {
      if (out.includes(svc)) found.push(svc);
    }
  } catch {
    // ignore
  }
  return found;
}

function isPseudoInterface(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('loopback') ||
    n.includes('isatap') ||
    n.includes('teredo') ||
    n.includes('6to4') ||
    n.includes('pseudo-interface') ||
    n.includes('iphttps') ||
    n.includes('wi-fi direct') ||
    n.startsWith('local area connection*')
  );
}

/** Classify adapter type from its name and description */
function classifyAdapter(name: string, internal: boolean, description = ''): AdapterType {
  const combined = (name + ' ' + description).toLowerCase();
  if (internal || isPseudoInterface(name)) return 'virtual';
  if (combined.includes('wi-fi') || combined.includes('wifi') || combined.includes('wireless') || combined.includes('wlan') || combined.includes('802.11')) return 'wifi';
  if (combined.includes('rndis') || combined.includes('usb') || combined.includes('tether') || combined.includes('mobile') || combined.includes('ncm') || combined.includes('remote ndis') || combined.includes('apple mobile')) return 'usb-tether';
  if (combined.includes('ethernet') || combined.includes('local area') || combined.includes('realtek') || combined.includes('intel') || combined.includes('killer') || combined.includes('gigabit') || combined.includes('lan')) return 'ethernet';
  return 'unknown';
}

/** Get hardware descriptions for interfaces via PowerShell on Windows */
function getAdapterDescriptions(): Map<string, string> {
  const map = new Map<string, string>();
  if (process.platform !== 'win32') return map;
  try {
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "Get-NetAdapter | Select-Object ifIndex, Name, InterfaceDescription | ConvertTo-Json"',
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (item && item.InterfaceDescription) {
        if (item.Name) map.set(item.Name, String(item.InterfaceDescription));
        if (item.ifIndex) map.set(String(item.ifIndex), String(item.InterfaceDescription));
      }
    }
  } catch {
    // Graceful fallback if PowerShell is restricted
  }
  return map;
}

/** Get all network adapters on this machine */
export function getAdapters(): NetworkAdapter[] {
  const nodeIfaces = os.networkInterfaces();
  const netshIfaces = parseNetshInterfaces();
  const gateways = parseGateways();
  const descriptions = getAdapterDescriptions();
  const adapters: NetworkAdapter[] = [];

  for (const [name, addresses] of Object.entries(nodeIfaces)) {
    if (!addresses || addresses.length === 0) continue;

    // Skip loopback, tunnel and virtual pseudo-interfaces
    if (isPseudoInterface(name) || addresses.some(a => a.internal)) continue;

    const ipv4Addr = addresses.find(a => a.family === 'IPv4');
    const ipv6Addr = addresses.find(a => a.family === 'IPv6' && !a.address.startsWith('fe80'));
    const mac = ipv4Addr?.mac ?? ipv6Addr?.mac ?? '00:00:00:00:00:00';

    const netsh = netshIfaces.get(name);
    const ifIndex = netsh?.ifIndex ?? 0;
    const gateway = ifIndex ? gateways.get(ifIndex) : undefined;

    const desc = descriptions.get(name) ?? (ifIndex ? descriptions.get(String(ifIndex)) : '') ?? '';
    const type = classifyAdapter(name, false, desc);
    const status: AdapterStatus = ipv4Addr ? 'connected' : 'disconnected';

    adapters.push({
      ifIndex,
      name,
      alias: netsh?.alias ?? name,
      type,
      status,
      ipv4: ipv4Addr?.address,
      ipv6: ipv6Addr?.address,
      mac,
      speedMbps: 0, // updated separately via systeminformation
      gateway,
      metric: netsh?.metric,
      includedInBonding: status === 'connected' && type !== 'virtual',
      killerDetected: false, // set after detectKillerServices()
    });
  }

  // Also pick up disconnected physical adapters that netsh knows about
  for (const [name, ni] of netshIfaces.entries()) {
    if (isPseudoInterface(name) || adapters.find(a => a.name === name)) continue;
    const desc = descriptions.get(name) ?? descriptions.get(String(ni.ifIndex)) ?? '';
    const type = classifyAdapter(name, false, desc);
    adapters.push({
      ifIndex: ni.ifIndex,
      name,
      alias: ni.alias,
      type,
      status: 'disconnected',
      mac: '00:00:00:00:00:00',
      speedMbps: 0,
      metric: ni.metric,
      includedInBonding: false,
      killerDetected: false,
    });
  }

  return adapters.sort((a, b) => a.ifIndex - b.ifIndex);
}

/** Poll adapter speed (Mbps) via netsh — called every few seconds */
export function getAdapterSpeeds(): Map<string, number> {
  const speeds = new Map<string, number>();
  try {
    const out = execSync('netsh interface show interface', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Admin State  State       Type             Interface Name
    // -------------------------------------------------------------------------
    // Enabled      Connected   Dedicated        Wi-Fi
    for (const line of out.split('\n')) {
      const m = line.match(/Enabled\s+Connected\s+\S+\s+(.+)/);
      if (m) {
        speeds.set(m[1].trim(), 0); // placeholder; actual speed from systeminformation
      }
    }
  } catch {
    // ignore
  }
  return speeds;
}
