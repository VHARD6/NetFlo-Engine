import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { LanGatewayConfig } from '../../shared/types';

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
      width: 180,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#090d16',
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
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-base">LAN Gateway & Hotspot Share</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Phase 3
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Share bonded connection with phones, iPads, consoles, or other laptops on local Wi-Fi.
            </p>
          </div>
        </div>

        {/* Enable / Disable Toggle */}
        <button
          onClick={() => onUpdate({ enabled: !config.enabled })}
          disabled={!isRunning}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            config.enabled ? 'bg-emerald-600' : 'bg-slate-700'
          } ${!isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={!isRunning ? 'Start NetFlo Engine first' : 'Toggle LAN Gateway'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Gateway Status & IP Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* Local IP */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Gateway Host IP</span>
            <button
              onClick={() => copyToClipboard(localIp, 'ip')}
              className="text-emerald-400 hover:text-emerald-300 font-mono text-[10px]"
            >
              {copiedField === 'ip' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="text-sm font-mono font-medium text-slate-200">{localIp}</div>
        </div>

        {/* HTTP / SOCKS Ports */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Proxy Ports</span>
            <span className="text-[10px] text-slate-400 font-mono">HTTP / SOCKS5</span>
          </div>
          <div className="text-sm font-mono font-medium text-slate-200">
            {httpPort} / {socksPort}
          </div>
        </div>

        {/* Connected Clients */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Connected Devices</span>
            <span
              className={`w-2 h-2 rounded-full ${
                config.enabled && isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
          </div>
          <div className="text-sm font-medium text-slate-200">
            {config.enabled ? `${config.activeClients} active client(s)` : 'Gateway Inactive'}
          </div>
        </div>
      </div>

      {/* Sharing Details & QR Code Drawer */}
      {config.enabled && (
        <div className="bg-slate-950/40 border border-emerald-900/30 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-emerald-300/90 font-medium flex items-center gap-1.5">
              <span>📱 Fast Mobile Device Setup</span>
            </div>
            <button
              onClick={() => setShowQr(!showQr)}
              className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/50 px-2.5 py-1 rounded border border-emerald-800/50 transition-colors"
            >
              {showQr ? 'Hide QR Code' : 'Scan QR Code'}
            </button>
          </div>

          {showQr && (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/80 rounded-lg border border-slate-800">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Proxy QR Code" className="w-36 h-36 rounded border border-slate-700 p-1 bg-[#090d16]" />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-500">Generating QR...</div>
              )}
              <div className="mt-2 text-center">
                <p className="text-xs font-mono text-emerald-300">{proxyUrl}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Scan or configure manual proxy in iOS / Android Wi-Fi settings</p>
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-400 bg-slate-900/90 p-2.5 rounded border border-slate-800 space-y-1">
            <div className="font-semibold text-slate-300">Quick Mobile Setup Guide:</div>
            <div>
              <span className="text-slate-200 font-medium">iPhone / iPad:</span> Settings &gt; Wi-Fi &gt; tap (i) &gt; Configure Proxy &gt; Manual &gt; Server: <span className="font-mono text-emerald-300">{localIp}</span>, Port: <span className="font-mono text-emerald-300">{httpPort}</span>
            </div>
            <div>
              <span className="text-slate-200 font-medium">Android:</span> Settings &gt; Wi-Fi &gt; Network Details &gt; Proxy &gt; Manual &gt; Host: <span className="font-mono text-emerald-300">{localIp}</span>, Port: <span className="font-mono text-emerald-300">{httpPort}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
