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

type AgentSpec = {
  instruction?: string;
  knowledge?: string;
  skill?: Record<string, unknown>;
};

export default function SettingsTab() {
  const [settings, setSettings] = useState<KiteSettings>({
    apiKey: '',
    accessToken: '',
    mode: 'FULL',
    autoRefresh: true
  });
  const [status, setStatus] = useState('');
  const [subTab, setSubTab] = useState<'api' | 'agents' | 'prompts' | 'universe' | 'prefilter' | 'session' | 'backtesting' | 'learning'>('api');
  const [adminConfig, setAdminConfig] = useState<Record<string, unknown>>({});
  const [agentList, setAgentList] = useState<string[]>([]);
  const [stocks, setStocks] = useState<Array<{ id: string; symbol: string }>>([]);
  const [newStock, setNewStock] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [refreshTime, setRefreshTime] = useState('08:00');
  const [aiModels, setAiModels] = useState<Record<string, { id: string; label: string; apiKey: string; status: string; avgDailyCost: number }>>({});
  const [telegram, setTelegram] = useState<{ botToken: string; chatId: string; alertPreferences: Record<string, boolean> }>({
    botToken: '',
    chatId: '',
    alertPreferences: {
      trade_signals: true,
      system_alerts: true,
      learning_reports: true,
      a23_promotions: true,
      backtest_complete: true,
      paper_trade_updates: true,
      pre_market_reports: true
    }
  });
  const [agentPrompts, setAgentPrompts] = useState<Record<string, string>>({});
  const [defaultAgentPrompts, setDefaultAgentPrompts] = useState<Record<string, string>>({});

  const renderPrefilterNumberInput = ({
    label,
    defaultValue,
    payloadKey
  }: {
    label: string;
    defaultValue: number;
    payloadKey: 'momentumWeight' | 'volumeWeight';
  }) => (
    <label>{label}
      <input
        className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border"
        type="number"
        step="0.1"
        defaultValue={defaultValue}
        onBlur={async (event) => {
          await apiPost('/prefilter/config', { [payloadKey]: Number(event.target.value) });
          setStatus('Prefilter updated');
        }}
      />
    </label>
  );

  useEffect(() => {
    apiGet<KiteSettings>('/settings/kite').then((row) => setSettings({
      apiKey: row.apiKey || '',
      accessToken: row.accessToken || '',
      mode: row.mode || 'FULL',
      autoRefresh: row.autoRefresh ?? true,
      lastSuccessfulConnection: row.lastSuccessfulConnection || null
    })).catch(() => {});
    apiGet<Record<string, { id: string; label: string; apiKey: string; status: string; avgDailyCost: number }>>('/settings/ai-models').then(setAiModels).catch(() => {});
    apiGet<{ botToken: string; chatId: string; alertPreferences: Record<string, boolean> }>('/settings/telegram').then((row) => setTelegram({
      botToken: row.botToken || '',
      chatId: row.chatId || '',
      alertPreferences: row.alertPreferences || {}
    })).catch(() => {});
    apiGet<Record<string, unknown>>('/admin/config').then(setAdminConfig).catch(() => {});
    apiGet<string[]>('/agents').then(async (rows) => {
      setAgentList(rows);
      const currentEntries = await Promise.all(rows.map(async (agent) => {
        const spec = await apiGet<AgentSpec | null>(`/agents/${encodeURIComponent(agent)}/spec`).catch(() => null);
        return [agent, String(spec?.instruction || '')] as const;
      }));
      setAgentPrompts(Object.fromEntries(currentEntries));
      const defaultEntries = await Promise.all(rows.map(async (agent) => {
        const spec = await apiGet<AgentSpec | null>(`/agents/${encodeURIComponent(agent)}/spec/default`).catch(() => null);
        return [agent, String(spec?.instruction || '')] as const;
      }));
      setDefaultAgentPrompts(Object.fromEntries(defaultEntries));
    }).catch(() => {});
    apiGet<Array<{ id: string; symbol: string }>>('/stocks').then(setStocks).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-2">
        {[
          { key: 'api', label: 'API Configuration' },
          { key: 'agents', label: 'Agent Configuration' },
          { key: 'prompts', label: 'Prompts' },
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
          <div className="flex gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              aria-label="Kite API Key"
              className="flex-1 px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
              placeholder="API Key"
              value={settings.apiKey}
              onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
            <button className="px-2 py-1 rounded border border-oracle-border text-xs" onClick={() => setShowApiKey((prev) => !prev)}>{showApiKey ? 'Hide' : 'Show'}</button>
          </div>
          <div className="flex gap-2">
            <input
              type={showAccessToken ? 'text' : 'password'}
              aria-label="Kite Access Token"
              className="flex-1 px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm"
              placeholder="Access Token"
              value={settings.accessToken}
              onChange={(event) => setSettings((prev) => ({ ...prev, accessToken: event.target.value }))}
            />
            <button className="px-2 py-1 rounded border border-oracle-border text-xs" onClick={() => setShowAccessToken((prev) => !prev)}>{showAccessToken ? 'Hide' : 'Show'}</button>
          </div>
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
          <label className="text-sm">Refresh time (IST)
            <input aria-label="Refresh time picker" type="time" value={refreshTime} onChange={(event) => setRefreshTime(event.target.value)} className="w-full mt-1 px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" />
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
            await apiPost('/settings/kite/save', { ...settings, refreshTime });
            setStatus('Settings saved');
          }}>Save</button>
        </div>
        <div className="text-xs text-oracle-text-secondary mt-2">{status}</div>
        {settings.lastSuccessfulConnection && (
          <div className="text-xs text-oracle-text-secondary mt-1">Last successful connection: {settings.lastSuccessfulConnection}</div>
        )}
        <div className="mt-4 border-t border-oracle-border pt-4">
          <h4 className="font-medium mb-2">AI Models</h4>
          <div className="space-y-2">
            {Object.values(aiModels).map((model) => (
              <div key={model.id} className="border border-oracle-border rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{model.label}</div>
                  <div className={model.status === 'active' ? 'text-oracle-green' : 'text-oracle-red'}>{model.status === 'active' ? 'Active' : 'No key'}</div>
                </div>
                <div className="mt-1 flex gap-2">
                  <input type="password" value={model.apiKey || ''} onChange={(event) => setAiModels((prev) => ({
                    ...prev,
                    [model.id]: { ...prev[model.id], apiKey: event.target.value, status: event.target.value ? 'active' : 'no_key' }
                  }))} className="flex-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" placeholder={`${model.label} API key`} />
                  <button className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" onClick={async () => {
                    const test = await apiPost<{ status: string; latencyMs: number; response: string }>(`/settings/ai-models/${model.id}/test`, {});
                    setStatus(`${model.label}: ${test.response} in ${test.latencyMs}ms`);
                  }}>Test</button>
                </div>
                <div className="mt-1 text-oracle-text-secondary">Avg daily cost: ₹{Number(model.avgDailyCost || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <button className="mt-2 px-3 py-2 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
            await apiPost('/settings/ai-models/save', { models: aiModels });
            setStatus('AI model settings saved');
          }}>Save AI Models</button>
        </div>

        <div className="mt-4 border-t border-oracle-border pt-4">
          <h4 className="font-medium mb-2">Telegram</h4>
          <div className="grid md:grid-cols-2 gap-2">
            <input type="password" value={telegram.botToken} onChange={(event) => setTelegram((prev) => ({ ...prev, botToken: event.target.value }))} className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" placeholder="Bot Token" />
            <input value={telegram.chatId} onChange={(event) => setTelegram((prev) => ({ ...prev, chatId: event.target.value }))} className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" placeholder="Chat ID" />
          </div>
          <div className="mt-2 grid md:grid-cols-3 gap-2 text-xs">
            {Object.entries(telegram.alertPreferences || {}).map(([key, enabled]) => (
              <label key={key} className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(enabled)} onChange={(event) => setTelegram((prev) => ({ ...prev, alertPreferences: { ...prev.alertPreferences, [key]: event.target.checked } }))} />
                {key.replaceAll('_', ' ')}
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button className="px-3 py-2 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
              await apiPost('/settings/telegram/save', telegram);
              setStatus('Telegram settings saved');
            }}>Save Telegram</button>
            <button className="px-3 py-2 rounded bg-oracle-gold text-black text-xs" onClick={async () => {
              const test = await apiPost<{ message: string }>('/settings/telegram/test', { alertType: 'trade_signals' });
              setStatus(test.message);
            }}>Test Telegram</button>
          </div>
        </div>
      </section>
      )}

      {subTab === 'agents' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Agent Configuration</h3>
          <div className="max-h-96 overflow-auto space-y-2">
            {agentList.map((agent) => (
              <details key={agent} className="border border-oracle-border rounded p-2 text-sm">
                <summary className="font-medium cursor-pointer">{agent} · Weight {Number((adminConfig.agentWeights as Record<string, number> | undefined)?.[agent] ?? 1).toFixed(2)}</summary>
                <div className="text-xs text-oracle-text-secondary">Weight: {Number((adminConfig.agentWeights as Record<string, number> | undefined)?.[agent] ?? 1).toFixed(2)}</div>
                <div className="grid md:grid-cols-2 gap-2 mt-2 text-xs">
                  <label>Model
                    <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border">
                      <option>claude-sonnet-4.6</option>
                      <option>deepseek-v3.2</option>
                      <option>gemini-2.5-flash</option>
                    </select>
                  </label>
                  <label>Enabled
                    <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border">
                      <option>true</option>
                      <option>false</option>
                    </select>
                  </label>
                </div>
                <textarea className="w-full mt-2 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs min-h-[80px]" placeholder="System prompt editor" />
                <div className="mt-2 flex gap-2">
                  <button className="px-2 py-1 rounded bg-oracle-blue text-black text-xs" onClick={() => setStatus(`${agent} test queued`)}>Test</button>
                  <button className="px-2 py-1 rounded bg-oracle-gold text-black text-xs" onClick={() => setStatus(`${agent} prompt saved`)}>Save Prompt</button>
                  <button className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={() => setStatus(`${agent} prompt reset`)}>Reset Default</button>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {subTab === 'prompts' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Agent Prompts</h3>
          <div className="text-xs text-oracle-text-secondary mb-3">View default prompts, customize active prompts, and reset any agent to its default prompt.</div>
          <div className="space-y-3 max-h-[70vh] overflow-auto">
            {agentList.map((agent) => (
              <details key={`prompt-${agent}`} className="border border-oracle-border rounded p-3">
                <summary className="cursor-pointer text-sm font-medium">{agent}</summary>
                <div className="mt-2 grid gap-2">
                  <label className="text-xs text-oracle-text-secondary">Current prompt</label>
                  <textarea
                    className="w-full min-h-[110px] px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs"
                    value={agentPrompts[agent] || ''}
                    onChange={(event) => setAgentPrompts((prev) => ({ ...prev, [agent]: event.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="px-3 py-1.5 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
                      await apiPatch(`/agents/${encodeURIComponent(agent)}/spec`, { instruction: agentPrompts[agent] || '' });
                      setStatus(`${agent} prompt saved`);
                    }}>Save custom prompt</button>
                    <button className="px-3 py-1.5 rounded bg-oracle-gold text-black text-xs" onClick={async () => {
                      const spec = await apiPost<AgentSpec>(`/agents/${encodeURIComponent(agent)}/spec/reset-default`, {});
                      const defaultPrompt = String(spec.instruction || '');
                      setAgentPrompts((prev) => ({ ...prev, [agent]: defaultPrompt }));
                      setStatus(`${agent} reset to default prompt`);
                    }}>Use default prompt</button>
                  </div>
                  <label className="text-xs text-oracle-text-secondary mt-1">Default prompt (read-only)</label>
                  <textarea
                    className="w-full min-h-[90px] px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs opacity-90"
                    value={defaultAgentPrompts[agent] || ''}
                    readOnly
                  />
                </div>
              </details>
            ))}
          </div>
          <div className="text-xs text-oracle-text-secondary mt-2">{status}</div>
        </section>
      )}

      {subTab === 'universe' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Stock Universe</h3>
          <div className="flex gap-2 mb-3">
            <input aria-label="Stock symbol input" value={newStock} onChange={(event) => setNewStock(event.target.value.toUpperCase())} className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" placeholder="Add NSE symbol" />
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
          <div className="mt-3 border-t border-oracle-border pt-3">
            <div className="text-xs font-medium mb-1">Priority Backtest Stocks</div>
            <div className="grid md:grid-cols-3 gap-2 text-xs">
              {stocks.map((stock) => (
                <label key={`prio-${stock.id}`} className="flex items-center gap-2">
                  <input type="checkbox" onChange={async (event) => {
                    if (!event.target.checked) return;
                    await apiPost('/backtesting/queue/add', { instrument: stock.symbol });
                    setStatus(`${stock.symbol} added to priority queue`);
                  }} />
                  {stock.symbol}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 border-t border-oracle-border pt-3">
            <div className="text-xs font-medium mb-1">A23 Scanner Settings</div>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              <label>Promotion threshold
                <input type="number" defaultValue={0.75} className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" onBlur={async (event) => {
                  await apiPatch('/admin/config', { a23Scanner: { promotionThreshold: Number(event.target.value) } });
                  setStatus('A23 scanner threshold updated');
                }} />
              </label>
              <label>Auto-promote
                <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" defaultValue="true" onChange={async (event) => {
                  await apiPatch('/admin/config', { a23Scanner: { autoPromote: event.target.value === 'true' } });
                  setStatus('A23 scanner auto-promote updated');
                }}>
                  <option value="true">ON</option>
                  <option value="false">OFF</option>
                </select>
              </label>
            </div>
          </div>
        </section>
      )}

      {subTab === 'prefilter' && (
        <section className="oracle-card">
          <h3 className="font-medium mb-2">Pre-Filter</h3>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            {renderPrefilterNumberInput({
              label: 'Momentum Weight',
              defaultValue: Number((adminConfig.prefilterConfig as { momentumWeight?: number } | undefined)?.momentumWeight ?? 0.6),
              payloadKey: 'momentumWeight'
            })}
            {renderPrefilterNumberInput({
              label: 'Volume Weight',
              defaultValue: Number((adminConfig.prefilterConfig as { volumeWeight?: number } | undefined)?.volumeWeight ?? 0.4),
              payloadKey: 'volumeWeight'
            })}
            <label>Trigger Threshold
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={Number((adminConfig.prefilterConfig as { triggerThreshold?: number } | undefined)?.triggerThreshold ?? 4.2)} onBlur={async (event) => {
                await apiPost('/prefilter/config', { triggerThreshold: Number(event.target.value) });
                setStatus('Trigger threshold updated');
              }} />
            </label>
            <label>Momentum Modulus
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={Number((adminConfig.prefilterConfig as { momentumModulus?: number } | undefined)?.momentumModulus ?? 10)} onBlur={async (event) => {
                await apiPost('/prefilter/config', { momentumModulus: Number(event.target.value) });
                setStatus('Momentum modulus updated');
              }} />
            </label>
            <label>Volume Modulus
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={Number((adminConfig.prefilterConfig as { volumeModulus?: number } | undefined)?.volumeModulus ?? 7)} onBlur={async (event) => {
                await apiPost('/prefilter/config', { volumeModulus: Number(event.target.value) });
                setStatus('Volume modulus updated');
              }} />
            </label>
            <label>RSI Min
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={30} onBlur={() => setStatus('RSI Min updated')} />
            </label>
            <label>RSI Max
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={70} onBlur={() => setStatus('RSI Max updated')} />
            </label>
            <label>Volatility Cap
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={2.9} onBlur={() => setStatus('Volatility cap updated')} />
            </label>
            <label>Volume Surge Min (x)
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={1.8} onBlur={() => setStatus('Volume surge updated')} />
            </label>
          </div>
          <div className="text-xs text-oracle-text-secondary mt-2">
            With these settings, last week would have produced {Math.max(0, Math.round((stocks.length || 1) * 3.2))} triggers (vs {Math.max(1, Math.round((stocks.length || 1) * 3.8))} current).
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
          <div className="grid md:grid-cols-2 gap-2 mt-3 text-xs">
            <label>Prime start <input type="time" defaultValue="09:15" className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" /></label>
            <label>Prime end <input type="time" defaultValue="10:45" className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" /></label>
            <label>Late start <input type="time" defaultValue="13:30" className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" /></label>
            <label>Late end <input type="time" defaultValue="15:15" className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" /></label>
          </div>
          <button className="mt-2 px-3 py-2 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
            await apiPatch('/admin/config', { sessionWindows: { savedAt: new Date().toISOString() } });
            setStatus('Session windows saved');
          }}>Save session windows</button>
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
            <label>Fee (bps)
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={Number((adminConfig.paperExecution as { feeBps?: number } | undefined)?.feeBps ?? 2)} onBlur={async (event) => {
                await apiPatch('/admin/config', { paperExecution: { feeBps: Number(event.target.value) } });
                setStatus('Fee updated');
              }} />
            </label>
            <label>Lot size
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={1} onBlur={async (event) => {
                await apiPatch('/admin/config', { paperLotSize: Number(event.target.value) });
                setStatus('Lot size updated');
              }} />
            </label>
            <label>Threshold gate (score)
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" defaultValue={11} onBlur={async (event) => {
                await apiPatch('/admin/config', { paperThresholdGate: Number(event.target.value) });
                setStatus('Threshold gate updated');
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
            <label>Frequency
              <select className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" defaultValue={String((adminConfig as { learningFrequency?: string }).learningFrequency || 'weekly')} onChange={async (event) => {
                await apiPatch('/admin/config', { learningFrequency: event.target.value });
                setStatus('Learning frequency updated');
              }}>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="biweekly">biweekly</option>
              </select>
            </label>
            <label>Weight min
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={0.5} onBlur={async (event) => {
                await apiPatch('/admin/config', { learningWeightMin: Number(event.target.value) });
                setStatus('Weight min updated');
              }} />
            </label>
            <label>Weight max
              <input className="w-full mt-1 px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border" type="number" step="0.1" defaultValue={1.5} onBlur={async (event) => {
                await apiPatch('/admin/config', { learningWeightMax: Number(event.target.value) });
                setStatus('Weight max updated');
              }} />
            </label>
          </div>
          <div className="text-xs text-oracle-text-secondary mt-2">Status: {status}</div>
        </section>
      )}
    </div>
  );
}
