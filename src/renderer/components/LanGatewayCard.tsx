import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { LanGatewayConfig } from '../../shared/types';
import { IconShare, IconCopy, IconCheck, IconQr } from './Icons';

interface LanGatewayCardProps {
  config: LanGatewayConfig;
  onUpdate: (config: Partial<LanGatewayConfig>) => void;
  isRunning: boolean;
}

export const LanGatewayCard: React.FC<LanGatewayCardProps> = ({ config, onUpdate, isRunning }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showQr, setShowQr] = useState<boolean>(false);

  const localIp = config.localIp || '127.0.0.1';
  const httpPort = config.httpPort || 8080;
  const socksPort = config.socksPort || 1080;
  const proxyUrl = `http://${localIp}:${httpPort}`;

  useEffect(() => {
    QRCode.toDataURL(proxyUrl, {
      width: 140,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#090a0f',
      },
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [proxyUrl]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <span className="section-label">Local Area Network Gateway</span>
        {config.enabled && (
          <span className="badge-green text-[10px]">
            {config.activeClients > 0 ? `${config.activeClients} Active Clients` : 'Listening on 0.0.0.0'}
          </span>
        )}
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {/* Toggle row */}
        <div className="py-3 px-3 flex items-center justify-between gap-4 interactive-row">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-zinc-100">
              Share Aggregated Connection via Hotspot / Local Wi-Fi
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              Exposes NetFlo proxy endpoints to devices on your local subnet (phones, tablets, game consoles).
              RFC 1918 private subnet enforcement prevents unauthorized WAN exposure.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            onClick={() => onUpdate({ enabled: !config.enabled })}
            disabled={!isRunning}
            className={`
              relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150
              focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed
              ${config.enabled ? 'bg-emerald-500' : 'bg-zinc-800'}
            `}
          >
            <span
              className={`
                inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
                ${config.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>

        {/* Configuration sub-section */}
        {config.enabled && (
          <div className="py-3 px-3 bg-white/[0.015] space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-400 text-[11px]">HTTP Proxy (Browsers/iOS):</span>
                <div className="flex items-center gap-1.5 font-mono text-zinc-200">
                  <span>{localIp}:{httpPort}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${localIp}:${httpPort}`, 'http')}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5"
                  >
                    {copiedField === 'http' ? <IconCheck size={11} className="text-emerald-400" /> : <IconCopy size={11} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                <span className="text-zinc-400 text-[11px]">SOCKS5 Proxy (Native Apps):</span>
                <div className="flex items-center gap-1.5 font-mono text-zinc-200">
                  <span>{localIp}:{socksPort}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${localIp}:${socksPort}`, 'socks')}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5"
                  >
                    {copiedField === 'socks' ? <IconCheck size={11} className="text-emerald-400" /> : <IconCopy size={11} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
              >
                <IconQr size={12} />
                <span>{showQr ? 'Hide Mobile QR Code' : 'Show Mobile Setup QR'}</span>
              </button>

              <span className="text-[10px] text-zinc-500 font-mono">
                Active Client Sockets: {config.activeClients}
              </span>
            </div>

            {showQr && qrDataUrl && (
              <div className="pt-2 flex items-center gap-4">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-24 h-24 border border-white/[0.1] rounded bg-black p-1"
                />
                <div className="text-[11px] text-zinc-400 leading-relaxed space-y-1">
                  <div className="text-zinc-200 font-medium">Quick Mobile Proxy Setup</div>
                  <div>1. Connect your phone or tablet to the same Wi-Fi / Hotspot.</div>
                  <div>2. Open Wi-Fi settings &rarr; Configure Proxy &rarr; Manual.</div>
                  <div>3. Enter Host <span className="font-mono text-zinc-200">{localIp}</span> and Port <span className="font-mono text-zinc-200">{httpPort}</span>.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
