'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

type Setup = {
  id: string;
  symbol: string;
  decision: string;
  confidence: number;
  effectiveConfidence?: number;
  confidenceDecayFactor?: number;
  entryZone: string;
  stopLoss: number;
  targets: number[];
  rationale: string;
  createdAt: string;
};
type Signal = { id: string; symbol: string; action: string; reason: string; createdAt: string };
type Log = { id: string; level: string; message: string; context: Record<string, unknown>; createdAt: string };
type AgentOutput = { id: string; agent: string; symbol: string; score: number; summary: string; createdAt: string };
type PaperTrade = { id: string; setupId: string; symbol: string; status: 'OPEN' | 'CLOSED'; pnl?: number; createdAt: string };
type PaperPortfolio = { balance: number; initialCapital: number; realizedPnl: number; openTrades: number };
type DecisionAudit = { id: string; symbol: string; decision: string; ev: number; avg: number; stdev: number; createdAt: string };
type RiskEvent = { id: string; eventType: string; drawdownPercent?: number; threshold?: number; action?: string; createdAt: string };
type SymbolMetric = { sampleSize: number; winRate: number; avgWin: number; avgLoss: number; profitFactor: number; expectancy: number };

type Config = {
  brainInstructions: string;
  agentWeights: Record<string, number>;
  apiConfig: Record<string, string>;
  useEVBrain?: boolean;
  evMinThreshold?: number;
  minWinRate?: number;
  minSymbolWinRateForTake?: number;
  forceOverrideDisagreement?: boolean;
  autoReweightEnabled?: boolean;
  autoReweightMode?: string;
  driftThreshold?: number;
  paperModeEnabled?: boolean;
  paperInitialCapital?: number;
  autoShutdownDrawdownPercent?: number;
  setupConfidenceDecayHours?: number;
  stockOverrides?: Record<string, { slMultiplier?: number; targetFactors?: number[] }>;
  prefilterConfig?: {
    momentumModulus?: number;
    volumeModulus?: number;
    momentumWeight?: number;
    volumeWeight?: number;
    triggerThreshold?: number;
  };
};

const PERCENT_SCALE = 100;

export default function Dashboard() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<AgentOutput[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [paperPortfolio, setPaperPortfolio] = useState<PaperPortfolio | null>(null);
  const [decisionAudits, setDecisionAudits] = useState<DecisionAudit[]>([]);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [symbolMetrics, setSymbolMetrics] = useState<Record<string, SymbolMetric>>({});
  const [query, setQuery] = useState('Analyze RELIANCE');
  const [manualSymbol, setManualSymbol] = useState('RELIANCE');
  const [config, setConfig] = useState<Config | null>(null);
  const [instruction, setInstruction] = useState('');
  const [overrideSymbol, setOverrideSymbol] = useState('RELIANCE');
  const [overrideSlMultiplier, setOverrideSlMultiplier] = useState('0.99');
  const [overrideTargets, setOverrideTargets] = useState('1.01,1.02,1.03');

  const load = async () => {
    const [s1, s2, s3, s4, c, trades, portfolio, audits, risks] = await Promise.all([
      apiGet<Setup[]>('/setups'),
      apiGet<Signal[]>('/signals'),
      apiGet<Log[]>('/logs'),
      apiGet<AgentOutput[]>('/agent-outputs'),
      apiGet<Config>('/admin/config'),
      apiGet<PaperTrade[]>('/paper/trades'),
      apiGet<PaperPortfolio>('/paper/portfolio'),
      apiGet<DecisionAudit[]>(`/admin/decision-audit/${encodeURIComponent(manualSymbol)}`).catch((error: unknown) => {
        console.error('Failed to load decision audits', error);
        return [];
      }),
      apiGet<RiskEvent[]>('/admin/risk-events').catch((error: unknown) => {
        console.error('Failed to load risk events', error);
        return [];
      })
    ]);
    setSetups(s1);
    setSignals(s2);
    setLogs(s3);
    setAgentOutputs(s4);
    setConfig(c);
    setPaperTrades(trades);
    setPaperPortfolio(portfolio);
    setDecisionAudits(audits);
    setRiskEvents(risks);
    setInstruction(c.brainInstructions || '');

    const symbols = [...new Set(s1.map((setup) => setup.symbol))].slice(0, 8);
    const metricsRows = await Promise.all(
      symbols.map(async (symbol) => [symbol, await apiGet<SymbolMetric>(`/metrics/${encodeURIComponent(symbol)}`)] as const)
    );
    setSymbolMetrics(Object.fromEntries(metricsRows));
  };

  useEffect(() => {
    load();
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE || 'ws://localhost:8080').replace(/\/$/, '');
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = () => load();
    return () => ws.close();
  }, []);

  const topAgents = useMemo(() => agentOutputs.slice(0, 12), [agentOutputs]);
  const paperTakenCount = useMemo(() => paperTrades.length, [paperTrades]);
  const paperClosed = useMemo(() => paperTrades.filter((trade) => trade.status === 'CLOSED'), [paperTrades]);
  const paperWins = useMemo(() => paperClosed.filter((trade) => Number(trade.pnl || 0) > 0).length, [paperClosed]);
  const paperHitRate = useMemo(() => (paperClosed.length ? (paperWins / paperClosed.length) * PERCENT_SCALE : 0), [paperClosed, paperWins]);
  const formatInr = useMemo(
    () => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }),
    []
  );

  const drawdownPercent = useMemo(() => {
    if (!paperPortfolio?.initialCapital) return 0;
    return ((paperPortfolio.initialCapital - paperPortfolio.balance) / paperPortfolio.initialCapital) * 100;
  }, [paperPortfolio]);

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

      {config?.paperModeEnabled === false && (
        <div className="card border border-rose-400 text-rose-300">
          Paper mode disabled. Drawdown: {drawdownPercent.toFixed(2)}%
        </div>
      )}

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Live Setups</h2>
          <div className="space-y-3 max-h-72 overflow-auto">
            {setups.map((setup) => (
              <details key={setup.id} className="bg-slate-900 border border-slate-700 rounded p-2">
                <summary className="cursor-pointer flex justify-between">
                  <span>{setup.symbol} · {setup.decision}</span>
                  <span>{Math.round((setup.effectiveConfidence ?? setup.confidence) * 100)}%</span>
                </summary>
                <div className="text-xs mt-2 space-y-1">
                  <div>Entry: {setup.entryZone}</div>
                  <div>SL: {safeFormatInr(setup.stopLoss)}</div>
                  <div>Targets: {setup.targets?.map((target) => safeFormatInr(target)).join(', ')}</div>
                  <div>Raw confidence: {(setup.confidence * 100).toFixed(1)}%</div>
                  {'effectiveConfidence' in setup && (
                    <div>Effective confidence: {((setup.effectiveConfidence || 0) * 100).toFixed(1)}% · Decay: {setup.confidenceDecayFactor}</div>
                  )}
                  <div>{setup.rationale}</div>
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Agent Outputs</h2>
          <div className="space-y-2 max-h-72 overflow-auto text-sm">
            {topAgents.map((output) => (
              <div key={output.id} className="border border-slate-700 rounded p-2">
                <div className="font-medium">{output.agent} · {output.symbol}</div>
                <div className="text-xs text-slate-300">Score: {output.score} · {output.summary}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Market Overview</h2>
          <div className="text-sm space-y-2">
            <p>Signals generated: {signals.length}</p>
            <p>Recent logs: {logs.length}</p>
            <p>Paper setups taken: {paperTakenCount}</p>
            <p>Paper closed trades: {paperClosed.length} · Hit rate: {paperHitRate.toFixed(1)}%</p>
            {paperPortfolio && (
              <p>Paper PnL: {safeFormatInr(paperPortfolio.realizedPnl)} · Balance: {safeFormatInr(paperPortfolio.balance)}</p>
            )}
            <div className="pt-2 flex gap-2">
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-600" value={manualSymbol} onChange={(e) => setManualSymbol(e.target.value.toUpperCase())} />
              <button className="px-4 py-2 rounded bg-sky-500" onClick={async () => { await apiPost('/admin/manual-analysis', { symbol: manualSymbol, price: 120 }); }}>Trigger Analysis</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Symbol Stats</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-sm">
            {Object.entries(symbolMetrics).map(([symbol, metric]) => (
              <div key={symbol} className="border border-slate-700 rounded p-2">
                <div className="font-medium">{symbol}</div>
                <div className="text-xs text-slate-300">
                  sample {metric.sampleSize} · win rate {(metric.winRate * 100).toFixed(1)}% · PF {metric.profitFactor.toFixed(2)} · expectancy {metric.expectancy.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Decision Audit ({manualSymbol})</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {decisionAudits.map((audit) => (
              <div key={audit.id} className="border border-slate-700 rounded p-2">
                <div>{audit.symbol} · {audit.decision} · ev {audit.ev}</div>
                <div className="text-slate-300">avg {audit.avg} · stdev {audit.stdev} · {audit.createdAt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Risk Events</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {riskEvents.map((risk) => (
              <div key={risk.id} className="border border-slate-700 rounded p-2">
                <div>{risk.eventType} · {risk.action}</div>
                <div className="text-slate-300">DD {risk.drawdownPercent ?? '-'} / threshold {risk.threshold ?? '-'} · {risk.createdAt}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Stock Override</h2>
          <div className="space-y-2 text-sm">
            <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={overrideSymbol} onChange={(e) => setOverrideSymbol(e.target.value.toUpperCase())} placeholder="RELIANCE.NS" />
            <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={overrideSlMultiplier} onChange={(e) => setOverrideSlMultiplier(e.target.value)} placeholder="SL multiplier" />
            <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={overrideTargets} onChange={(e) => setOverrideTargets(e.target.value)} placeholder="1.01,1.02,1.03" />
            <button
              className="px-4 py-2 rounded bg-indigo-500"
              onClick={async () => {
                const symbol = overrideSymbol.endsWith('.NS') ? overrideSymbol : `${overrideSymbol}.NS`;
                const targets = overrideTargets.split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
                if (!targets.length) return;
                await apiPatch('/admin/config', {
                  stockOverrides: {
                    [symbol]: {
                      slMultiplier: Number(overrideSlMultiplier),
                      targetFactors: targets
                    }
                  }
                });
                await load();
              }}
            >
              Save Override
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Admin Panel</h2>
        {config && (
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-medium">Brain Instructions</h3>
              <textarea className="w-full h-24 p-2 rounded bg-slate-800 border border-slate-600" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <button className="px-4 py-2 rounded bg-amber-500 text-black font-semibold" onClick={async () => { await apiPatch('/admin/config', { brainInstructions: instruction }); await load(); }}>Save Instructions</button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Controls</h3>
              <button className="px-4 py-2 rounded bg-emerald-600 mr-2" onClick={async () => { await apiPatch('/admin/config', { forceOverrideDisagreement: !config.forceOverrideDisagreement }); await load(); }}>
                forceOverrideDisagreement: {String(config.forceOverrideDisagreement)}
              </button>
              <button className="px-4 py-2 rounded bg-cyan-600 mr-2" onClick={async () => { await apiPatch('/admin/config', { autoReweightMode: config.autoReweightMode === 'winrate-percentile' ? 'drift' : 'winrate-percentile' }); await load(); }}>
                autoReweightMode: {config.autoReweightMode || 'drift'}
              </button>
              <button className="px-4 py-2 rounded bg-purple-500" onClick={async () => { await apiPost('/admin/ingest/news', {}); await apiPost('/admin/ingest/company', {}); await load(); }}>Run Ingestion</button>
              <button className="px-4 py-2 rounded bg-slate-600 ml-2" onClick={async () => {
                await apiPost('/prefilter/config', config.prefilterConfig || {});
                await load();
              }}>
                Push Prefilter Config
              </button>
              <div className="pt-2">
                <label className="block mb-1">Min win rate for TAKE</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.minSymbolWinRateForTake ?? 0.45}
                  onBlur={async (event) => {
                    await apiPatch('/admin/config', { minSymbolWinRateForTake: Number(event.target.value) });
                    await load();
                  }}
                />
              </div>
              <div>
                <label className="block mb-1">Setup confidence decay (hours)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.setupConfidenceDecayHours ?? 4}
                  onBlur={async (event) => {
                    await apiPatch('/admin/config', { setupConfidenceDecayHours: Number(event.target.value) });
                    await load();
                  }}
                />
              </div>
              <div>
                <label className="block mb-1">Auto shutdown drawdown %</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.autoShutdownDrawdownPercent ?? 20}
                  onBlur={async (event) => {
                    await apiPatch('/admin/config', { autoShutdownDrawdownPercent: Number(event.target.value) });
                    await load();
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
