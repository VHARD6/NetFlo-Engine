/**
 * subnetCheck.ts
 * ─────────────────────────────────────────────────────────────
 * Subnet verification helper to ensure LAN Gateway proxies
 * only accept requests from RFC 1918 private subnets and loopback,
 * preventing accidental exposure to public WAN networks.
 */

import net from 'net';

/**
 * Checks whether an IP address belongs to a private / local subnet.
 * Supports IPv4, IPv6, IPv4-mapped IPv6 (::ffff:x.x.x.x), and scoped addresses (%eth0).
 */
export function isPrivateSubnet(clientIp: string): boolean {
  if (!clientIp || typeof clientIp !== 'string') return false;

  let ip = clientIp.trim().toLowerCase();

  // Strip IPv6 zone / scope ID (e.g. fe80::1%12 or fe80::1%eth0)
  const scopeIdx = ip.indexOf('%');
  if (scopeIdx !== -1) {
    ip = ip.substring(0, scopeIdx);
  }

  // Handle IPv4-mapped IPv6 address (e.g. ::ffff:192.168.1.5)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) {
      return false;
    }

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 10.0.0.0/8 (Private-Use Networks)
    if (parts[0] === 10) return true;

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16 (Private-Use Networks)
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 169.254.0.0/16 (Link Local)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 0.0.0.0 (Unspecified / local host)
    if (ip === '0.0.0.0') return true;

    return false;
  }

  // IPv6 checks
  if (net.isIPv6(ip)) {
    // ::1 (Loopback)
    if (ip === '::1' || ip === '::') return true;
    // Link local: fe80::/10
    if (ip.startsWith('fe80:')) return true;
    // Unique local address: fc00::/7 (fc00:: - fdff::)
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    return false;
  }

  return false;
}
