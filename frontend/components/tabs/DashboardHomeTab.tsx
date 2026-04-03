'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';

type Setup = { id: string; symbol: string; decision: string; confidence: number; rationale: string; createdAt: string };
type Signal = { id: string; symbol: string; action: string; reason: string; createdAt: string };
type Health = { queueDepth?: number; redis?: string; clickhouse?: string; python?: string };
type PaperPortfolio = { balance: number; realizedPnl: number; openTrades: number };

export default function DashboardHomeTab() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [health, setHealth] = useState<Health>({});
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);

  useEffect(() => {
    const load = async () => {
      const [setupRows, signalRows, healthRow, portfolioRow] = await Promise.all([
        apiGet<Setup[]>('/setups').catch(() => []),
        apiGet<Signal[]>('/signals').catch(() => []),
        apiGet<{ health: Health }>('/health').catch(() => ({ health: {} })),
        apiGet<PaperPortfolio>('/paper/portfolio').catch(() => null)
      ]);
      setSetups(setupRows);
      setSignals(signalRows);
      setHealth(healthRow.health || {});
      setPortfolio(portfolioRow);
    };
    load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => ({
    TAKE: setups.filter((row) => row.decision === 'TAKE').length,
    WAIT: setups.filter((row) => row.decision === 'WAIT').length,
    SKIP: setups.filter((row) => row.decision === 'SKIP').length
  }), [setups]);

  return (
    <div className="space-y-4">
      <section className="grid md:grid-cols-3 gap-4">
        <div className="oracle-card">
          <div className="text-sm text-oracle-text-secondary">Signals Today</div>
          <div className="mt-2 text-sm">TAKE {counts.TAKE} · WAIT {counts.WAIT} · SKIP {counts.SKIP}</div>
        </div>
        <div className="oracle-card">
          <div className="text-sm text-oracle-text-secondary">System Health</div>
          <div className="mt-2 text-sm">Redis {health.redis || '-'} · ClickHouse {health.clickhouse || '-'} · Python {health.python || '-'}</div>
        </div>
        <div className="oracle-card">
          <div className="text-sm text-oracle-text-secondary">Paper Portfolio</div>
          <div className="mt-2 text-sm">PnL ₹{Number(portfolio?.realizedPnl || 0).toFixed(2)} · Balance ₹{Number(portfolio?.balance || 0).toFixed(2)} · Open {portfolio?.openTrades || 0}</div>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="oracle-card">
          <h3 className="font-medium mb-2">Today&apos;s Signals Feed</h3>
          <div className="space-y-2 max-h-80 overflow-auto">
            {signals.map((signal) => (
              <div key={signal.id} className="border border-oracle-border rounded p-2 text-sm">
                <div>{signal.symbol} · {signal.action}</div>
                <div className="text-xs text-oracle-text-secondary">{signal.reason}</div>
              </div>
            ))}
            {!signals.length && <div className="text-sm text-oracle-text-secondary">No signals yet.</div>}
          </div>
        </div>
        <div className="oracle-card">
          <h3 className="font-medium mb-2">Recent Setups</h3>
          <div className="space-y-2 max-h-80 overflow-auto">
            {setups.map((setup) => (
              <div key={setup.id} className="border border-oracle-border rounded p-2 text-sm">
                <div>{setup.symbol} · {setup.decision} · {(setup.confidence * 100).toFixed(1)}%</div>
                <div className="text-xs text-oracle-text-secondary">{setup.rationale}</div>
              </div>
            ))}
            {!setups.length && <div className="text-sm text-oracle-text-secondary">No setups yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
