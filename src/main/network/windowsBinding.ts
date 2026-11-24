/**
 * windowsBinding.ts
 * ─────────────────────────────────────────────────────────────
 * Binds a Node.js TCP connection to a specific network adapter using
 * the Windows IP_UNICAST_IF socket option via koffi → ws2_32.dll.
 *
 * WHY THIS WORKS:
 * Under Windows' "Weak Host Send" model, the routing table decides which
 * physical adapter sends packets. When USB tethering connects, its lower
 * metric causes all packets to be sent over USB even when Wi-Fi is intended,
 * resulting in dropped packets and Wi-Fi stalling.
 *
 * FIX:
 * By creating the Winsock socket directly, applying `IP_UNICAST_IF`
 * (optname 31) with the interface index in big-endian network byte order
 * BEFORE `connect()`, Windows routes the TCP handshake and all payload
 * strictly through the chosen adapter. We then wrap the connected native
 * socket in Node.js's standard `net.Socket`.
 */

import koffi from 'koffi';
import net from 'net';
import dns from 'dns/promises';

// ─── Winsock Types & Definitions ─────────────────────────────
let _initialized = false;
let socketFn: any = null;
let closesocket: any = null;
let setsockopt: any = null;
let connectFn: any = null;
let WSAGetLastError: any = null;
let htons: any = null;
let inet_addr: any = null;
let sockaddr_in_type: any = null;

const AF_INET = 2;
const SOCK_STREAM = 1;
const IPPROTO_TCP = 6;
const IPPROTO_IP = 0;
const IP_UNICAST_IF = 31; // Windows-specific interface binding

function initWinsock(): void {
  if (_initialized || process.platform !== 'win32') return;

  const ws2 = koffi.load('ws2_32.dll');

  sockaddr_in_type = koffi.struct('sockaddr_in', {
    sin_family: 'short',
    sin_port: 'ushort',
    sin_addr: 'uint32',
    sin_zero: koffi.array('char', 8),
  });

  socketFn = ws2.func('uint64 __stdcall socket(int af, int type, int protocol)');
  closesocket = ws2.func('int __stdcall closesocket(uint64 s)');
  setsockopt = ws2.func(
    'int __stdcall setsockopt(uint64 s, int level, int optname, const uint8_t *optval, int optlen)'
  );
  connectFn = ws2.func('int __stdcall connect(uint64 s, const sockaddr_in *name, int namelen)');
  WSAGetLastError = ws2.func('int __stdcall WSAGetLastError()');
  htons = ws2.func('ushort __stdcall htons(ushort hostshort)');
  inet_addr = ws2.func('uint32 __stdcall inet_addr(const char *cp)');

  _initialized = true;
}

// ─── DNS Cache & NAT64 Normalization ────────────────────────
interface DnsCacheEntry {
  ip: string;
  expires: number;
}
const dnsCache = new Map<string, DnsCacheEntry>();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function normalizeHost(host: string): string {
  if (!host) return '';
  let h = host.trim();
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.slice(1, -1);
  }
  // RFC 6052 NAT64 Well-Known Prefix 64:ff9b::/96
  const match = h.match(/^64:ff9b::([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})$/i);
  if (match) {
    const w1 = parseInt(match[1], 16);
    const w2 = parseInt(match[2], 16);
    return `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
  }
  const dottedMatch = h.match(/^64:ff9b::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dottedMatch) {
    return dottedMatch[1];
  }
  return h;
}

export function isLoopback(host: string): boolean {
  if (!host) return false;
  const h = normalizeHost(host).toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h.startsWith('127.');
}

export async function resolveHostToIpv4(host: string): Promise<string> {
  const normalized = normalizeHost(host);
  if (net.isIPv4(normalized)) return normalized;

  const cached = dnsCache.get(normalized);
  if (cached && cached.expires > Date.now()) {
    return cached.ip;
  }

  const lookup = await dns.lookup(normalized, { family: 4 });
  const ip = normalizeHost(lookup.address);
  dnsCache.set(normalized, {
    ip,
    expires: Date.now() + DNS_CACHE_TTL_MS,
  });
  return ip;
}

/** Clear the in-memory DNS cache */
export function clearDnsCache(): void {
  dnsCache.clear();
}

/**
 * Creates an outgoing TCP connection strictly bound to a specific Windows
 * network adapter by its interface index (ifIndex).
 *
 * @param ifIndex - Windows network interface index (e.g. 7 for Wi-Fi)
 * @param dstHost - Destination hostname or IPv4 address
 * @param dstPort - Destination TCP port
 */
export async function createBoundConnection(
  ifIndex: number,
  dstHost: string,
  dstPort: number
): Promise<net.Socket> {
  if (process.platform !== 'win32') {
    return new Promise((resolve, reject) => {
      const s = new net.Socket();
      s.once('error', reject);
      s.connect(dstPort, dstHost, () => resolve(s));
    });
  }

  // 1. Loopback bypass — never bind local IPC/RPC to an external physical adapter!
  if (isLoopback(dstHost)) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(dstPort, dstHost, () => resolve(s));
      s.once('error', reject);
    });
  }

  initWinsock();

  // 2. Resolve host to IPv4 address with caching and NAT64 translation
  const targetIp = await resolveHostToIpv4(dstHost);

  if (isLoopback(targetIp)) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(dstPort, targetIp, () => resolve(s));
      s.once('error', reject);
    });
  }

  // 3. Allocate native Winsock TCP socket
  const sock = socketFn(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (!sock || sock === 0xffffffff || sock === -1) {
    const err = WSAGetLastError ? WSAGetLastError() : -1;
    throw new Error(`[WindowsBinding] socket() failed: WSA error ${err}`);
  }

  // 4. Set IP_UNICAST_IF on the socket
  // Windows quirk: ifIndex must be in network byte order (big-endian)
  const ifBuf = Buffer.allocUnsafe(4);
  ifBuf.writeUInt32BE(ifIndex, 0);

  const optRes = setsockopt(sock, IPPROTO_IP, IP_UNICAST_IF, ifBuf, 4);
  if (optRes !== 0) {
    const err = WSAGetLastError();
    closesocket(sock);
    throw new Error(
      `[WindowsBinding] setsockopt(IP_UNICAST_IF, ifIndex=${ifIndex}) failed: ` +
      `WSA error ${err} (${wsaErrorName(err)})`
    );
  }

  // 5. Perform asynchronous connect
  const target = {
    sin_family: AF_INET,
    sin_port: htons(dstPort),
    sin_addr: inet_addr(targetIp),
    sin_zero: [0, 0, 0, 0, 0, 0, 0, 0],
  };

  return new Promise((resolve, reject) => {
    connectFn.async(sock, target, 16, (err: Error | null, res: number) => {
      if (err || res !== 0) {
        const wsaErr = WSAGetLastError ? WSAGetLastError() : -1;
        closesocket(sock);
        return reject(
          new Error(
            `[WindowsBinding] connect to ${targetIp}:${dstPort} via ifIndex ${ifIndex} failed: ` +
            `WSA error ${wsaErr} (${wsaErrorName(wsaErr)})`
          )
        );
      }

      try {
        // 6. Wrap the connected native socket in Node.js net.Socket
        const TCP = (process as any).binding('tcp_wrap').TCP;
        const handle = new TCP(1); // 1 = TCP socket type in libuv
        handle.open(sock);
        const socket = new (net.Socket as any)({ handle });
        resolve(socket);
      } catch (wrapErr) {
        closesocket(sock);
        reject(new Error(`[WindowsBinding] Failed to wrap native socket: ${wrapErr}`));
      }
    });
  });
}

/** Human-readable WSA error names for common network codes */
function wsaErrorName(code: number): string {
  const names: Record<number, string> = {
    10013: 'WSAEACCES (Permission denied)',
    10022: 'WSAEINVAL (Invalid argument)',
    10038: 'WSAENOTSOCK (Not a socket)',
    10049: 'WSAEADDRNOTAVAIL (Address not available)',
    10050: 'WSAENETDOWN (Network is down)',
    10051: 'WSAENETUNREACH (Network is unreachable)',
    10060: 'WSAETIMEDOUT (Connection timed out)',
    10061: 'WSAECONNREFUSED (Connection refused)',
    10065: 'WSAEHOSTUNREACH (Host is unreachable)',
  };
  return names[code] ?? `WSA error ${code}`;
}
