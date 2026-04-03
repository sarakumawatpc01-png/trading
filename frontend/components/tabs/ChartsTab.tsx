'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';

type Candle = { period: string; open: number; high: number; low: number; close: number; volume: number; symbol: string };
type Level = { type: string; label: string; value: number; color: string };
type ChartSignal = { id: string; symbol: string; action: string; score?: number; reason: string; createdAt: string };
type OrderDepthRow = { price: number; quantity: number; orders: number };
type OrderBook = {
  symbol: string;
  bid: OrderDepthRow[];
  ask: OrderDepthRow[];
  spread: number;
  bestBid: number;
  bestAsk: number;
  lastPrice: number;
  wall?: { side: 'buy' | 'sell'; price: number; quantity: number } | null;
  spoofAlert?: { detected: boolean; price: number; side: string; message: string } | null;
};
type DeltaRow = { ts: number; delta: number; cumulativeDelta: number; price: number; divergence: boolean };

export default function ChartsTab() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [signals, setSignals] = useState<ChartSignal[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [deltaSeries, setDeltaSeries] = useState<DeltaRow[]>([]);
  const [gridMode, setGridMode] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGet<Candle[]>(`/charts/ohlcv?symbol=${encodeURIComponent(symbol)}&count=60`).catch(() => []),
      apiGet<Level[]>(`/charts/levels?symbol=${encodeURIComponent(symbol)}`).catch(() => []),
      apiGet<ChartSignal[]>(`/charts/signals?symbol=${encodeURIComponent(symbol)}&limit=50`).catch(() => []),
      apiGet<OrderBook>(`/charts/orderbook?symbol=${encodeURIComponent(symbol)}`).catch(() => null),
      apiGet<DeltaRow[]>(`/charts/delta?symbol=${encodeURIComponent(symbol)}&limit=50`).catch(() => [])
    ]).then(([c, l, s, ob, delta]) => {
      setCandles(c);
      setLevels(l);
      setSignals(s);
      setOrderBook(ob);
      setDeltaSeries(delta);
    });
  }, [symbol]);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, '');
    if (!wsBase) return;
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.type === `orderbook:${symbol}.NS`) {
          setOrderBook(parsed.payload);
        }
        if (parsed?.type === `delta:${symbol}.NS`) {
          setDeltaSeries(parsed.payload || []);
        }
      } catch (_error) {}
    };
    return () => ws.close();
  }, [symbol]);

  const maxBid = useMemo(() => Math.max(1, ...(orderBook?.bid || []).map((row) => Number(row.quantity || 0))), [orderBook]);
  const maxAsk = useMemo(() => Math.max(1, ...(orderBook?.ask || []).map((row) => Number(row.quantity || 0))), [orderBook]);
  const bidTotal = useMemo(() => (orderBook?.bid || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0), [orderBook]);
  const askTotal = useMemo(() => (orderBook?.ask || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0), [orderBook]);
  const imbalance = useMemo(() => askTotal ? bidTotal / askTotal : 0, [bidTotal, askTotal]);
  const rolling20Delta = useMemo(() => deltaSeries.slice(0, 20).reduce((sum, row) => sum + Number(row.delta || 0), 0), [deltaSeries]);
  const hasDivergence = useMemo(() => deltaSeries.some((row) => row.divergence), [deltaSeries]);

  return (
    <div className="space-y-4">
      <div className="oracle-card flex flex-wrap gap-2 items-center">
        <span className="text-sm text-oracle-text-secondary">Instrument</span>
        <input aria-label="Trading symbol or instrument" placeholder="e.g. NIFTY or RELIANCE" className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} />
        <span className="text-xs text-oracle-text-secondary">Prompt-aligned charts scaffold (OHLCV + levels + signals)</span>
        <button className="ml-auto px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={() => setGridMode((prev) => !prev)}>{gridMode ? 'Single View' : 'Grid View 2x2'}</button>
      </div>
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="oracle-card lg:col-span-2">
          <h3 className="font-medium mb-2">Candles ({candles.length})</h3>
          <div className={`grid ${gridMode ? 'md:grid-cols-2 gap-2' : 'grid-cols-1'} max-h-96 overflow-auto text-xs`}>
            {candles.map((row) => (
              <div key={row.period} className="border border-oracle-border rounded p-2 mb-1">
                {row.period} · O {row.open} H {row.high} L {row.low} C {row.close} · Vol {row.volume}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="oracle-card">
            <h3 className="font-medium mb-2">Order Book (Top 5)</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-oracle-green mb-1">Bids</div>
                {(orderBook?.bid || []).slice(0, 5).map((row) => (
                  <div key={`b-${row.price}`} className="mb-1">
                    <div className="h-2 bg-oracle-green/20 rounded" style={{ width: `${Math.max(5, (Number(row.quantity || 0) / maxBid) * 100)}%` }} />
                    <div>{row.price} · {row.quantity}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-oracle-red mb-1">Asks</div>
                {(orderBook?.ask || []).slice(0, 5).map((row) => (
                  <div key={`a-${row.price}`} className="mb-1">
                    <div className="h-2 bg-oracle-red/20 rounded" style={{ width: `${Math.max(5, (Number(row.quantity || 0) / maxAsk) * 100)}%` }} />
                    <div>{row.price} · {row.quantity}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs">
              Spread: {Number(orderBook?.spread || 0).toFixed(2)} · Bid/Ask Total: {bidTotal}/{askTotal}
            </div>
            <div className={`text-xs mt-1 ${imbalance >= 1 ? 'text-oracle-green' : 'text-oracle-red'}`}>
              {imbalance >= 1 ? `Buy pressure ${imbalance.toFixed(2)}x` : `Sell pressure ${(askTotal / Math.max(1, bidTotal)).toFixed(2)}x`}
            </div>
            {orderBook?.wall && (
              <div className="text-xs mt-1 border border-oracle-gold rounded px-2 py-1">
                WALL {orderBook.wall.side.toUpperCase()} @ {orderBook.wall.price} · {orderBook.wall.quantity}
              </div>
            )}
            {orderBook?.spoofAlert?.detected && (
              <div className="text-xs mt-1 text-oracle-red">{orderBook.spoofAlert.message}</div>
            )}
          </div>
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
          <div className="oracle-card">
            <h3 className="font-medium mb-2">Volume Delta (50 ticks)</h3>
            <div className="flex items-end gap-[2px] h-20">
              {deltaSeries.slice(0, 50).reverse().map((row, idx) => {
                const height = Math.min(100, Math.max(4, Math.abs(row.delta)));
                const color = row.delta >= 0 ? 'bg-oracle-green' : 'bg-oracle-red';
                return <div key={`${row.ts}-${idx}`} title={`${row.delta}`} className={`${color} w-1`} style={{ height: `${height}%` }} />;
              })}
            </div>
            <div className="text-xs mt-2">Running 20-tick delta: {rolling20Delta.toFixed(2)}</div>
            {hasDivergence && <div className="text-xs text-oracle-orange mt-1">DIVERGENCE DETECTED</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
