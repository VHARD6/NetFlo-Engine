/**
 * wintun.ts
 * ─────────────────────────────────────────────────────────────
 * Wintun Virtual Network Adapter integration via Koffi.
 *
 * Provides a high-performance Layer 3 (TUN) virtual Ethernet device
 * on Windows that captures raw IP packets from any application.
 *
 * Uses the official signed wintun.dll (WireGuard / ZX2C4).
 */

import koffi from 'koffi';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { EventEmitter } from 'events';

export class WintunAdapter extends EventEmitter {
  private wintun: any = null;
  private adapterHandle: any = null;
  private sessionHandle: any = null;
  private isRunning = false;
  private receiveLoopPromise: Promise<void> | null = null;

  // Wintun C Functions
  private WintunCreateAdapter: any = null;
  private WintunOpenAdapter: any = null;
  private WintunCloseAdapter: any = null;
  private WintunDeleteAdapter: any = null;
  private WintunStartSession: any = null;
  private WintunEndSession: any = null;
  private WintunReceivePacket: any = null;
  private WintunReleaseReceivePacket: any = null;
  private WintunAllocateSendPacket: any = null;
  private WintunSendPacket: any = null;

  constructor() {
    super();
    this.initLibrary();
  }

  private initLibrary(): void {
    if (process.platform !== 'win32') return;

    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    let dllPath = path.resolve(__dirname, '../../resources/wintun', arch, 'wintun.dll');

    if (!fs.existsSync(dllPath)) {
      dllPath = path.resolve(__dirname, '../../../resources/wintun', arch, 'wintun.dll');
    }
    if (!fs.existsSync(dllPath) && (process as any).resourcesPath) {
      dllPath = path.join((process as any).resourcesPath, 'wintun', arch, 'wintun.dll');
    }

    if (!fs.existsSync(dllPath)) {
      throw new Error(`[Wintun] wintun.dll not found at ${dllPath}`);
    }

    this.wintun = koffi.load(dllPath);

    this.WintunCreateAdapter = this.wintun.func(
      'void* __stdcall WintunCreateAdapter(const uint16_t *Name, const uint16_t *TunnelType, const uint8_t *RequestedGUID)'
    );
    this.WintunOpenAdapter = this.wintun.func(
      'void* __stdcall WintunOpenAdapter(const uint16_t *Name)'
    );
    this.WintunCloseAdapter = this.wintun.func(
      'void __stdcall WintunCloseAdapter(void *Adapter)'
    );
    this.WintunDeleteAdapter = this.wintun.func(
      'bool __stdcall WintunDeleteAdapter(void *Adapter)'
    );
    this.WintunStartSession = this.wintun.func(
      'void* __stdcall WintunStartSession(void *Adapter, uint32_t Capacity)'
    );
    this.WintunEndSession = this.wintun.func(
      'void __stdcall WintunEndSession(void *Session)'
    );
    this.WintunReceivePacket = this.wintun.func(
      'uint8_t* __stdcall WintunReceivePacket(void *Session, _Out_ uint32_t *PacketSize)'
    );
    this.WintunReleaseReceivePacket = this.wintun.func(
      'void __stdcall WintunReleaseReceivePacket(void *Session, const uint8_t *Packet)'
    );
    this.WintunAllocateSendPacket = this.wintun.func(
      'uint8_t* __stdcall WintunAllocateSendPacket(void *Session, uint32_t PacketSize)'
    );
    this.WintunSendPacket = this.wintun.func(
      'void __stdcall WintunSendPacket(void *Session, const uint8_t *Packet)'
    );
  }

  /** Create and initialize the NetFlo virtual network adapter */
  public start(adapterName = 'NetFlo', ip = '10.100.0.1', netmask = '255.255.255.0'): void {
    if (this.isRunning) return;

    const nameBuf = Buffer.from(adapterName + '\0', 'utf16le');
    const typeBuf = Buffer.from('NetFlo\0', 'utf16le');

    // Attempt to open existing or create new
    this.adapterHandle = this.WintunOpenAdapter(nameBuf);
    if (!this.adapterHandle) {
      this.adapterHandle = this.WintunCreateAdapter(nameBuf, typeBuf, null);
    }

    if (!this.adapterHandle) {
      throw new Error(`[Wintun] Failed to create or open adapter "${adapterName}". Ensure app is running as Administrator.`);
    }

    // Configure IP address on virtual interface
    try {
      execFileSync(
        'netsh',
        ['interface', 'ip', 'set', 'address', `name=${adapterName}`, 'source=static', `addr=${ip}`, `mask=${netmask}`],
        { stdio: 'ignore', timeout: 5000, windowsHide: true }
      );
      console.log(`[Wintun] Configured ${adapterName} with IP ${ip}/${netmask}`);
    } catch (e) {
      console.warn(`[Wintun] IP configuration warning:`, e);
    }

    // Start ring buffer session (capacity 0x400000 = 4MB)
    this.sessionHandle = this.WintunStartSession(this.adapterHandle, 0x400000);
    if (!this.sessionHandle) {
      throw new Error('[Wintun] Failed to start Wintun session');
    }

    this.isRunning = true;
    this.startReceiveLoop();
  }

  /** Continuous loop reading packets from virtual adapter */
  private startReceiveLoop(): void {
    this.receiveLoopPromise = (async () => {
      while (this.isRunning && this.sessionHandle) {
        try {
          const sizeBuf = [0];
          const pktPtr = this.WintunReceivePacket(this.sessionHandle, sizeBuf);
          const size = sizeBuf[0];

          if (pktPtr && size > 0) {
            // Read raw IP packet buffer
            const packetBuffer = koffi.decode(pktPtr, 'uint8_t', size);
            this.emit('packet', Buffer.from(packetBuffer));
            this.WintunReleaseReceivePacket(this.sessionHandle, pktPtr);
          } else {
            // Small idle delay when queue empty
            await new Promise(r => setTimeout(r, 2));
          }
        } catch {
          if (!this.isRunning) break;
          await new Promise(r => setTimeout(r, 10));
        }
      }
    })();
  }

  /** Write a response packet back into the virtual adapter to deliver to client apps */
  public sendPacket(packet: Buffer): void {
    if (!this.isRunning || !this.sessionHandle) return;
    try {
      const sendPtr = this.WintunAllocateSendPacket(this.sessionHandle, packet.length);
      if (sendPtr) {
        koffi.encode(sendPtr, 'uint8_t', packet, packet.length);
        this.WintunSendPacket(this.sessionHandle, sendPtr);
      }
    } catch (e) {
      console.error('[Wintun] Send packet error:', e);
    }
  }

  /** Teardown and clean up the virtual adapter */
  public stop(): void {
    this.isRunning = false;

    if (this.sessionHandle) {
      this.WintunEndSession(this.sessionHandle);
      this.sessionHandle = null;
    }

    if (this.adapterHandle) {
      this.WintunCloseAdapter(this.adapterHandle);
      this.adapterHandle = null;
    }

    console.log('[Wintun] Adapter stopped');
  }
}
