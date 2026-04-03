'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '../../lib/api';

type PaperTrade = {
  id: string;
  setupId: string;
  symbol: string;
  status: 'OPEN' | 'CLOSED';
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  grade?: 'AGREE' | 'DISAGREE' | 'NEUTRAL';
};

type GapAnalysis = {
  totals: { takeSignals: number; takenSignals: number; skippedSignals: number };
  taken: { closedTrades: number; realizedPnl: number };
  skipped: { potentialPoints: number };
};

export default function PaperTradingTab() {
  const [active, setActive] = useState<PaperTrade[]>([]);
  const [history, setHistory] = useState<PaperTrade[]>([]);
  const [gap, setGap] = useState<GapAnalysis | null>(null);

  const load = async () => {
    const [a, h, g] = await Promise.all([
      apiGet<PaperTrade[]>('/papertrading/active').catch(() => []),
      apiGet<PaperTrade[]>('/papertrading/history?limit=500').catch(() => []),
      apiGet<GapAnalysis>('/papertrading/gap-analysis').catch(() => null)
    ]);
    setActive(a);
    setHistory(h);
    setGap(g);
  };

  useEffect(() => { load(); }, []);

  const agreementRate = useMemo(() => {
    const graded = history.filter((row) => row.grade);
    if (!graded.length) return 0;
    const agree = graded.filter((row) => row.grade === 'AGREE').length;
    return (agree / graded.length) * 100;
  }, [history]);

  return (
    <div className="space-y-4">
      <section className="grid md:grid-cols-3 gap-4">
        <div className="oracle-card text-sm">Active trades: {active.length}</div>
        <div className="oracle-card text-sm">History trades: {history.length}</div>
        <div className="oracle-card text-sm">Agreement rate: {agreementRate.toFixed(1)}%</div>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Paper Portfolio (Active)</h3>
        <div className="space-y-2 text-sm">
          {active.map((trade) => (
            <div key={trade.id} className="border border-oracle-border rounded p-2 flex flex-wrap gap-2 items-center">
              <span>{trade.symbol}</span>
              <span>{trade.status}</span>
              <span>Entry {trade.entryPrice}</span>
              <button className="px-2 py-1 rounded bg-oracle-green text-black text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'AGREE' });
                await load();
              }}>AGREE</button>
              <button className="px-2 py-1 rounded bg-oracle-red text-white text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'DISAGREE' });
                await load();
              }}>DISAGREE</button>
              <button className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'NEUTRAL' });
                await load();
              }}>NEUTRAL</button>
            </div>
          ))}
          {!active.length && <div className="text-oracle-text-secondary">No active paper trades.</div>}
        </div>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Gap Analysis</h3>
        {gap ? (
          <div className="text-sm space-y-1">
            <div>TAKE signals: {gap.totals.takeSignals}</div>
            <div>Taken: {gap.totals.takenSignals} · Skipped: {gap.totals.skippedSignals}</div>
            <div>Realized PnL: {gap.taken.realizedPnl.toFixed(2)}</div>
            <div>Potential skipped points: {gap.skipped.potentialPoints.toFixed(2)}</div>
          </div>
        ) : (
          <div className="text-sm text-oracle-text-secondary">No gap analysis available.</div>
        )}
      </section>
    </div>
  );
}
