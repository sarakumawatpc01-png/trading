'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '../../lib/api';

type PaperTrade = {
  id: string;
  setupId: string;
  runId?: string;
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  status: 'OPEN' | 'CLOSED';
  pnl?: number;
  fees?: number;
  exitReason?: string;
  createdAt: string;
  closedAt?: string;
};

export default function PaperTradesPage() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<PaperTrade[]>('/paper/trades?limit=1000')
      .then((rows) => {
        setTrades(rows);
        setError('');
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load paper trades', err);
        setTrades([]);
        setError('Failed to load paper trades history.');
      });
  }, []);

  const closed = useMemo(() => trades.filter((trade) => trade.status === 'CLOSED'), [trades]);
  const wins = useMemo(() => closed.filter((trade) => Number(trade.pnl || 0) > 0).length, [closed]);
  const hitRate = useMemo(() => (closed.length ? (wins / closed.length) * 100 : 0), [wins, closed.length]);
  const totalPnl = useMemo(() => closed.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0), [closed]);

  return (
    <div className="min-h-screen bg-bg text-slate-100 p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paper Trades History</h1>
        <Link href="/" className="px-4 py-2 rounded bg-slate-700 text-sm">Back to Dashboard</Link>
      </header>

      <section className="card text-sm">
        <div>Total trades: {trades.length}</div>
        <div>Closed: {closed.length}</div>
        <div>Hit rate: {hitRate.toFixed(1)}%</div>
        <div>Total PnL: ₹{totalPnl.toFixed(2)}</div>
        {error && <div className="text-rose-300">{error}</div>}
      </section>

      <section className="card overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-slate-700">
              <th className="py-2">Time</th>
              <th>Symbol</th>
              <th>Status</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>Qty</th>
              <th>PnL</th>
              <th>Exit Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className="border-b border-slate-800">
                <td className="py-2">{trade.createdAt}</td>
                <td>{trade.symbol}</td>
                <td>{trade.status}</td>
                <td>{Number(trade.entryPrice || 0).toFixed(2)}</td>
                <td>{trade.exitPrice ? Number(trade.exitPrice).toFixed(2) : '-'}</td>
                <td>{trade.quantity}</td>
                <td>{trade.pnl !== undefined ? Number(trade.pnl).toFixed(2) : '-'}</td>
                <td>{trade.exitReason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
