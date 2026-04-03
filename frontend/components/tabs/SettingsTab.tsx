'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

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
  const [subTab, setSubTab] = useState<'api' | 'agents' | 'universe' | 'prefilter' | 'session' | 'backtesting' | 'learning'>('api');
  const [adminConfig, setAdminConfig] = useState<Record<string, unknown>>({});
  const [agentList, setAgentList] = useState<string[]>([]);
  const [stocks, setStocks] = useState<Array<{ id: string; symbol: string }>>([]);
  const [newStock, setNewStock] = useState('');

  useEffect(() => {
    apiGet<KiteSettings>('/settings/kite').then((row) => setSettings({
      apiKey: row.apiKey || '',
      accessToken: row.accessToken || '',
      mode: row.mode || 'FULL',
      autoRefresh: row.autoRefresh ?? true,
      lastSuccessfulConnection: row.lastSuccessfulConnection || null
    })).catch(() => {});
    apiGet<Record<string, unknown>>('/admin/config').then(setAdminConfig).catch(() => {});
    apiGet<string[]>('/agents').then(setAgentList).catch(() => {});
    apiGet<Array<{ id: string; symbol: string }>>('/stocks').then(setStocks).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-2">
        {[
          { key: 'api', label: 'API Configuration' },
          { key: 'agents', label: 'Agent Configuration' },
          { key: 'universe', label: 'Stock Universe' },
          { key: 'prefilter', label: 'Pre-Filter' },
          { key: 'session', label: 'Session Windows' },
          { key: 'backtesting', label: 'Backtesting & Paper' },
          { key: 'learning', label: 'Learning System' }
        ].map((item) => (
          <button
            key={item.key}
            className={`px-3 py-2 rounded text-xs border ${subTab === item.key ? 'bg-oracle-gold text-black border-oracle-gold' : 'bg-oracle-tertiary border-oracle-border'}`}
            onClick={() => setSubTab(item.key as typeof subTab)}
          >
            {item.label}
          </button>
        ))}
      </section>

      {subTab === 'api' && (
      <section className="oracle-card">
        <h3 className="font-medium mb-3">API Configuration · Zerodha Kite</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            type="password"
            aria-label="Kite API Key"
            className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
            placeholder="API Key"
            value={settings.apiKey}
            onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
          <input
            type="password"
            aria-label="Kite Access Token"
            className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
            placeholder="Access Token"
            value={settings.accessToken}
            onChange={(event) => setSettings((prev) => ({ ...prev, accessToken: event.target.value }))}
          />
          <select
            aria-label="Kite connection mode"
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
              aria-label="Enable Kite auto-refresh"
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
          <button aria-label="Test Kite connection" className="px-3 py-2 rounded bg-oracle-gold text-black text-sm" onClick={async () => {
            const test = await apiPost<{ message?: string }>('/settings/kite/test', {}).catch(() => ({ message: 'Connection failed' }));
            setStatus(test.message || 'Test complete');
          }}>Test Connection</button>
          <button aria-label="Save Kite settings" className="px-3 py-2 rounded bg-oracle-blue text-black text-sm" onClick={async () => {
            await apiPost('/settings/kite/save', settings);
            setStatus('Settings saved');
          }}>Save</button>
        </div>
        <div className="text-xs text-oracle-text-secondary mt-2">{status}</div>
        {settings.lastSuccessfulConnection && (
          <div className="text-xs text-oracle-text-secondary mt-1">Last successful connection: {settings.lastSuccessfulConnection}</div>
        )}
      </section>
      )}

      {subTab === 'agents' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Agent Configuration</h3>
          <div className="max-h-96 overflow-auto space-y-2">
            {agentList.map((agent) => (
              <div key={agent} className="border border-oracle-border rounded p-2 text-sm">
                <div className="font-medium">{agent}</div>
                <div className="text-xs text-oracle-text-secondary">Weight: {Number((adminConfig.agentWeights as Record<string, number> | undefined)?.[agent] ?? 1).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {subTab === 'universe' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Stock Universe</h3>
          <div className="flex gap-2 mb-3">
            <input value={newStock} onChange={(event) => setNewStock(event.target.value.toUpperCase())} className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" placeholder="Add NSE symbol" />
            <button className="px-3 py-2 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
              if (!newStock.trim()) return;
              await apiPost('/stocks', { symbol: newStock.trim() });
              const rows = await apiGet<Array<{ id: string; symbol: string }>>('/stocks').catch(() => []);
              setStocks(rows);
              setNewStock('');
            }}>Add</button>
          </div>
          <div className="space-y-1 text-sm">
            {stocks.map((stock) => <div key={stock.id}>{stock.symbol}</div>)}
          </div>
        </section>
      )}

      {subTab === 'prefilter' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Pre-Filter</h3>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <label>Momentum Weight
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={Number((adminConfig.prefilterConfig as { momentumWeight?: number } | undefined)?.momentumWeight ?? 0.6)} onBlur={async (event) => {
                await apiPost('/prefilter/config', { momentumWeight: Number(event.target.value) });
                setStatus('Prefilter updated');
              }} />
            </label>
            <label>Volume Weight
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={Number((adminConfig.prefilterConfig as { volumeWeight?: number } | undefined)?.volumeWeight ?? 0.4)} onBlur={async (event) => {
                await apiPost('/prefilter/config', { volumeWeight: Number(event.target.value) });
                setStatus('Prefilter updated');
              }} />
            </label>
          </div>
        </section>
      )}

      {subTab === 'session' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Session Windows</h3>
          <div className="text-xs text-oracle-text-secondary mb-2">Prime / Secondary / Late / Blocked session window config scaffold.</div>
          <div className="h-10 rounded bg-oracle-tertiary border border-oracle-border flex overflow-hidden">
            <div className="w-[35%] bg-oracle-green/40 flex items-center justify-center text-[10px]">PRIME</div>
            <div className="w-[30%] bg-oracle-blue/30 flex items-center justify-center text-[10px]">SECONDARY</div>
            <div className="w-[20%] bg-oracle-orange/30 flex items-center justify-center text-[10px]">LATE</div>
            <div className="w-[15%] bg-oracle-red/40 flex items-center justify-center text-[10px]">BLOCKED</div>
          </div>
        </section>
      )}

      {subTab === 'backtesting' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Backtesting & Paper Trading</h3>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <label>Paper trading mode
              <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" defaultValue={String(adminConfig.paperModeEnabled ?? false)} onChange={async (event) => {
                await apiPatch('/admin/config', { paperModeEnabled: event.target.value === 'true' });
                setStatus('Paper mode updated');
              }}>
                <option value="false">OFF</option>
                <option value="true">SIMULATION ONLY</option>
              </select>
            </label>
            <label>Slippage (bps)
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={Number((adminConfig.paperExecution as { slippageBps?: number } | undefined)?.slippageBps ?? 3)} onBlur={async (event) => {
                await apiPatch('/admin/config', { paperExecution: { slippageBps: Number(event.target.value) } });
                setStatus('Slippage updated');
              }} />
            </label>
          </div>
        </section>
      )}

      {subTab === 'learning' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Learning System</h3>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <label>Darwinian evolution
              <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" defaultValue={String(adminConfig.autoReweightEnabled ?? true)} onChange={async (event) => {
                await apiPatch('/admin/config', { autoReweightEnabled: event.target.value === 'true' });
                setStatus('Learning toggle updated');
              }}>
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
            </label>
            <label>Auto mode
              <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" defaultValue={String(adminConfig.autoReweightMode ?? 'drift')} onChange={async (event) => {
                await apiPatch('/admin/config', { autoReweightMode: event.target.value });
                setStatus('Learning mode updated');
              }}>
                <option value="drift">drift</option>
                <option value="winrate-percentile">winrate-percentile</option>
              </select>
            </label>
          </div>
          <div className="text-xs text-oracle-text-secondary mt-2">Status: {status}</div>
        </section>
      )}
    </div>
  );
}
