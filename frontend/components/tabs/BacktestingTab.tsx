'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

type BacktestSummary = {
  symbol: string;
  sampleSize: number;
  takeCount: number;
  hitRate: number;
  expectancy?: number;
  warnings?: string[];
};

type BacktestDetails = {
  summary: BacktestSummary;
  metrics: {
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    maxDrawdown: number;
    walkForwardEfficiency: number;
    monteCarloProfitablePct: number;
  };
  equityCurve: Array<{ ts: string; equity: number }>;
  monthlyReturns: Array<{ month: string; returnPct: number }>;
  signalDistribution: Array<{ bucket: string; count: number; winRate: number }>;
  signalRows: Array<{
    id: string;
    date: string;
    instrument: string;
    direction: string;
    score: number;
    pattern: string;
    tp1Hit: boolean;
    tp2Hit: boolean;
    slHit: boolean;
    pnlPoints: number;
    result: string;
    setup: unknown;
  }>;
  monteCarloRuns: Array<{ run: number; totalPnl: number }>;
  agentAccuracy: Array<{ agent: string; sampleSize: number; hitRate: number; contributionScore: number }>;
  biasValidation: {
    lookAheadBias: { passed: boolean; checkedAt: string };
    survivorshipBias: { passed: boolean; universeCount: number };
    monteCarlo: { runs: number };
  };
};

export default function BacktestingTab() {
  const [instrument, setInstrument] = useState('RELIANCE');
  const [dateFrom, setDateFrom] = useState('2024-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [walkForward, setWalkForward] = useState(true);
  const [scoreThreshold, setScoreThreshold] = useState(11);
  const [takeOnly, setTakeOnly] = useState(false);
  const [result, setResult] = useState<BacktestSummary | null>(null);
  const [details, setDetails] = useState<BacktestDetails | null>(null);
  const [queue, setQueue] = useState<Array<{ instrument: string; status: string; nextRun: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ progress: number; message: string } | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const loadResults = async () => {
    setLoading(true);
    const rows = await apiGet<BacktestSummary>(`/backtesting/results?instrument=${encodeURIComponent(instrument)}`).catch(() => null);
    setResult(rows);
    const rich = await apiGet<BacktestDetails>(`/backtesting/details?instrument=${encodeURIComponent(instrument)}&lookback=500`).catch(() => null);
    setDetails(rich);
    setLoading(false);
  };

  const runBacktest = async () => {
    setLoading(true);
    setProgress({ progress: 5, message: 'Queued' });
    const rows = await apiPost<BacktestSummary>('/backtesting/run', {
      instrument,
      lookback: 500,
      dateFrom,
      dateTo,
      walkForward,
      scoreThreshold,
      takeOnly
    }).catch(() => null);
    setResult(rows);
    const rich = await apiGet<BacktestDetails>(`/backtesting/details?instrument=${encodeURIComponent(instrument)}&lookback=500`).catch(() => null);
    setDetails(rich);
    setLoading(false);
  };

  const loadQueue = async () => {
    const rows = await apiGet<Array<{ instrument: string; status: string; nextRun: string }>>('/backtesting/queue').catch(() => []);
    setQueue(rows);
  };

  useEffect(() => {
    loadQueue();
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, '');
    if (!wsBase) return;
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.type !== 'backtesting:progress') return;
        if (String(parsed.payload?.symbol || '').toUpperCase() !== `${instrument}.NS`) return;
        setProgress({
          progress: Number(parsed.payload?.progress || 0),
          message: String(parsed.payload?.message || '')
        });
      } catch (_error) {}
    };
    return () => ws.close();
  }, [instrument]);

  const equityMax = useMemo(() => Math.max(1, ...((details?.equityCurve || []).map((row) => Math.abs(Number(row.equity || 0))))), [details?.equityCurve]);
  const selectedSignal = useMemo(() => (details?.signalRows || []).find((row) => row.id === selectedSignalId) || null, [details?.signalRows, selectedSignalId]);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-2 items-end">
        <input aria-label="Backtest instrument symbol" className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" value={instrument} onChange={(event) => setInstrument(event.target.value.toUpperCase())} />
        <label className="text-xs text-oracle-text-secondary">From
          <input aria-label="Backtest date from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="block mt-1 px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" />
        </label>
        <label className="text-xs text-oracle-text-secondary">To
          <input aria-label="Backtest date to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="block mt-1 px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" />
        </label>
        <label className="text-xs text-oracle-text-secondary">Score threshold {scoreThreshold}
          <input aria-label="Backtest score threshold" type="range" min={7} max={21} step={1} value={scoreThreshold} onChange={(event) => setScoreThreshold(Number(event.target.value))} className="block mt-1" />
        </label>
        <label className="text-xs flex items-center gap-2"><input aria-label="Walk-forward toggle" type="checkbox" checked={walkForward} onChange={(event) => setWalkForward(event.target.checked)} />Walk-forward</label>
        <label className="text-xs flex items-center gap-2"><input aria-label="Take only toggle" type="checkbox" checked={takeOnly} onChange={(event) => setTakeOnly(event.target.checked)} />TAKE only</label>
        <button aria-label="Load backtest results for selected instrument" className="px-3 py-2 rounded bg-oracle-gold text-black text-sm" onClick={loadResults}>Load Results</button>
        <button aria-label="Run new backtest for selected instrument" className="px-3 py-2 rounded bg-oracle-blue text-black text-sm" onClick={runBacktest}>Run Backtest</button>
        <button aria-label="Add instrument to backtest queue" className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" onClick={async () => {
          await apiPost('/backtesting/queue/add', { instrument });
          await loadQueue();
        }}>Add to Queue</button>
        <button aria-label="Refresh backtest queue" className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" onClick={loadQueue}>Refresh Queue</button>
      </section>

      {loading && <div className="text-sm text-oracle-text-secondary">Loading backtest...</div>}
      {progress && (
        <section className="oracle-card">
          <div className="text-xs mb-1">Processing candle stream — {progress.message}</div>
          <div className="h-3 rounded bg-oracle-tertiary overflow-hidden">
            <div className="h-full bg-oracle-blue" style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }} />
          </div>
          <div className="text-xs mt-1">{progress.progress.toFixed(1)}%</div>
        </section>
      )}

      {result && (
        <section className="oracle-card text-sm space-y-1">
          <div className="font-medium">{result.symbol}</div>
          <div>Sample size {result.sampleSize} · TAKE {result.takeCount}</div>
          <div>Win Rate {(Number(result.hitRate || 0) * 100).toFixed(1)}%</div>
          <div>Expectancy {Number(result.expectancy || 0).toFixed(3)}</div>
          {(result.warnings || []).map((warning) => <div key={warning} className="text-oracle-orange">{warning}</div>)}
        </section>
      )}

      {details && (
        <>
          <section className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard title="Win Rate" value={`${details.metrics.winRate.toFixed(1)}%`} good={details.metrics.winRate >= 65} />
            <MetricCard title="Profit Factor" value={details.metrics.profitFactor.toFixed(2)} good={details.metrics.profitFactor >= 1.5} />
            <MetricCard title="Sharpe Ratio" value={details.metrics.sharpeRatio.toFixed(2)} good={details.metrics.sharpeRatio >= 1.5} />
            <MetricCard title="Max Drawdown" value={details.metrics.maxDrawdown.toFixed(2)} good={details.metrics.maxDrawdown < 20} />
            <MetricCard title="Walk-Forward Eff." value={`${details.metrics.walkForwardEfficiency.toFixed(1)}%`} good={details.metrics.walkForwardEfficiency >= 80} />
            <MetricCard title="Monte Carlo" value={`${details.metrics.monteCarloProfitablePct.toFixed(1)}%`} good={details.metrics.monteCarloProfitablePct >= 60} />
          </section>

          <section className="grid lg:grid-cols-3 gap-4">
            <div className="oracle-card lg:col-span-2">
              <h3 className="font-medium mb-2">Equity Curve</h3>
              <div className="h-40 flex items-end gap-[2px]">
                {details.equityCurve.slice(-120).map((row, idx) => {
                  const height = Math.max(3, (Math.abs(Number(row.equity || 0)) / equityMax) * 100);
                  const color = Number(row.equity || 0) >= 0 ? 'bg-oracle-green' : 'bg-oracle-red';
                  return <div key={`${row.ts}-${idx}`} className={`w-1 ${color}`} style={{ height: `${height}%` }} title={`${row.ts}: ${row.equity}`} />;
                })}
              </div>
            </div>
            <div className="oracle-card">
              <h3 className="font-medium mb-2">Signal Distribution</h3>
              <div className="space-y-2 text-xs">
                {details.signalDistribution.map((row) => (
                  <div key={row.bucket}>
                    <div>{row.bucket} · {row.count} · {(row.winRate * 100).toFixed(1)}%</div>
                    <div className="h-2 bg-oracle-tertiary rounded overflow-hidden"><div className="h-full bg-oracle-gold" style={{ width: `${Math.min(100, row.count)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="oracle-card">
            <h3 className="font-medium mb-2">Signal Detail Table</h3>
            <div className="max-h-72 overflow-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-oracle-text-secondary">
                    <th>Date</th><th>Instrument</th><th>Direction</th><th>Score</th><th>Pattern</th><th>TP1</th><th>TP2</th><th>SL</th><th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {details.signalRows.slice(0, 150).map((row) => (
                    <tr key={row.id} className="border-t border-oracle-border cursor-pointer hover:bg-oracle-tertiary/40" onClick={() => setSelectedSignalId(row.id)}>
                      <td>{row.date}</td>
                      <td>{row.instrument}</td>
                      <td>{row.direction}</td>
                      <td>{Number(row.score).toFixed(2)}</td>
                      <td>{row.pattern}</td>
                      <td>{row.tp1Hit ? '✓' : '-'}</td>
                      <td>{row.tp2Hit ? '✓' : '-'}</td>
                      <td>{row.slHit ? '✓' : '-'}</td>
                      <td className={row.pnlPoints >= 0 ? 'text-oracle-green' : 'text-oracle-red'}>{row.pnlPoints.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedSignal && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm">Selected signal JSON</summary>
                <pre className="text-xs mt-2 whitespace-pre-wrap">{JSON.stringify(selectedSignal.setup, null, 2)}</pre>
              </details>
            )}
          </section>
        </>
      )}

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Priority Backtest Queue</h3>
        <div className="space-y-2 text-sm">
          {queue.map((row) => <div key={row.instrument}>{row.instrument} · {row.status} · {row.nextRun}</div>)}
          {!queue.length && <div className="text-oracle-text-secondary">Queue is empty.</div>}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value, good }: { title: string; value: string; good: boolean }) {
  return (
    <div className="oracle-card text-sm">
      <div className="text-oracle-text-secondary text-xs">{title}</div>
      <div className={`text-lg font-semibold ${good ? 'text-oracle-green' : 'text-oracle-red'}`}>{value}</div>
    </div>
  );
}
