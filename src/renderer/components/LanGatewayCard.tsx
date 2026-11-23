import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { LanGatewayConfig } from '../../shared/types';
import { IconShare, IconPhone, IconCopy, IconCheck, IconQr } from './Icons';

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
      width: 160,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#08090a',
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
    <div className="card space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <IconShare size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[#f7f8f8]">LAN Gateway & Hotspot Share</h3>
              <span className="badge-green text-[10px] py-0 px-1.5">Ecosystem</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Share aggregated connection with mobile phones, tablets, or consoles on local Wi-Fi.
            </p>
          </div>
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => onUpdate({ enabled: !config.enabled })}
          disabled={!isRunning}
          className={`
            relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150
            focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
            ${config.enabled ? 'bg-emerald-500' : 'bg-surface-4'}
          `}
          title={!isRunning ? 'Start NetFlo Engine first' : 'Toggle LAN Gateway'}
        >
          <span
            className={`
              inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150
              ${config.enabled ? 'translate-x-4' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* Gateway Status & IP Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Local IP */}
        <div className="bg-surface-1 border border-white/[0.06] rounded-lg p-2.5">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-medium">
            <span>Gateway Host IP</span>
            <button
              type="button"
              onClick={() => copyToClipboard(localIp, 'ip')}
              className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px] flex items-center gap-0.5 cursor-pointer"
            >
              {copiedField === 'ip' ? <IconCheck size={10} /> : <IconCopy size={10} />}
              <span>{copiedField === 'ip' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="text-xs font-mono font-medium text-slate-200">{localIp}</div>
        </div>

        {/* HTTP / SOCKS Ports */}
        <div className="bg-surface-1 border border-white/[0.06] rounded-lg p-2.5">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-medium">
            <span>Proxy Ports</span>
            <span className="text-[10px] text-slate-500 font-mono">HTTP / SOCKS5</span>
          </div>
          <div className="text-xs font-mono font-medium text-slate-200">
            {httpPort} / {socksPort}
          </div>
        </div>

        {/* Connected Clients */}
        <div className="bg-surface-1 border border-white/[0.06] rounded-lg p-2.5 flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            <span>Connected Devices</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                config.enabled && isRunning ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
          </div>
          <div className="text-xs font-medium text-slate-200">
            {config.enabled ? `${config.activeClients} active device${config.activeClients === 1 ? '' : 's'}` : 'Gateway Inactive'}
          </div>
        </div>
      </div>

      {/* Details & QR Code Drawer */}
      {config.enabled && (
        <div className="bg-surface-1 border border-white/[0.06] rounded-lg p-3 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
              <IconPhone size={13} className="text-emerald-400" />
              <span>Mobile Device Setup</span>
            </div>
            <button
              type="button"
              onClick={() => setShowQr(!showQr)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 px-2.5 py-1 rounded-md border border-emerald-500/25 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <IconQr size={12} />
              <span>{showQr ? 'Hide QR Code' : 'Show QR Code'}</span>
            </button>
          </div>

          {showQr && (
            <div className="flex flex-col items-center justify-center p-3.5 bg-surface-2 rounded-lg border border-white/[0.07]">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Proxy QR Code" className="w-32 h-32 rounded-md border border-white/[0.1] p-1 bg-[#08090a]" />
              ) : (
                <div className="w-32 h-32 flex items-center justify-center text-xs text-slate-500">Generating QR...</div>
              )}
              <div className="mt-2 text-center">
                <p className="text-xs font-mono text-emerald-400">{proxyUrl}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Scan to configure proxy URL in iOS / Android Wi-Fi settings</p>
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400 bg-surface-2 p-2.5 rounded-md border border-white/[0.05] space-y-1">
            <div className="font-semibold text-slate-300">Manual Configuration:</div>
            <div>
              <span className="text-slate-300 font-medium">iOS:</span> Settings &gt; Wi-Fi &gt; Network (i) &gt; Configure Proxy &gt; Manual &gt; Server: <span className="font-mono text-emerald-400">{localIp}</span>, Port: <span className="font-mono text-emerald-400">{httpPort}</span>
            </div>
            <div>
              <span className="text-slate-300 font-medium">Android:</span> Settings &gt; Wi-Fi &gt; Network Details &gt; Proxy &gt; Manual &gt; Host: <span className="font-mono text-emerald-400">{localIp}</span>, Port: <span className="font-mono text-emerald-400">{httpPort}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
