'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';

type Setup = { id: string; symbol: string; decision: string; confidence: number; rationale: string; createdAt: string };
type Signal = { id: string; symbol: string; action: string; reason: string; createdAt: string };
type Health = { queueDepth?: number; redis?: string; clickhouse?: string; python?: string };
type PaperPortfolio = { balance: number; realizedPnl: number; openTrades: number };
type LiveOverview = {
  prices: {
    nifty50: { price: number; changePct: number; sparkline: number[] };
    bankNifty: { price: number; changePct: number; sparkline: number[] };
    indiaVix: { value: number; level: string };
  };
  pipeline: {
    ticksProcessed: number;
    prefilterTriggers: number;
    agentsCalled: number;
    signals: { TAKE: number; WAIT: number; SKIP: number };
    apiCostTodayInr: number;
    apiBudgetInr: number;
  };
  system: {
    containers: Array<{ name: string; status: string }>;
    cpuPercent: number;
    ramPercent: number;
    kite: { status: string; ticksPerSec: number };
    lastSignalAt: string | null;
  };
  paper: PaperPortfolio;
};
type MarketContext = {
  fii: { todayCr: number; trend5d: number[] };
  pcr: number;
  maxPain: number;
  sectors: Array<{ name: string; changePct: number }>;
  activePaperTrades: { count: number; openPnl: number };
};

export default function DashboardHomeTab() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [health, setHealth] = useState<Health>({});
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [overview, setOverview] = useState<LiveOverview | null>(null);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  useEffect(() => {
    const load = async () => {
      const [setupRows, signalRows, healthRow, portfolioRow, overviewRow, marketRow] = await Promise.all([
        apiGet<Setup[]>('/setups').catch(() => []),
        apiGet<Signal[]>('/signals').catch(() => []),
        apiGet<{ health: Health }>('/health').catch(() => ({ health: {} })),
        apiGet<PaperPortfolio>('/paper/portfolio').catch(() => null),
        apiGet<LiveOverview>('/dashboard/live-overview').catch(() => null),
        apiGet<MarketContext>('/market/context').catch(() => null)
      ]);
      setSetups(setupRows);
      setSignals(signalRows);
      setHealth(healthRow.health || {});
      setPortfolio(portfolioRow);
      setOverview(overviewRow);
      setMarketContext(marketRow);
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
          <div className="text-sm text-oracle-text-secondary">Live Prices</div>
          <div className="mt-2 text-sm">
            Nifty 50 {Number(overview?.prices.nifty50.price || 0).toFixed(2)} ({Number(overview?.prices.nifty50.changePct || 0).toFixed(2)}%)
          </div>
          <Sparkline points={overview?.prices.nifty50.sparkline || []} />
          <div className="mt-2 text-sm">
            BankNifty {Number(overview?.prices.bankNifty.price || 0).toFixed(2)} ({Number(overview?.prices.bankNifty.changePct || 0).toFixed(2)}%)
          </div>
          <Sparkline points={overview?.prices.bankNifty.sparkline || []} />
          <div className="mt-2 text-sm">India VIX {Number(overview?.prices.indiaVix.value || 0).toFixed(2)} · {overview?.prices.indiaVix.level || '-'}</div>
        </div>
        <div className="oracle-card">
          <div className="text-sm text-oracle-text-secondary">Today&apos;s Pipeline Activity</div>
          <div className="mt-2 text-sm">Ticks processed: {Number(overview?.pipeline.ticksProcessed || 0).toLocaleString()}</div>
          <div className="text-sm">Pre-Filter triggers: {Number(overview?.pipeline.prefilterTriggers || setups.length)}</div>
          <div className="text-sm">Agents called: {Number(overview?.pipeline.agentsCalled || 0)}</div>
          <div className="text-sm">Signals: TAKE {counts.TAKE} · WAIT {counts.WAIT} · SKIP {counts.SKIP}</div>
          <div className="text-sm">API cost: ₹{Number(overview?.pipeline.apiCostTodayInr || 0).toFixed(2)} / ₹{Number(overview?.pipeline.apiBudgetInr || 0).toFixed(2)}</div>
        </div>
        <div className="oracle-card">
          <div className="text-sm text-oracle-text-secondary">System Health</div>
          <div className="mt-2 text-sm">Redis {health.redis || '-'} · ClickHouse {health.clickhouse || '-'} · Python {health.python || '-'}</div>
          <div className="text-sm">CPU {Number(overview?.system.cpuPercent || 0).toFixed(1)}% · RAM {Number(overview?.system.ramPercent || 0).toFixed(1)}%</div>
          <div className="text-sm">Kite {overview?.system.kite.status || '-'} {Number(overview?.system.kite.ticksPerSec || 0).toFixed(1)} ticks/s</div>
          <div className="text-sm">Last signal {overview?.system.lastSignalAt || '-'}</div>
          <div className="mt-2 text-xs">Paper: PnL ₹{Number(portfolio?.realizedPnl || 0).toFixed(2)} · Balance ₹{Number(portfolio?.balance || 0).toFixed(2)} · Open {portfolio?.openTrades || 0}</div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {(overview?.system.containers || []).map((container) => (
              <div key={container.name} className="text-[10px] border border-oracle-border rounded px-1 py-0.5 flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${container.status === 'green' ? 'bg-oracle-green' : container.status === 'yellow' ? 'bg-oracle-orange' : 'bg-oracle-red'}`} />
                {container.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[65%,35%] gap-4">
        <div className="oracle-card min-w-0">
          <h3 className="font-medium mb-2">Today&apos;s Signals Feed</h3>
          <div className="space-y-2 max-h-80 overflow-auto">
            {signals.map((signal) => (
              <div key={signal.id} className="border border-oracle-border rounded p-2 text-sm cursor-pointer hover:bg-oracle-tertiary/40" onClick={() => setSelectedSignal(signal)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{signal.symbol}</span>
                  <span className={signal.action === 'TAKE' ? 'text-oracle-green' : signal.action === 'SKIP' ? 'text-oracle-red' : 'text-oracle-blue'}>
                    {signal.action === 'TAKE' ? '↑' : signal.action === 'SKIP' ? '↓' : '→'} {signal.action}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-oracle-gold text-black text-[10px]">
                    {signal.action === 'TAKE' ? 'HIGH' : signal.action === 'WAIT' ? 'MODERATE' : 'EXCEPTIONAL'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-oracle-purple/30 text-[10px]">SWING_PATTERN</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] mt-1">
                  <div>A 62/100</div><div>B 58/100</div><div>C 67/100</div>
                  <div>D 54/100</div><div>E 60/100</div><div>F 64/100</div>
                </div>
                <div className="text-xs text-oracle-text-secondary mt-1">{signal.reason}</div>
              </div>
            ))}
            {!signals.length && <div className="text-sm text-oracle-text-secondary">No signals yet.</div>}
          </div>
        </div>
        <div className="oracle-card min-w-0">
          <h3 className="font-medium mb-2">Market Context</h3>
          <div className="space-y-2 text-sm max-h-80 overflow-auto">
            <div>FII Net: ₹{Number(marketContext?.fii.todayCr || 0).toFixed(2)} Cr</div>
            <div className="text-xs text-oracle-text-secondary">5d: {(marketContext?.fii.trend5d || []).map((v) => v.toFixed(0)).join(', ')}</div>
            <div>PCR: {Number(marketContext?.pcr || 0).toFixed(2)}</div>
            <div>Max Pain: {Number(marketContext?.maxPain || 0).toFixed(2)}</div>
            <div className="text-xs font-medium mt-2">Sector Rotation</div>
            <div className="grid grid-cols-2 gap-1">
              {(marketContext?.sectors || []).map((sector) => (
                <div key={sector.name} className={`text-[10px] border border-oracle-border rounded px-1 py-0.5 ${sector.changePct >= 0 ? 'text-oracle-green' : 'text-oracle-red'}`}>
                  {sector.name}: {sector.changePct.toFixed(2)}%
                </div>
              ))}
            </div>
            <div>Active paper trades: {marketContext?.activePaperTrades.count || 0}</div>
            <div>Open paper PnL: {Number(marketContext?.activePaperTrades.openPnl || 0).toFixed(2)}</div>
          </div>
        </div>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Recent Setups</h3>
        <div className="space-y-2 max-h-72 overflow-auto">
          {setups.map((setup) => (
            <div key={setup.id} className="border border-oracle-border rounded p-2 text-sm">
              <div>{setup.symbol} · {setup.decision} · {(setup.confidence * 100).toFixed(1)}%</div>
              <div className="text-xs text-oracle-text-secondary">{setup.rationale}</div>
            </div>
          ))}
          {!setups.length && <div className="text-sm text-oracle-text-secondary">No setups yet.</div>}
        </div>
      </section>

      {selectedSignal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedSignal(null)}>
          <div className="oracle-card w-full max-w-xl max-h-[80vh] overflow-auto" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Signal Detail</h3>
              <button className="text-xs px-2 py-1 rounded border border-oracle-border" onClick={() => setSelectedSignal(null)}>Close</button>
            </div>
            <pre className="text-xs mt-2 whitespace-pre-wrap">{JSON.stringify(selectedSignal, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = Math.max(1, max - min);
  return (
    <div className="h-8 flex items-end gap-[1px] mt-1">
      {points.map((point, idx) => {
        const h = Math.max(2, ((point - min) / range) * 100);
        return <div key={idx} className="w-1 bg-oracle-blue/70" style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}
