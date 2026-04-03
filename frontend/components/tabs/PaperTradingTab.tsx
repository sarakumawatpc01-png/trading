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

type JournalResponse = {
  rows: PaperTrade[];
  stats: {
    totalTrades: number;
    closedTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
  };
};

export default function PaperTradingTab() {
  const [active, setActive] = useState<PaperTrade[]>([]);
  const [history, setHistory] = useState<PaperTrade[]>([]);
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const [journal, setJournal] = useState<JournalResponse | null>(null);
  const [disagreeReasonByTrade, setDisagreeReasonByTrade] = useState<Record<string, string>>({});
  const [symbolFilter, setSymbolFilter] = useState('');

  const load = async () => {
    const [a, h, g, j] = await Promise.all([
      apiGet<PaperTrade[]>('/papertrading/active').catch(() => []),
      apiGet<PaperTrade[]>('/papertrading/history?limit=500').catch(() => []),
      apiGet<GapAnalysis>('/papertrading/gap-analysis').catch(() => null),
      apiGet<JournalResponse>(`/papertrading/journal?limit=1000${symbolFilter ? `&symbol=${encodeURIComponent(symbolFilter)}` : ''}`).catch(() => null)
    ]);
    setActive(a);
    setHistory(h);
    setGap(g);
    setJournal(j);
  };

  useEffect(() => { load(); }, [symbolFilter]);

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
      <section className="oracle-card flex items-center gap-2">
        <input aria-label="Paper trading symbol filter" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value.toUpperCase())} placeholder="Filter symbol" className="px-3 py-2 rounded bg-oracle-tertiary border border-oracle-border text-sm" />
        <div className="text-xs text-oracle-text-secondary">Live grade + journal + gap analysis mode</div>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Paper Portfolio (Active)</h3>
        <div className="space-y-2 text-sm">
          {active.map((trade) => (
            <div key={trade.id} className="border border-oracle-border rounded p-2 flex flex-wrap gap-2 items-center">
              <span>{trade.symbol}</span>
              <span>{trade.status}</span>
              <span>Entry {trade.entryPrice}</span>
              <button aria-label="Grade trade as agree" className="px-2 py-1 rounded bg-oracle-green text-black text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'AGREE' });
                await load();
              }}>AGREE</button>
              <button aria-label="Grade trade as disagree" className="px-2 py-1 rounded bg-oracle-red text-white text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'DISAGREE', reason: disagreeReasonByTrade[trade.id] || undefined });
                await load();
              }}>DISAGREE</button>
              <button aria-label="Grade trade as neutral" className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={async () => {
                await apiPatch(`/papertrading/${trade.id}/grade`, { verdict: 'NEUTRAL' });
                await load();
              }}>NEUTRAL</button>
              <input
                aria-label="Disagree reason"
                value={disagreeReasonByTrade[trade.id] || ''}
                onChange={(event) => setDisagreeReasonByTrade((prev) => ({ ...prev, [trade.id]: event.target.value }))}
                className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs min-w-[200px]"
                placeholder="Why disagree? optional"
              />
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
            <div className="text-oracle-text-secondary">You left {gap.skipped.potentialPoints.toFixed(2)} points on the table by skipping {gap.totals.skippedSignals} TAKE signals.</div>
          </div>
        ) : (
          <div className="text-sm text-oracle-text-secondary">No gap analysis available.</div>
        )}
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Paper Trade Journal</h3>
        <div className="text-xs mb-2">
          Total {journal?.stats.totalTrades || 0} · Closed {journal?.stats.closedTrades || 0} · Win rate {(Number(journal?.stats.winRate || 0) * 100).toFixed(1)}% · PF {Number(journal?.stats.profitFactor || 0).toFixed(2)}
        </div>
        <div className="max-h-72 overflow-auto text-xs">
          {(journal?.rows || []).slice(0, 300).map((trade) => (
            <div key={trade.id} className="border border-oracle-border rounded p-2 mb-1">
              <div>{trade.symbol} · {trade.status} · Entry {trade.entryPrice} · Exit {trade.exitPrice ?? '-'}</div>
              <div className={Number(trade.pnl || 0) >= 0 ? 'text-oracle-green' : 'text-oracle-red'}>P&L {Number(trade.pnl || 0).toFixed(2)} · Grade {trade.grade || '-'}</div>
            </div>
          ))}
          {!journal?.rows?.length && <div className="text-oracle-text-secondary">No journal trades yet.</div>}
        </div>
      </section>
    </div>
  );
}
