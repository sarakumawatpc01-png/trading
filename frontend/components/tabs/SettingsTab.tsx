'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

type KiteSettings = {
  apiKey?: string;
  accessToken?: string;
  mode?: 'LTP' | 'QUOTE' | 'FULL';
  autoRefresh?: boolean;
  lastSuccessfulConnection?: string | null;
};

export default function SettingsTab() {
  const [settings, setSettings] = useState<KiteSettings>({
    apiKey: '',
    accessToken: '',
    mode: 'FULL',
    autoRefresh: true
  });
  const [status, setStatus] = useState('');

  useEffect(() => {
    apiGet<KiteSettings>('/settings/kite').then((row) => setSettings({
      apiKey: row.apiKey || '',
      accessToken: row.accessToken || '',
      mode: row.mode || 'FULL',
      autoRefresh: row.autoRefresh ?? true,
      lastSuccessfulConnection: row.lastSuccessfulConnection || null
    })).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <section className="oracle-card">
        <h3 className="font-medium mb-3">API Configuration · Zerodha Kite</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            type="password"
            className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
            placeholder="API Key"
            value={settings.apiKey}
            onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
          <input
            type="password"
            className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
            placeholder="Access Token"
            value={settings.accessToken}
            onChange={(event) => setSettings((prev) => ({ ...prev, accessToken: event.target.value }))}
          />
          <select
            className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
            value={settings.mode}
            onChange={(event) => setSettings((prev) => ({ ...prev, mode: event.target.value as KiteSettings['mode'] }))}
          >
            <option value="LTP">LTP</option>
            <option value="QUOTE">Quote</option>
            <option value="FULL">Full</option>
          </select>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(settings.autoRefresh)}
              onChange={(event) => setSettings((prev) => ({ ...prev, autoRefresh: event.target.checked }))}
            />
            Auto-refresh daily at 08:00 IST
          </label>
        </div>
        {settings.mode !== 'FULL' && (
          <div className="text-xs text-oracle-orange mt-2">Order book analysis requires FULL mode.</div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded bg-oracle-gold text-black text-sm" onClick={async () => {
            const test = await apiPost<{ message?: string }>('/settings/kite/test', {}).catch(() => ({ message: 'Connection failed' }));
            setStatus(test.message || 'Test complete');
          }}>Test Connection</button>
          <button className="px-3 py-2 rounded bg-oracle-blue text-black text-sm" onClick={async () => {
            await apiPost('/settings/kite/save', settings);
            setStatus('Settings saved');
          }}>Save</button>
        </div>
        <div className="text-xs text-oracle-text-secondary mt-2">{status}</div>
        {settings.lastSuccessfulConnection && (
          <div className="text-xs text-oracle-text-secondary mt-1">Last successful connection: {settings.lastSuccessfulConnection}</div>
        )}
      </section>
    </div>
  );
}
