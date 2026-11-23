/**
 * appDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Detects the originating Windows application process for active
 * TCP connections arriving at NetFlo's local SOCKS5 proxy server.
 *
 * Maps client ephemeral ports (e.g. 127.0.0.1:54321) to their owning
 * Windows process (e.g. "discord.exe", "chrome.exe", "steam.exe")
 * to enable Per-App Split Tunneling.
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CACHE_TTL_MS = 60_000; // Cache port mappings for 1 minute

export class AppDetector {
  private portCache = new Map<number, { name: string; expires: number }>();
  private pidNameCache = new Map<number, string>();
  private lastPidRefresh = 0;

  /**
   * Find the process name (e.g. "discord.exe") that initiated the SOCKS5
   * connection on the specified local client ephemeral port.
   */
  async getProcessForPort(clientPort: number, socksPort = 1080): Promise<string | null> {
    if (clientPort <= 0) return null;

    // 1. Check in-memory port cache
    const cached = this.portCache.get(clientPort);
    if (cached && cached.expires > Date.now()) {
      return cached.name;
    }

    try {
      // 2. Query netstat to find connection from clientPort -> socksPort
      const { stdout } = await execAsync(`netstat -ano -p tcp`, { windowsHide: true });
      const lines = stdout.split(/\r?\n/);

      let foundPid: number | null = null;
      const targetPattern = new RegExp(
        `127\\.0\\.0\\.1:${clientPort}\\s+127\\.0\\.0\\.1:${socksPort}\\s+ESTABLISHED\\s+(\\d+)`,
        'i'
      );

      for (const line of lines) {
        const match = line.match(targetPattern);
        if (match) {
          foundPid = parseInt(match[1], 10);
          break;
        }
      }

      if (foundPid === null || isNaN(foundPid)) {
        return null;
      }

      // 3. Resolve PID to process name
      let processName = await this.getProcessNameByPid(foundPid);
      if (processName) {
        processName = processName.toLowerCase();
        this.portCache.set(clientPort, {
          name: processName,
          expires: Date.now() + CACHE_TTL_MS,
        });
        return processName;
      }
    } catch {
      // Fallback silently if command fails
    }

    return null;
  }

  /**
   * Release cached port mapping when a client socket closes
   */
  releasePort(clientPort: number): void {
    this.portCache.delete(clientPort);
  }

  /**
   * Get process name from PID using cached map or tasklist
   */
  async getProcessNameByPid(pid: number): Promise<string | null> {
    if (pid <= 0) return null;

    if (this.pidNameCache.has(pid)) {
      return this.pidNameCache.get(pid)!;
    }

    // Refresh entire process table
    await this.refreshProcessTable();
    return this.pidNameCache.get(pid) ?? null;
  }

  /**
   * Enumerate currently running application executables on Windows
   */
  async getRunningApplications(): Promise<string[]> {
    await this.refreshProcessTable();
    const unique = new Set<string>();

    // System processes to ignore from app rules dropdown
    const ignoreList = new Set([
      'system idle process',
      'system',
      'registry',
      'smss.exe',
      'csrss.exe',
      'wininit.exe',
      'services.exe',
      'lsass.exe',
      'svchost.exe',
      'fontdrvhost.exe',
      'dwm.exe',
      'conhost.exe',
      'spoolsv.exe',
    ]);

    for (const name of this.pidNameCache.values()) {
      const lower = name.toLowerCase();
      if (!ignoreList.has(lower) && lower.endsWith('.exe')) {
        unique.add(lower);
      }
    }

    return Array.from(unique).sort();
  }

  private async refreshProcessTable(): Promise<void> {
    const now = Date.now();
    // Throttle refresh to at most once every 3 seconds
    if (now - this.lastPidRefresh < 3000 && this.pidNameCache.size > 0) {
      return;
    }

    try {
      const { stdout } = await execAsync('tasklist /FO CSV /NH', { windowsHide: true });
      const lines = stdout.split(/\r?\n/);
      const newMap = new Map<number, string>();

      for (const line of lines) {
        const match = line.match(/^"([^"]+)","(\d+)"/);
        if (match) {
          const name = match[1];
          const pid = parseInt(match[2], 10);
          newMap.set(pid, name);
        }
      }

      this.pidNameCache = newMap;
      this.lastPidRefresh = now;
    } catch {
      // Ignore errors
    }
  }
}

export const appDetector = new AppDetector();
