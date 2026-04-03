'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';

type Activity = {
  id: string;
  node: string;
  level: string;
  event: string;
  symbol?: string | null;
  runId?: string | null;
  createdAt: string;
};

export default function OrchestrationTab() {
  const [activity, setActivity] = useState<Activity[]>([]);

  useEffect(() => {
    const load = async () => {
      const rows = await apiGet<Activity[]>('/pipeline/activity?limit=300').catch(() => []);
      setActivity(rows);
    };
    load();
    const timer = setInterval(load, 5000);
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, '');
    if (!wsBase) return () => clearInterval(timer);
    const ws = new WebSocket(`${wsBase}/ws`);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.type !== 'pipeline:activity') return;
        setActivity((prev) => [{
          id: `ws_${parsed.ts}`,
          node: parsed.payload?.node || 'PIPELINE',
          level: parsed.payload?.level || 'info',
          event: parsed.payload?.event || '',
          symbol: parsed.payload?.symbol || null,
          runId: parsed.payload?.runId || null,
          createdAt: new Date(parsed.payload?.timestamp || Date.now()).toISOString()
        }, ...prev].slice(0, 300));
      } catch (_error) {}
    };
    return () => {
      clearInterval(timer);
      ws.close();
    };
  }, []);

  const nodeSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of activity) counts[row.node] = (counts[row.node] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [activity]);

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <section className="oracle-card lg:col-span-2">
        <h3 className="font-medium mb-2">Pipeline Hierarchy Snapshot</h3>
        <div className="text-sm space-y-1">
          <div>DATA FEEDS → PRE-FILTER</div>
          <div>→ 23 AGENTS (parallel)</div>
          <div>→ BRAIN AI</div>
          <div>→ EXPERT COUNCIL</div>
          <div>→ GRAND SYNTHESIS</div>
          <div>→ TELEGRAM</div>
        </div>
        <div className="mt-4 text-xs text-oracle-text-secondary">
          Top active nodes: {nodeSummary.map(([node, count]) => `${node} (${count})`).join(', ') || 'No activity yet'}
        </div>
      </section>
      <section className="oracle-card lg:col-span-3">
        <h3 className="font-medium mb-2">Activity Log</h3>
        <div className="max-h-[520px] overflow-auto space-y-2 text-xs">
          {activity.map((row) => (
            <div key={row.id} className="border border-oracle-border rounded p-2">
              <div>{row.createdAt} · {row.node} · {row.level.toUpperCase()}</div>
              <div className="text-oracle-text-secondary">{row.event}</div>
            </div>
          ))}
          {!activity.length && <div className="text-oracle-text-secondary">No pipeline events yet.</div>}
        </div>
      </section>
    </div>
  );
}
