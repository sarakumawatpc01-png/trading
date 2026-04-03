'use client';

import { useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

type BacktestSummary = {
  symbol: string;
  sampleSize: number;
  takeCount: number;
  hitRate: number;
  expectancy?: number;
  warnings?: string[];
};

export default function BacktestingTab() {
  const [instrument, setInstrument] = useState('RELIANCE');
  const [result, setResult] = useState<BacktestSummary | null>(null);
  const [queue, setQueue] = useState<Array<{ instrument: string; status: string; nextRun: string }>>([]);
  const [loading, setLoading] = useState(false);

  const loadResults = async () => {
    setLoading(true);
    const rows = await apiGet<BacktestSummary>(`/backtesting/results?instrument=${encodeURIComponent(instrument)}`).catch(() => null);
    setResult(rows);
    setLoading(false);
  };

  const runBacktest = async () => {
    setLoading(true);
    const rows = await apiPost<BacktestSummary>('/backtesting/run', { instrument, lookback: 300 }).catch(() => null);
    setResult(rows);
    setLoading(false);
  };

  const loadQueue = async () => {
    const rows = await apiGet<Array<{ instrument: string; status: string; nextRun: string }>>('/backtesting/queue').catch(() => []);
    setQueue(rows);
  };

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-2 items-center">
        <input className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" value={instrument} onChange={(event) => setInstrument(event.target.value.toUpperCase())} />
        <button className="px-3 py-2 rounded bg-oracle-gold text-black text-sm" onClick={loadResults}>Load Results</button>
        <button className="px-3 py-2 rounded bg-oracle-blue text-black text-sm" onClick={runBacktest}>Run Backtest</button>
        <button className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" onClick={async () => {
          await apiPost('/backtesting/queue/add', { instrument });
          await loadQueue();
        }}>Add to Queue</button>
        <button className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" onClick={loadQueue}>Refresh Queue</button>
      </section>

      {loading && <div className="text-sm text-oracle-text-secondary">Loading backtest...</div>}

      {result && (
        <section className="oracle-card text-sm space-y-1">
          <div className="font-medium">{result.symbol}</div>
          <div>Sample size {result.sampleSize} · TAKE {result.takeCount}</div>
          <div>Win Rate {(Number(result.hitRate || 0) * 100).toFixed(1)}%</div>
          <div>Expectancy {Number(result.expectancy || 0).toFixed(3)}</div>
          {(result.warnings || []).map((warning) => <div key={warning} className="text-oracle-orange">{warning}</div>)}
        </section>
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
