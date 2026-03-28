'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

type Setup = { id: string; symbol: string; decision: string; confidence: number; entryZone: string; stopLoss: number; targets: number[]; rationale: string; createdAt: string };
type Signal = { id: string; symbol: string; action: string; reason: string; createdAt: string };
type Log = { id: string; level: string; message: string; context: Record<string, unknown>; createdAt: string };
type AgentOutput = { id: string; agent: string; symbol: string; score: number; summary: string; createdAt: string };

type Config = {
  brainInstructions: string;
  agentWeights: Record<string, number>;
  apiConfig: Record<string, string>;
};

export default function Dashboard() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<AgentOutput[]>([]);
  const [query, setQuery] = useState('Analyze RELIANCE');
  const [manualSymbol, setManualSymbol] = useState('RELIANCE');
  const [config, setConfig] = useState<Config | null>(null);
  const [instruction, setInstruction] = useState('');

  const load = async () => {
    const [s1, s2, s3, s4, c] = await Promise.all([
      apiGet<Setup[]>('/setups'),
      apiGet<Signal[]>('/signals'),
      apiGet<Log[]>('/logs'),
      apiGet<AgentOutput[]>('/agent-outputs'),
      apiGet<Config>('/admin/config')
    ]);
    setSetups(s1);
    setSignals(s2);
    setLogs(s3);
    setAgentOutputs(s4);
    setConfig(c);
    setInstruction(c.brainInstructions || '');
  };

  useEffect(() => {
    load();
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8080').replace(/\/$/, '');
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = () => load();
    return () => ws.close();
  }, []);

  const topAgents = useMemo(() => agentOutputs.slice(0, 12), [agentOutputs]);
  const formatInr = useMemo(
    () => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }),
    []
  );
  const safeFormatInr = (value: unknown) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? formatInr.format(numeric) : String(value ?? '');
  };

  return (
    <div className="min-h-screen bg-bg text-slate-100 p-4 md:p-8 space-y-6">
      <header className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <h1 className="text-2xl font-bold tracking-wide">ORACLE Trading Intelligence</h1>
        <div className="flex gap-2">
          <input className="px-3 py-2 rounded bg-slate-800 border border-slate-600" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="px-4 py-2 rounded bg-accent text-black font-semibold" onClick={async () => { await apiPost('/ai/query', { query }); }}>Ask AI</button>
        </div>
      </header>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Live Setups</h2>
          <div className="space-y-3 max-h-72 overflow-auto">
            {setups.map((s) => (
              <details key={s.id} className="bg-slate-900 border border-slate-700 rounded p-2">
                <summary className="cursor-pointer flex justify-between"><span>{s.symbol} · {s.decision}</span><span>{Math.round(s.confidence * 100)}%</span></summary>
                <div className="text-xs mt-2 space-y-1">
                  <div>Entry: {s.entryZone}</div>
                  <div>SL: {safeFormatInr(s.stopLoss)}</div>
                  <div>Targets: {s.targets?.map((target) => safeFormatInr(target)).join(', ')}</div>
                  <div>{s.rationale}</div>
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Agent Outputs</h2>
          <div className="space-y-2 max-h-72 overflow-auto text-sm">
            {topAgents.map((o) => (
              <div key={o.id} className="border border-slate-700 rounded p-2">
                <div className="font-medium">{o.agent} · {o.symbol}</div>
                <div className="text-xs text-slate-300">Score: {o.score} · {o.summary}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Market Overview</h2>
          <div className="text-sm space-y-2">
            <p>Signals generated: {signals.length}</p>
            <p>Recent logs: {logs.length}</p>
            <div className="pt-2 flex gap-2">
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-600" value={manualSymbol} onChange={(e) => setManualSymbol(e.target.value.toUpperCase())} />
              <button className="px-4 py-2 rounded bg-sky-500" onClick={async () => { await apiPost('/admin/manual-analysis', { symbol: manualSymbol, price: 120 }); }}>Trigger Analysis</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Signal History</h2>
          <div className="space-y-2 max-h-72 overflow-auto text-sm">
            {signals.map((s) => (
              <div key={s.id} className="border border-slate-700 rounded p-2">
                <div>{s.symbol} · <span className="font-semibold">{s.action}</span></div>
                <div className="text-xs text-slate-300">{s.reason}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">System Logs</h2>
          <div className="space-y-2 max-h-72 overflow-auto text-xs">
            {logs.map((l) => (
              <div key={l.id} className="border border-slate-700 rounded p-2">
                <div className="uppercase">{l.level} · {l.message}</div>
                <div className="text-slate-300">{JSON.stringify(l.context)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Admin Panel</h2>
        {config && (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-medium">Brain Instructions</h3>
              <textarea className="w-full h-28 p-2 rounded bg-slate-800 border border-slate-600" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <button className="px-4 py-2 rounded bg-amber-500 text-black font-semibold" onClick={async () => { await apiPatch('/admin/config', { brainInstructions: instruction }); await load(); }}>Save Instructions</button>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">API Config</h3>
              <pre className="bg-slate-900 rounded p-2 border border-slate-700 overflow-auto">{JSON.stringify(config.apiConfig, null, 2)}</pre>
              <button className="px-4 py-2 rounded bg-purple-500" onClick={async () => { await apiPost('/admin/ingest/news', {}); await apiPost('/admin/ingest/company', {}); await load(); }}>Run Ingestion</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
