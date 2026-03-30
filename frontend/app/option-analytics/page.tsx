'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '../../lib/api';

type Config = {
  optionAnalytics?: {
    strikesAroundAtm?: number;
    expiries?: string;
    includeAllScopes?: boolean;
    includeAllAnalytics?: boolean;
    priorityOrder?: string[];
  };
  watchlistBuckets?: {
    oneSecond?: { symbols?: string[] };
    tradeOneSecond?: { symbols?: string[] };
    fiveSecond?: { symbols?: string[] };
    sixtySecond?: { symbols?: string[] };
  };
};

const DEFAULT_INDICATORS = ['PCR', 'OI build-up', 'Max pain', 'IV', 'Greeks', 'Skew', 'IV rank'];

const SAMPLE_ROWS = [
  {
    symbol: 'NIFTY',
    metrics: {
      PCR: '1.12',
      'OI build-up': 'Long build-up',
      'Max pain': '22100',
      IV: '14.2',
      Greeks: 'Δ 0.42 · Γ 0.08',
      Skew: '-0.18',
      'IV rank': '0.62'
    }
  },
  {
    symbol: 'BANKNIFTY',
    metrics: {
      PCR: '0.98',
      'OI build-up': 'Short covering',
      'Max pain': '47600',
      IV: '16.9',
      Greeks: 'Δ 0.38 · Γ 0.06',
      Skew: '0.05',
      'IV rank': '0.55'
    }
  },
  {
    symbol: 'RELIANCE',
    metrics: {
      PCR: '1.35',
      'OI build-up': 'Long unwind',
      'Max pain': '2920',
      IV: '22.4',
      Greeks: 'Δ 0.46 · Γ 0.09',
      Skew: '-0.22',
      'IV rank': '0.71'
    }
  }
];

export default function OptionAnalyticsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [indicatorOptions, setIndicatorOptions] = useState(DEFAULT_INDICATORS);
  const [selectedIndicator, setSelectedIndicator] = useState(DEFAULT_INDICATORS[0]);
  const [activeIndicators, setActiveIndicators] = useState(DEFAULT_INDICATORS.slice(0, 4));

  useEffect(() => {
    apiGet<Config>('/admin/config')
      .then((data) => {
        setConfig(data);
        const priority = data.optionAnalytics?.priorityOrder?.length
          ? data.optionAnalytics?.priorityOrder
          : DEFAULT_INDICATORS;
        setIndicatorOptions(priority || DEFAULT_INDICATORS);
        setSelectedIndicator((priority && priority[0]) || DEFAULT_INDICATORS[0]);
        setActiveIndicators((prev) => (prev.length ? prev : (priority || DEFAULT_INDICATORS).slice(0, 4)));
      })
      .catch((error) => {
        console.error('Failed to load option analytics config', error);
      });
  }, []);

  const bucketCounts = useMemo(() => {
    const buckets = config?.watchlistBuckets || {};
    return {
      oneSecond: buckets.oneSecond?.symbols?.length || 0,
      tradeOneSecond: buckets.tradeOneSecond?.symbols?.length || 0,
      fiveSecond: buckets.fiveSecond?.symbols?.length || 0,
      sixtySecond: buckets.sixtySecond?.symbols?.length || 0
    };
  }, [config]);

  const addIndicator = () => {
    setActiveIndicators((prev) => (prev.includes(selectedIndicator) ? prev : [...prev, selectedIndicator]));
  };

  const removeIndicator = (indicator: string) => {
    setActiveIndicators((prev) => prev.filter((item) => item !== indicator));
  };

  return (
    <div className="min-h-screen bg-bg text-slate-100 p-4 md:p-8 space-y-6">
      <header className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">Option Analytics</h1>
          <div className="flex gap-2 text-sm mt-2">
            <Link className="px-3 py-1 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700" href="/">Dashboard</Link>
            <Link className="px-3 py-1 rounded bg-slate-800 border border-slate-600 hover:bg-slate-700" href="/paper-trades">Paper Trades</Link>
          </div>
        </div>
        <div className="text-xs text-slate-300">
          Buckets: 1s {bucketCounts.oneSecond} · trade {bucketCounts.tradeOneSecond} · 5s {bucketCounts.fiveSecond} · 60s {bucketCounts.sixtySecond}
        </div>
      </header>

      <section className="card">
        <h2 className="font-semibold mb-3">Indicator Controls</h2>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <select
            className="px-3 py-2 rounded bg-slate-800 border border-slate-600"
            value={selectedIndicator}
            onChange={(event) => setSelectedIndicator(event.target.value)}
          >
            {indicatorOptions.map((indicator) => (
              <option key={indicator} value={indicator}>{indicator}</option>
            ))}
          </select>
          <button className="px-4 py-2 rounded bg-emerald-500 text-black font-semibold" onClick={addIndicator}>Add Indicator</button>
          <div className="text-xs text-slate-300">
            Strikes ±{config?.optionAnalytics?.strikesAroundAtm ?? 10} · Expiries {config?.optionAnalytics?.expiries ?? 'all'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {activeIndicators.map((indicator) => (
            <button
              key={indicator}
              className="px-3 py-1 rounded-full bg-slate-700 text-xs"
              onClick={() => removeIndicator(indicator)}
            >
              {indicator} ✕
            </button>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold mb-3">Realtime Option Map</h2>
          <div className="h-48 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-sm text-slate-400">
            Chart placeholder · add indicators above
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold mb-3">Active Indicators</h2>
          <ul className="space-y-2 text-sm">
            {activeIndicators.map((indicator) => (
              <li key={indicator} className="flex justify-between border-b border-slate-700 pb-2">
                <span>{indicator}</span>
                <span className="text-slate-400">live</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">Preset Table</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="text-xs uppercase text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Symbol</th>
                {activeIndicators.map((indicator) => (
                  <th key={indicator} className="py-2 pr-4">{indicator}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SAMPLE_ROWS.map((row) => (
                <tr key={row.symbol} className="border-b border-slate-800">
                  <td className="py-2 pr-4 font-medium">{row.symbol}</td>
                  {activeIndicators.map((indicator) => (
                    <td key={`${row.symbol}-${indicator}`} className="py-2 pr-4 text-slate-300">
                      {row.metrics[indicator as keyof typeof row.metrics] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
