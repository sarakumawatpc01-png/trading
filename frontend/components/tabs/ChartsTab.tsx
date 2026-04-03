'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

type Candle = { period: string; open: number; high: number; low: number; close: number; volume: number; symbol: string };
type Level = { type: string; label: string; value: number; color: string };
type ChartSignal = { id: string; symbol: string; action: string; score?: number; reason: string; createdAt: string };

export default function ChartsTab() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [signals, setSignals] = useState<ChartSignal[]>([]);

  useEffect(() => {
    Promise.all([
      apiGet<Candle[]>(`/charts/ohlcv?symbol=${encodeURIComponent(symbol)}&count=60`).catch(() => []),
      apiGet<Level[]>(`/charts/levels?symbol=${encodeURIComponent(symbol)}`).catch(() => []),
      apiGet<ChartSignal[]>(`/charts/signals?symbol=${encodeURIComponent(symbol)}&limit=50`).catch(() => [])
    ]).then(([c, l, s]) => {
      setCandles(c);
      setLevels(l);
      setSignals(s);
    });
  }, [symbol]);

  return (
    <div className="space-y-4">
      <div className="oracle-card flex flex-wrap gap-2 items-center">
        <span className="text-sm text-oracle-text-secondary">Instrument</span>
        <input className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
        <span className="text-xs text-oracle-text-secondary">Prompt-aligned charts scaffold (OHLCV + levels + signals)</span>
      </div>
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="oracle-card lg:col-span-2">
          <h3 className="font-medium mb-2">Candles ({candles.length})</h3>
          <div className="max-h-96 overflow-auto text-xs space-y-1">
            {candles.map((row) => (
              <div key={row.period} className="border border-oracle-border rounded p-2">
                {row.period} · O {row.open} H {row.high} L {row.low} C {row.close} · Vol {row.volume}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="oracle-card">
            <h3 className="font-medium mb-2">Key Levels</h3>
            <div className="space-y-1 text-sm">
              {levels.map((row) => <div key={`${row.type}-${row.value}`}>{row.label}: {row.value}</div>)}
            </div>
          </div>
          <div className="oracle-card">
            <h3 className="font-medium mb-2">Signal Markers</h3>
            <div className="space-y-1 text-sm max-h-48 overflow-auto">
              {signals.map((row) => <div key={row.id}>{row.symbol} · {row.action}</div>)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
