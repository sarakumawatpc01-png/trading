'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPatch } from '../../lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read?: boolean;
};

export default function NotificationsTab() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<Record<string, boolean>>({
    trade_signals: true,
    system_alerts: true,
    learning_reports: true,
    a23_promotions: true,
    backtest_complete: true,
    paper_trade_updates: true,
    pre_market_reports: true
  });
  const [telegramHistory, setTelegramHistory] = useState<Array<{ id: string; alertType: string; message: string; deliveredAt: string }>>([]);
  const [telegramPreviewType, setTelegramPreviewType] = useState('trade_signals');

  useEffect(() => {
    const load = async () => {
      const activeTypes = Object.entries(filters).filter(([, enabled]) => enabled).map(([type]) => type);
      const [data, tg] = await Promise.all([
        apiGet<Notification[]>(`/notifications?limit=200&types=${encodeURIComponent(activeTypes.join(','))}`).catch(() => []),
        apiGet<Array<{ id: string; alertType: string; message: string; deliveredAt: string }>>('/notifications/telegram/history').catch(() => [])
      ]);
      setRows(data);
      setTelegramHistory(tg);
    };
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [filters]);

  const filtered = useMemo(() => rows.filter((row) => Boolean(filters[row.type] ?? true)), [rows, filters]);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-3 text-sm">
        {Object.keys(filters).map((type) => (
          <label key={type} className="flex items-center gap-2">
            <input aria-label={`Filter ${type}`} type="checkbox" checked={filters[type]} onChange={(event) => setFilters((prev) => ({ ...prev, [type]: event.target.checked }))} />
            {type.replaceAll('_', ' ')}
          </label>
        ))}
      </section>
      <section className="space-y-2">
        {filtered.map((row) => (
          <div key={row.id} className="oracle-card text-sm">
            <div className="flex justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${row.type === 'system_alerts' ? 'bg-oracle-red' : row.type === 'learning_reports' ? 'bg-oracle-purple' : row.type === 'backtest_complete' ? 'bg-oracle-blue' : 'bg-oracle-green'}`} />
                <span>{row.title}</span>
              </div>
              <div className="text-xs text-oracle-text-secondary">{row.createdAt}</div>
            </div>
            <div className="text-xs text-oracle-text-secondary mt-1">{row.type.replaceAll('_', ' ')}</div>
            {expanded[row.id] && <div className="text-xs mt-2 whitespace-pre-wrap">{row.body}</div>}
            <div className="mt-2 flex gap-2">
              <button className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}>{expanded[row.id] ? 'Collapse' : 'Expand'}</button>
              <button className="px-2 py-1 rounded bg-oracle-blue text-black text-xs" onClick={async () => {
                await apiPatch(`/notifications/${row.id}/read`, {});
                setRows((prev) => prev.map((item) => item.id === row.id ? { ...item, read: true } : item));
              }}>Mark read</button>
              <button className="px-2 py-1 rounded bg-oracle-red text-white text-xs" onClick={async () => {
                await fetch(`${process.env.NEXT_PUBLIC_API_BASE || '/api/proxy'}/notifications/${row.id}`, { method: 'DELETE' });
                setRows((prev) => prev.filter((item) => item.id !== row.id));
              }}>Dismiss</button>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="oracle-card text-sm text-oracle-text-secondary">No notifications.</div>}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="oracle-card">
          <h3 className="font-medium mb-2">Telegram Preview</h3>
          <select value={telegramPreviewType} onChange={(event) => setTelegramPreviewType(event.target.value)} className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs mb-2">
            <option value="trade_signals">Trade Signals</option>
            <option value="system_alerts">System Alerts</option>
            <option value="learning_reports">Learning Reports</option>
            <option value="a23_promotions">A23 Promotions</option>
            <option value="backtest_complete">Backtest Complete</option>
            <option value="paper_trade_updates">Paper Trade Updates</option>
            <option value="pre_market_reports">Pre-Market Reports</option>
          </select>
          <div className="rounded border border-oracle-border p-3 text-xs bg-oracle-tertiary">
            ORACLE ALERT ({telegramPreviewType}){'\n'}
            Symbol: RELIANCE.NS · Verdict: TAKE{'\n'}
            Score: HIGH · Pattern: SWING_CONTINUATION
          </div>
          <button className="mt-2 px-3 py-2 rounded bg-oracle-gold text-black text-xs" onClick={async () => {
            await fetch(`${process.env.NEXT_PUBLIC_API_BASE || '/api/proxy'}/settings/telegram/test`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ alertType: telegramPreviewType })
            });
            const history = await apiGet<Array<{ id: string; alertType: string; message: string; deliveredAt: string }>>('/notifications/telegram/history').catch(() => []);
            setTelegramHistory(history);
          }}>Test send</button>
        </div>
        <div className="oracle-card">
          <h3 className="font-medium mb-2">Telegram Alert History</h3>
          <div className="space-y-2 text-xs max-h-52 overflow-auto">
            {telegramHistory.map((row) => (
              <div key={row.id} className="border border-oracle-border rounded p-2">
                <div>{row.alertType.replaceAll('_', ' ')}</div>
                <div className="text-oracle-text-secondary">{row.message}</div>
                <div className="text-oracle-text-secondary">{row.deliveredAt}</div>
              </div>
            ))}
            {!telegramHistory.length && <div className="text-oracle-text-secondary">No telegram alerts yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
