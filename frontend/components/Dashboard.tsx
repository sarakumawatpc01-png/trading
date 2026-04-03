'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPatch, apiPost, DebouncedConfigWriter } from '../lib/api';

type Setup = {
  id: string;
  symbol: string;
  decision: string;
  confidence: number;
  calibratedConfidence?: number;
  effectiveConfidence?: number;
  confidenceDecayFactor?: number;
  entryZone: string;
  stopLoss: number;
  targets: number[];
  riskReward?: number;
  estimatedCostBps?: number;
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
type UiNotice = { type: 'success' | 'error' | 'info'; text: string };
type RegimeMetric = { trendState: string; volBucket: string; eventDay: string; sampleSize: number; hitRate: number; expectancy: number; minSampleMet: boolean; confidenceInterval: { low: number; high: number } };
type AgentContributionMetric = { agent: string; sampleSize: number; resolvedSampleSize: number; hitRate: number; contributionScore: number; realizedPnl: number };
type SignalEffectivenessMetric = { symbol: string; decision: string; trendState: string; volBucket: string; eventDay: string; sampleSize: number; hitRate: number; expectancy: number };
type DashboardTab = 'overview' | 'agents' | 'analytics' | 'admin' | 'backtest';
type BacktestResult = {
  id?: string;
  symbol: string;
  sampleSize: number;
  takeCount: number;
  resolvedTakeCount?: number;
  hitRate: number;
  hitRateCiLow?: number;
  hitRateCiHigh?: number;
  minSampleMet?: boolean;
  warnings?: string[];
};

type Config = {
  brainInstructions: string;
  agentWeights: Record<string, number>;
  apiConfig: Record<string, string>;
  brokerConfig?: {
    provider?: string;
    environment?: string;
    apiKeyEnv?: string;
    apiSecretEnv?: string;
    redirectUrlEnv?: string;
    accessTokenEnv?: string;
  };
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
  ['real money- direct trading on zerodha']?: boolean;
  autoShutdownDrawdownPercent?: number;
  paperExecution?: {
    slippageBps?: number;
    feeBps?: number;
    latencyMs?: number;
  };
  setupConfidenceDecayHours?: number;
  setupMinRiskReward?: number;
  maxEstimatedCostBps?: number;
  noTradeMinConsensus?: number;
  noTradeHighVolStdevThreshold?: number;
  stockOverrides?: Record<string, { slMultiplier?: number; targetFactors?: number[] }>;
  watchlistBuckets?: {
    oneSecond?: { symbols?: string[]; maxSymbols?: number };
    tradeOneSecond?: { symbols?: string[]; maxSymbols?: number };
    fiveSecond?: { symbols?: string[]; maxSymbols?: number };
    sixtySecond?: { symbols?: string[]; maxSymbols?: number };
  };
  optionAnalytics?: {
    strikesAroundAtm?: number;
    expiries?: string;
    includeAllScopes?: boolean;
    includeAllAnalytics?: boolean;
    priorityOrder?: string[];
  };
  prefilterConfig?: {
    momentumModulus?: number;
    volumeModulus?: number;
    momentumWeight?: number;
    volumeWeight?: number;
    triggerThreshold?: number;
  };
};

const PERCENT_SCALE = 100;
const MAX_SYMBOL_METRICS = 8;
const DEFAULT_MANUAL_ANALYSIS_PRICE = 120;
const DEFAULT_WIN_RATE_GATE = 0.45;
const DEFAULT_CONFIDENCE_DECAY_HOURS = 4;
const DEFAULT_DRAWDOWN_SHUTDOWN_PERCENT = 20;
const REAL_TRADING_KEY = 'real money- direct trading on zerodha';
const DEFAULT_PRIORITY_ORDER = ['PCR', 'OI build-up', 'Max pain', 'IV', 'Greeks', 'Skew', 'IV rank'];
const DEFAULT_BUCKET_LIMITS = {
  oneSecond: 5,
  tradeOneSecond: 5,
  fiveSecond: 10,
  sixtySecond: 50
};
const DASHBOARD_TABS: Array<{ key: DashboardTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'agents', label: 'AI Agents' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'admin', label: 'Admin & Broker' },
  { key: 'backtest', label: 'Backtests' }
];

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
  const [notice, setNotice] = useState<UiNotice | null>(null);
  const [regimeMatrix, setRegimeMatrix] = useState<RegimeMetric[]>([]);
  const [agentContribution, setAgentContribution] = useState<AgentContributionMetric[]>([]);
  const [signalEffectiveness, setSignalEffectiveness] = useState<SignalEffectivenessMetric[]>([]);
  const [latestBacktest, setLatestBacktest] = useState<BacktestResult | null>(null);
  const [agentNames, setAgentNames] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [configDraft, setConfigDraft] = useState({
    minSymbolWinRateForTake: DEFAULT_WIN_RATE_GATE,
    setupConfidenceDecayHours: DEFAULT_CONFIDENCE_DECAY_HOURS,
    autoShutdownDrawdownPercent: DEFAULT_DRAWDOWN_SHUTDOWN_PERCENT
  });
  const [watchlistDraft, setWatchlistDraft] = useState({
    oneSecond: '',
    tradeOneSecond: '',
    fiveSecond: '',
    sixtySecond: ''
  });
  const [analyticsDraft, setAnalyticsDraft] = useState({
    strikesAroundAtm: 10,
    expiries: 'all',
    includeAllScopes: true,
    includeAllAnalytics: true,
    priorityOrder: DEFAULT_PRIORITY_ORDER.join(', ')
  });
  const [brokerDraft, setBrokerDraft] = useState({
    provider: 'zerodha-kite',
    environment: 'prod',
    apiKeyEnv: 'KITE_API_KEY',
    apiSecretEnv: 'KITE_API_SECRET',
    redirectUrlEnv: 'KITE_REDIRECT_URL',
    accessTokenEnv: 'KITE_ACCESS_TOKEN'
  });
  const [loading, setLoading] = useState(false);
  const configWriterRef = useRef<DebouncedConfigWriter | null>(null);
  if (!configWriterRef.current) {
    configWriterRef.current = new DebouncedConfigWriter();
  }

  const load = async () => {
    setLoading(true);
    const [s1, s2, s3, s4, c, trades, portfolio, audits, risks, regimes, contributions, effectiveness, agentList] = await Promise.all([
      apiGet<Setup[]>('/setups'),
      apiGet<Signal[]>('/signals'),
      apiGet<Log[]>('/logs'),
      apiGet<AgentOutput[]>('/agent-outputs'),
      apiGet<Config>('/admin/config'),
      apiGet<PaperTrade[]>('/paper/trades'),
      apiGet<PaperPortfolio>('/paper/portfolio'),
      apiGet<DecisionAudit[]>(`/admin/decision-audit/${encodeURIComponent(manualSymbol)}`).catch((error: unknown) => {
        console.error('Failed to load decision audits', error);
        setNotice({ type: 'error', text: 'Could not load decision audit right now.' });
        return [];
      }),
      apiGet<RiskEvent[]>('/admin/risk-events').catch((error: unknown) => {
        console.error('Failed to load risk events', error);
        setNotice({ type: 'error', text: 'Could not load risk events right now.' });
        return [];
      }),
      apiGet<RegimeMetric[]>('/admin/regime-matrix').catch(() => []),
      apiGet<AgentContributionMetric[]>(`/admin/agent-contribution-metrics?symbol=${encodeURIComponent(manualSymbol)}`).catch(() => []),
      apiGet<SignalEffectivenessMetric[]>(`/admin/signal-effectiveness?symbol=${encodeURIComponent(manualSymbol)}`).catch(() => []),
      apiGet<string[]>('/agents').catch(() => [])
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
    setRegimeMatrix(regimes);
    setAgentContribution(contributions);
    setSignalEffectiveness(effectiveness);
    setAgentNames(agentList);
    setInstruction(c.brainInstructions || '');
    setConfigDraft({
      minSymbolWinRateForTake: c.minSymbolWinRateForTake ?? DEFAULT_WIN_RATE_GATE,
      setupConfidenceDecayHours: c.setupConfidenceDecayHours ?? DEFAULT_CONFIDENCE_DECAY_HOURS,
      autoShutdownDrawdownPercent: c.autoShutdownDrawdownPercent ?? DEFAULT_DRAWDOWN_SHUTDOWN_PERCENT
    });
    const buckets = c.watchlistBuckets || {};
    setWatchlistDraft({
      oneSecond: (buckets.oneSecond?.symbols || []).join(', '),
      tradeOneSecond: (buckets.tradeOneSecond?.symbols || []).join(', '),
      fiveSecond: (buckets.fiveSecond?.symbols || []).join(', '),
      sixtySecond: (buckets.sixtySecond?.symbols || []).join(', ')
    });
    const analytics = c.optionAnalytics || {};
    setAnalyticsDraft({
      strikesAroundAtm: analytics.strikesAroundAtm ?? 10,
      expiries: analytics.expiries ?? 'all',
      includeAllScopes: analytics.includeAllScopes ?? true,
      includeAllAnalytics: analytics.includeAllAnalytics ?? true,
      priorityOrder: (analytics.priorityOrder || DEFAULT_PRIORITY_ORDER).join(', ')
    });
    const broker = c.brokerConfig || {};
    setBrokerDraft({
      provider: broker.provider || 'zerodha-kite',
      environment: broker.environment || 'prod',
      apiKeyEnv: broker.apiKeyEnv || 'KITE_API_KEY',
      apiSecretEnv: broker.apiSecretEnv || 'KITE_API_SECRET',
      redirectUrlEnv: broker.redirectUrlEnv || 'KITE_REDIRECT_URL',
      accessTokenEnv: broker.accessTokenEnv || 'KITE_ACCESS_TOKEN'
    });

    const symbols = [...new Set(s1.map((setup) => setup.symbol))].slice(0, MAX_SYMBOL_METRICS);
    const metricsRows = await Promise.all(
      symbols.map(async (symbol) => [symbol, await apiGet<SymbolMetric>(`/metrics/${encodeURIComponent(symbol)}`)] as const)
    );
    setSymbolMetrics(Object.fromEntries(metricsRows));
    setLoading(false);
  };

  const runAction = async (action: () => Promise<void>, successText: string, errorText: string) => {
    try {
      await action();
      setNotice({ type: 'success', text: successText });
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', text: errorText });
    }
  };

  const validateField = async (key: string, value: number) => {
    try {
      const result = await apiPost<{ ok: boolean; error: string | null }>('/admin/validate-config-field', { key, value });
      setFieldErrors((prev) => ({ ...prev, [key]: result.ok ? '' : String(result.error || 'Invalid value') }));
      return result.ok;
    } catch (_error) {
      setFieldErrors((prev) => ({ ...prev, [key]: 'Validation failed' }));
      return false;
    }
  };

  const queueConfigUpdate = async (key: string, value: number) => {
    const ok = await validateField(key, value);
    if (!ok) return;
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    await configWriterRef.current?.queue({ [key]: value });
    setNotice({ type: 'info', text: `${key} queued for save.` });
  };

  const parseSymbolList = (value: string) => {
    const pieces = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    return Array.from(new Set(pieces));
  };

  const parsePriorityList = (value: string) => {
    const pieces = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    return pieces.length ? pieces : DEFAULT_PRIORITY_ORDER;
  };

  const watchlistLimits = useMemo(() => ({
    oneSecond: config?.watchlistBuckets?.oneSecond?.maxSymbols ?? DEFAULT_BUCKET_LIMITS.oneSecond,
    tradeOneSecond: config?.watchlistBuckets?.tradeOneSecond?.maxSymbols ?? DEFAULT_BUCKET_LIMITS.tradeOneSecond,
    fiveSecond: config?.watchlistBuckets?.fiveSecond?.maxSymbols ?? DEFAULT_BUCKET_LIMITS.fiveSecond,
    sixtySecond: config?.watchlistBuckets?.sixtySecond?.maxSymbols ?? DEFAULT_BUCKET_LIMITS.sixtySecond
  }), [config]);

  useEffect(() => {
    load();
    const configuredWsBase = process.env.NEXT_PUBLIC_WS_BASE;
    if (!configuredWsBase) return;
    const wsBase = configuredWsBase.replace(/\/$/, '');
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

  const decisionCounts = useMemo(() => ({
    take: setups.filter((setup) => setup.decision === 'TAKE').length,
    wait: setups.filter((setup) => setup.decision === 'WAIT').length,
    skip: setups.filter((setup) => setup.decision === 'SKIP').length
  }), [setups]);

  const agentRoster = useMemo(() => {
    return agentNames.map((name) => {
      const latest = agentOutputs.find((output) => output.agent === name);
      const count = agentOutputs.filter((output) => output.agent === name).length;
      const score = latest?.score;
      const status = score === undefined ? 'idle' : score >= 6 ? 'active' : 'monitor';
      return {
        name,
        latestScore: score,
        latestSummary: latest?.summary || 'No recent output yet.',
        status,
        count,
        weight: Number(config?.agentWeights?.[name] ?? 1)
      };
    });
  }, [agentNames, agentOutputs, config?.agentWeights]);

  const safeFormatInr = (value: unknown) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? formatInr.format(numeric) : String(value ?? '');
  };

  return (
    <div className="min-h-screen bg-bg text-slate-100 p-4 md:p-8 space-y-6">
      <header className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">ORACLE Trading Intelligence</h1>
          <div className="flex gap-2 text-sm mt-2">
            <Link className="px-3 py-1 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700" href="/option-analytics">Option Analytics</Link>
            <Link className="px-3 py-1 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700" href="/paper-trades">Paper Trades</Link>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input className="px-3 py-2 rounded bg-slate-800 border border-slate-600" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="px-4 py-2 rounded bg-accent text-black font-semibold" onClick={async () => runAction(async () => {
            await apiPost('/ai/query', { query });
            await load();
          }, 'AI query sent.', 'Failed to submit AI query.')}>Ask AI</button>
          <Link href="/paper-trades" className="px-4 py-2 rounded bg-slate-700 text-sm">Paper Trades</Link>
        </div>
      </header>

      <nav className="card flex flex-wrap gap-2">
        {DASHBOARD_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 rounded text-sm border ${activeTab === tab.key ? 'bg-accent text-black border-accent font-semibold' : 'bg-slate-800 border-slate-600 text-slate-200'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`card ${notice.type === 'error' ? 'border border-rose-400 text-rose-300' : notice.type === 'success' ? 'border border-emerald-400 text-emerald-300' : 'border border-slate-500 text-slate-300'}`}>
          {notice.text}
        </div>
      )}

      {loading && <div className="text-xs text-slate-400">Refreshing dashboard...</div>}

      {config?.paperModeEnabled === false && (
        <div className="card border border-rose-400 text-rose-300">
          Paper mode disabled. Drawdown: {drawdownPercent.toFixed(2)}%
        </div>
      )}

      {activeTab === 'overview' && (
        <>
      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Live Setups</h2>
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="rounded bg-emerald-900/30 border border-emerald-700 p-2">TAKE {decisionCounts.take}</div>
            <div className="rounded bg-amber-900/30 border border-amber-700 p-2">WAIT {decisionCounts.wait}</div>
            <div className="rounded bg-rose-900/30 border border-rose-700 p-2">SKIP {decisionCounts.skip}</div>
          </div>
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
                  {'calibratedConfidence' in setup && (
                    <div>Calibrated confidence: {((setup.calibratedConfidence || 0) * 100).toFixed(1)}%</div>
                  )}
                  {'effectiveConfidence' in setup && (
                    <div>Effective confidence: {((setup.effectiveConfidence || 0) * 100).toFixed(1)}% · Decay: {setup.confidenceDecayFactor}</div>
                  )}
                  {'riskReward' in setup && (
                    <div>Risk/Reward: {Number(setup.riskReward || 0).toFixed(2)} · Cost: {Number(setup.estimatedCostBps || 0).toFixed(2)} bps</div>
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
              <button className="px-4 py-2 rounded bg-sky-500" onClick={async () => runAction(async () => {
                await apiPost('/admin/manual-analysis', { symbol: manualSymbol, price: DEFAULT_MANUAL_ANALYSIS_PRICE });
                await load();
              }, 'Manual analysis queued.', 'Failed to trigger manual analysis.')}>Trigger Analysis</button>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {activeTab === 'analytics' && (
        <>
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

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Regime Matrix</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {regimeMatrix.slice(0, 12).map((row) => (
              <div key={`${row.trendState}-${row.volBucket}-${row.eventDay}`} className="border border-slate-700 rounded p-2">
                <div>{row.trendState} · {row.volBucket} · {row.eventDay}</div>
                <div className="text-slate-300">
                  n={row.sampleSize} · hit {(row.hitRate * 100).toFixed(1)}% [{(row.confidenceInterval.low * 100).toFixed(1)}-{(row.confidenceInterval.high * 100).toFixed(1)}] · exp {row.expectancy.toFixed(2)}
                </div>
                {!row.minSampleMet && <div className="text-amber-300">Low sample size</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Agent Contribution ({manualSymbol})</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {agentContribution.slice(0, 12).map((row) => (
              <div key={row.agent} className="border border-slate-700 rounded p-2">
                <div>{row.agent}</div>
                <div className="text-slate-300">n={row.sampleSize}/{row.resolvedSampleSize} · hit {(row.hitRate * 100).toFixed(1)}% · contrib {row.contributionScore.toFixed(2)} · pnl {safeFormatInr(row.realizedPnl)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Signal Effectiveness ({manualSymbol})</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {signalEffectiveness.slice(0, 12).map((row) => (
              <div key={`${row.symbol}-${row.decision}-${row.trendState}-${row.volBucket}-${row.eventDay}-${row.sampleSize}`} className="border border-slate-700 rounded p-2">
                <div>{row.symbol} · {row.decision}</div>
                <div className="text-slate-300">{row.trendState}/{row.volBucket}/{row.eventDay} · n={row.sampleSize} · hit {(row.hitRate * 100).toFixed(1)}% · exp {row.expectancy.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
        </>
      )}

      {activeTab === 'admin' && (
        <>
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
              onClick={async () => runAction(async () => {
                const symbol = overrideSymbol.endsWith('.NS') ? overrideSymbol : `${overrideSymbol}.NS`;
                const targets = overrideTargets.split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
                if (!targets.length) {
                  setNotice({ type: 'error', text: 'Please provide at least one valid target.' });
                  return;
                }
                await apiPatch('/admin/config', {
                  stockOverrides: {
                    [symbol]: {
                      slMultiplier: Number(overrideSlMultiplier),
                      targetFactors: targets
                    }
                  }
                });
                await load();
              }, 'Stock override saved.', 'Failed to save stock override.')}
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
              <button className="px-4 py-2 rounded bg-amber-500 text-black font-semibold" onClick={async () => runAction(async () => {
                await apiPatch('/admin/config', { brainInstructions: instruction });
                await load();
              }, 'Brain instructions saved.', 'Failed to save brain instructions.')}>Save Instructions</button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Controls</h3>
              <button className="px-4 py-2 rounded bg-emerald-600 mr-2" onClick={async () => runAction(async () => {
                setConfig((prev) => (prev ? { ...prev, forceOverrideDisagreement: !prev.forceOverrideDisagreement } : prev));
                await apiPatch('/admin/config', { forceOverrideDisagreement: !config.forceOverrideDisagreement });
                await load();
              }, 'Disagreement override updated.', 'Failed to update disagreement override.')}>
                forceOverrideDisagreement: {String(config.forceOverrideDisagreement)}
              </button>
              <button className="px-4 py-2 rounded bg-cyan-600 mr-2" onClick={async () => runAction(async () => {
                const nextMode = config.autoReweightMode === 'winrate-percentile' ? 'drift' : 'winrate-percentile';
                setConfig((prev) => (prev ? { ...prev, autoReweightMode: nextMode } : prev));
                await apiPatch('/admin/config', { autoReweightMode: nextMode });
                await load();
              }, 'Auto reweight mode updated.', 'Failed to update auto reweight mode.')}>
                autoReweightMode: {config.autoReweightMode || 'drift'}
              </button>
              <button className="px-4 py-2 rounded bg-purple-500" onClick={async () => runAction(async () => {
                await apiPost('/admin/batch-actions', {
                  actions: [
                    { type: 'patchConfig', payload: { paperExecution: config.paperExecution || {} } }
                  ]
                });
                await Promise.all([apiPost('/admin/ingest/news', {}), apiPost('/admin/ingest/company', {})]);
                await load();
              }, 'Ingestion executed (batched update + refresh).', 'Failed to run ingestion.')}>Run Ingestion</button>
              <button className="px-4 py-2 rounded bg-slate-600 ml-2" onClick={async () => runAction(async () => {
                await apiPost('/prefilter/config', config.prefilterConfig || {});
                await load();
              }, 'Prefilter config pushed.', 'Failed to push prefilter config.')}>
                Push Prefilter Config
              </button>
              <div className="pt-2">
                <label className="block mb-1">Min win rate for TAKE</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  value={configDraft.minSymbolWinRateForTake}
                  onChange={(event) => setConfigDraft((prev) => ({ ...prev, minSymbolWinRateForTake: Number(event.target.value) }))}
                  onBlur={async () => runAction(async () => {
                    await queueConfigUpdate('minSymbolWinRateForTake', Number(configDraft.minSymbolWinRateForTake));
                  }, 'Min win-rate gate updated.', 'Failed to update min win-rate gate.')}
                />
                {fieldErrors.minSymbolWinRateForTake && <div className="text-xs text-rose-300">{fieldErrors.minSymbolWinRateForTake}</div>}
              </div>
              <div>
                <label className="block mb-1">Setup confidence decay (hours)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  value={configDraft.setupConfidenceDecayHours}
                  onChange={(event) => setConfigDraft((prev) => ({ ...prev, setupConfidenceDecayHours: Number(event.target.value) }))}
                  onBlur={async () => runAction(async () => {
                    await queueConfigUpdate('setupConfidenceDecayHours', Number(configDraft.setupConfidenceDecayHours));
                  }, 'Confidence decay updated.', 'Failed to update confidence decay.')}
                />
                {fieldErrors.setupConfidenceDecayHours && <div className="text-xs text-rose-300">{fieldErrors.setupConfidenceDecayHours}</div>}
              </div>
              <div>
                <label className="block mb-1">Auto shutdown drawdown %</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  value={configDraft.autoShutdownDrawdownPercent}
                  onChange={(event) => setConfigDraft((prev) => ({ ...prev, autoShutdownDrawdownPercent: Number(event.target.value) }))}
                  onBlur={async () => runAction(async () => {
                    await queueConfigUpdate('autoShutdownDrawdownPercent', Number(configDraft.autoShutdownDrawdownPercent));
                  }, 'Drawdown shutdown threshold updated.', 'Failed to update drawdown shutdown threshold.')}
                />
                {fieldErrors.autoShutdownDrawdownPercent && <div className="text-xs text-rose-300">{fieldErrors.autoShutdownDrawdownPercent}</div>}
              </div>
              <div>
                <label className="block mb-1">Paper slippage (bps)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.paperExecution?.slippageBps ?? 3}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { paperExecution: { slippageBps: Number(event.target.value) } });
                    await load();
                  }, 'Paper slippage updated.', 'Failed to update paper slippage.')}
                />
              </div>
              <div>
                <label className="block mb-1">Paper fee (bps)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.paperExecution?.feeBps ?? 2}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { paperExecution: { feeBps: Number(event.target.value) } });
                    await load();
                  }, 'Paper fee updated.', 'Failed to update paper fee.')}
                />
              </div>
              <div>
                <label className="block mb-1">Paper latency (ms)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.paperExecution?.latencyMs ?? 120}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { paperExecution: { latencyMs: Number(event.target.value) } });
                    await load();
                  }, 'Paper latency updated.', 'Failed to update paper latency.')}
                />
              </div>
              <div>
                <label className="block mb-1">Min Risk/Reward</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.setupMinRiskReward ?? 1.2}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { setupMinRiskReward: Number(event.target.value) });
                    await load();
                  }, 'Min risk/reward updated.', 'Failed to update min risk/reward.')}
                />
              </div>
              <div>
                <label className="block mb-1">Max Estimated Cost (bps)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.maxEstimatedCostBps ?? 15}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { maxEstimatedCostBps: Number(event.target.value) });
                    await load();
                  }, 'Max estimated cost updated.', 'Failed to update max estimated cost.')}
                />
              </div>
              <div>
                <label className="block mb-1">No-trade min consensus</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.noTradeMinConsensus ?? 0.5}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { noTradeMinConsensus: Number(event.target.value) });
                    await load();
                  }, 'No-trade consensus gate updated.', 'Failed to update no-trade consensus gate.')}
                />
              </div>
              <div>
                <label className="block mb-1">No-trade high-vol stdev</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  defaultValue={config.noTradeHighVolStdevThreshold ?? 2.9}
                  onBlur={async (event) => runAction(async () => {
                    await apiPatch('/admin/config', { noTradeHighVolStdevThreshold: Number(event.target.value) });
                    await load();
                  }, 'No-trade volatility gate updated.', 'Failed to update no-trade volatility gate.')}
                />
              </div>
            </div>
              <div className="md:col-span-2 grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-medium">Broker Session &amp; Execution</h3>
                  <button className="px-4 py-2 rounded bg-rose-500 text-black font-semibold" onClick={async () => runAction(async () => {
                    const nextValue = !config[REAL_TRADING_KEY];
                    await apiPatch('/admin/config', { [REAL_TRADING_KEY]: nextValue });
                    await load();
                  }, 'Execution toggle updated.', 'Failed to update execution toggle.')}>
                    {REAL_TRADING_KEY}: {String(config[REAL_TRADING_KEY] ?? false)}
                  </button>
                  <div className="grid gap-2">
                    <label className="text-xs">Provider</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.provider} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, provider: event.target.value }))} />
                    <label className="text-xs">Environment</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.environment} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, environment: event.target.value }))} />
                    <label className="text-xs">Kite API key env variable</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.apiKeyEnv} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, apiKeyEnv: event.target.value }))} />
                    <label className="text-xs">Kite API secret env variable</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.apiSecretEnv} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, apiSecretEnv: event.target.value }))} />
                    <label className="text-xs">Kite redirect URL env variable</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.redirectUrlEnv} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, redirectUrlEnv: event.target.value }))} />
                    <label className="text-xs">Kite access token env variable</label>
                    <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600" value={brokerDraft.accessTokenEnv} onChange={(event) => setBrokerDraft((prev) => ({ ...prev, accessTokenEnv: event.target.value }))} />
                    <button className="px-4 py-2 rounded bg-indigo-500" onClick={async () => runAction(async () => {
                      await apiPatch('/admin/config', { brokerConfig: brokerDraft });
                      await load();
                    }, 'Broker config saved.', 'Failed to save broker config.')}>Save Zerodha Kite Setup</button>
                  </div>
                </div>
              <div className="space-y-2">
                <h3 className="font-medium">Option Analytics Config</h3>
                <label className="block mb-1">Strikes around ATM (±)</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  value={analyticsDraft.strikesAroundAtm}
                  onChange={(event) => setAnalyticsDraft((prev) => ({ ...prev, strikesAroundAtm: Number(event.target.value) }))}
                />
                <label className="block mb-1">Expiries</label>
                <input
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600"
                  value={analyticsDraft.expiries}
                  onChange={(event) => setAnalyticsDraft((prev) => ({ ...prev, expiries: event.target.value }))}
                />
                <label className="block mb-1">Priority order (comma separated)</label>
                <textarea
                  className="w-full h-20 p-2 rounded bg-slate-800 border border-slate-600"
                  value={analyticsDraft.priorityOrder}
                  onChange={(event) => setAnalyticsDraft((prev) => ({ ...prev, priorityOrder: event.target.value }))}
                />
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={analyticsDraft.includeAllScopes}
                      onChange={(event) => setAnalyticsDraft((prev) => ({ ...prev, includeAllScopes: event.target.checked }))}
                    />
                    all scopes
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={analyticsDraft.includeAllAnalytics}
                      onChange={(event) => setAnalyticsDraft((prev) => ({ ...prev, includeAllAnalytics: event.target.checked }))}
                    />
                    all analytics
                  </label>
                </div>
                <button className="px-4 py-2 rounded bg-sky-600" onClick={async () => runAction(async () => {
                  await apiPatch('/admin/config', {
                    optionAnalytics: {
                      strikesAroundAtm: Number(analyticsDraft.strikesAroundAtm),
                      expiries: analyticsDraft.expiries || 'all',
                      includeAllScopes: analyticsDraft.includeAllScopes,
                      includeAllAnalytics: analyticsDraft.includeAllAnalytics,
                      priorityOrder: parsePriorityList(analyticsDraft.priorityOrder)
                    }
                  });
                  await load();
                }, 'Option analytics config updated.', 'Failed to update option analytics config.')}>Save Option Analytics</button>
              </div>
            </div>
            <div className="md:col-span-2 space-y-3">
              <h3 className="font-medium">Watchlist Buckets</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">1s preset ({watchlistLimits.oneSecond} symbols)</label>
                  <textarea className="w-full h-16 p-2 rounded bg-slate-800 border border-slate-600" value={watchlistDraft.oneSecond} onChange={(event) => setWatchlistDraft((prev) => ({ ...prev, oneSecond: event.target.value }))} />
                </div>
                <div>
                  <label className="block mb-1">1s trade list ({watchlistLimits.tradeOneSecond} symbols)</label>
                  <textarea className="w-full h-16 p-2 rounded bg-slate-800 border border-slate-600" value={watchlistDraft.tradeOneSecond} onChange={(event) => setWatchlistDraft((prev) => ({ ...prev, tradeOneSecond: event.target.value }))} />
                </div>
                <div>
                  <label className="block mb-1">5s bucket ({watchlistLimits.fiveSecond} symbols)</label>
                  <textarea className="w-full h-16 p-2 rounded bg-slate-800 border border-slate-600" value={watchlistDraft.fiveSecond} onChange={(event) => setWatchlistDraft((prev) => ({ ...prev, fiveSecond: event.target.value }))} />
                </div>
                <div>
                  <label className="block mb-1">60s bucket ({watchlistLimits.sixtySecond}+ symbols)</label>
                  <textarea className="w-full h-16 p-2 rounded bg-slate-800 border border-slate-600" value={watchlistDraft.sixtySecond} onChange={(event) => setWatchlistDraft((prev) => ({ ...prev, sixtySecond: event.target.value }))} />
                </div>
              </div>
              <button className="px-4 py-2 rounded bg-emerald-600" onClick={async () => runAction(async () => {
                await apiPatch('/admin/config', {
                  watchlistBuckets: {
                    oneSecond: { symbols: parseSymbolList(watchlistDraft.oneSecond), maxSymbols: watchlistLimits.oneSecond },
                    tradeOneSecond: { symbols: parseSymbolList(watchlistDraft.tradeOneSecond), maxSymbols: watchlistLimits.tradeOneSecond },
                    fiveSecond: { symbols: parseSymbolList(watchlistDraft.fiveSecond), maxSymbols: watchlistLimits.fiveSecond },
                    sixtySecond: { symbols: parseSymbolList(watchlistDraft.sixtySecond), maxSymbols: watchlistLimits.sixtySecond }
                  }
                });
                await load();
              }, 'Watchlist buckets updated.', 'Failed to update watchlist buckets.')}>Save Watchlists</button>
            </div>
          </div>
        )}
      </section>
        </>
      )}

      {activeTab === 'agents' && (
        <>
      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Specialist AI Agents</h2>
          <div className="grid sm:grid-cols-2 gap-2 max-h-[28rem] overflow-auto">
            {agentRoster.map((agent) => (
              <div key={agent.name} className="border border-slate-700 rounded p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium text-sm">{agent.name}</div>
                  <span className={`text-[10px] px-2 py-1 rounded ${agent.status === 'active' ? 'bg-emerald-700 text-emerald-100' : agent.status === 'monitor' ? 'bg-amber-700 text-amber-100' : 'bg-slate-700 text-slate-200'}`}>
                    {agent.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-1">Weight: {agent.weight.toFixed(2)} · outputs: {agent.count}</div>
                <div className="text-xs text-slate-400 mt-2">{agent.latestSummary}</div>
                {agent.latestScore !== undefined && agent.latestScore !== null && (
                  <div className="text-xs mt-2">Latest score: {agent.latestScore.toFixed(2)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Recent Agent Outputs</h2>
          <div className="space-y-2 max-h-[28rem] overflow-auto text-sm">
            {topAgents.map((output) => (
              <div key={output.id} className="border border-slate-700 rounded p-2">
                <div className="font-medium">{output.agent} · {output.symbol}</div>
                <div className="text-xs text-slate-300">Score: {output.score} · {output.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card">
        <h2 className="font-semibold mb-3">Agent Contribution ({manualSymbol})</h2>
        <div className="grid md:grid-cols-3 gap-2 text-xs">
          {agentContribution.slice(0, 18).map((row) => (
            <div key={row.agent} className="border border-slate-700 rounded p-2">
              <div>{row.agent}</div>
              <div className="text-slate-300">n={row.sampleSize}/{row.resolvedSampleSize}</div>
              <div className="text-slate-300">hit {(row.hitRate * 100).toFixed(1)}%</div>
              <div className="text-slate-300">contrib {row.contributionScore.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </section>
        </>
      )}

      {activeTab === 'backtest' && (
      <section className="card">
        <h2 className="font-semibold mb-3">Backtest Integrity</h2>
        <div className="flex gap-2 mb-3">
          <button className="px-4 py-2 rounded bg-sky-600" onClick={async () => runAction(async () => {
            const result = await apiPost<BacktestResult>('/admin/backtest', { symbol: manualSymbol, lookback: 200 });
            setLatestBacktest(result);
          }, 'Backtest started.', 'Failed to run backtest.')}>Run Backtest</button>
          <button className="px-4 py-2 rounded bg-indigo-600" onClick={async () => runAction(async () => {
            const result = await apiPost<BacktestResult & { windowCount?: number; averageDrift?: number; averageTestHitRate?: number }>('/admin/walk-forward', {
              symbol: manualSymbol,
              lookback: 300,
              trainWindow: 80,
              testWindow: 30
            });
            setLatestBacktest({
              symbol: result.symbol,
              sampleSize: result.sampleSize || 0,
              takeCount: result.takeCount || 0,
              hitRate: result.hitRate ?? result.averageTestHitRate ?? 0
            });
            setNotice({ type: 'info', text: `Walk-forward done. Windows: ${result.windowCount || 0}, avg drift: ${(Number(result.averageDrift || 0) * 100).toFixed(2)}%` });
          }, 'Walk-forward completed.', 'Failed to run walk-forward.')}>Run Walk-Forward</button>
        </div>
        {latestBacktest && (
          <div className="text-sm space-y-1">
            <div>{latestBacktest.symbol} · sample {latestBacktest.sampleSize} · TAKE {latestBacktest.takeCount} · resolved {latestBacktest.resolvedTakeCount ?? 0}</div>
            <div>Hit rate {(latestBacktest.hitRate * 100).toFixed(1)}% {latestBacktest.hitRateCiLow !== undefined && latestBacktest.hitRateCiHigh !== undefined ? `[${(latestBacktest.hitRateCiLow * 100).toFixed(1)}-${(latestBacktest.hitRateCiHigh * 100).toFixed(1)}]` : ''}</div>
            {latestBacktest.minSampleMet === false && <div className="text-amber-300">Sample guard: insufficient sample size</div>}
            {(latestBacktest.warnings || []).map((warning) => <div key={warning} className="text-amber-300">{warning}</div>)}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
