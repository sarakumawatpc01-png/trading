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

type NodeDetails = {
  node: string;
  lastRun: {
    input: unknown;
    output: unknown;
    processingTimeMs: number;
    model: string;
    cost: number;
    createdAt: string;
  } | null;
  performance: {
    eventCount: number;
    outputCount: number;
    currentWeight: number | null;
    trend: 'up' | 'down' | 'flat';
  };
  configuration: {
    promptPreview: string;
    settingsPath: string;
    nodeLogs: Array<{ id: string; message: string; createdAt: string }>;
  };
};

export default function OrchestrationTab() {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [selectedNode, setSelectedNode] = useState('PIPELINE');
  const [details, setDetails] = useState<NodeDetails | null>(null);
  const [detailTab, setDetailTab] = useState<'lastRun' | 'performance' | 'configuration'>('lastRun');

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
      } catch (error) {
        console.warn('Malformed pipeline activity message', { error, raw: event.data });
      }
    };
    return () => {
      clearInterval(timer);
      ws.close();
    };
  }, []);

  useEffect(() => {
    apiGet<NodeDetails>(`/pipeline/node-details?node=${encodeURIComponent(selectedNode)}`)
      .then((row) => setDetails(row))
      .catch(() => setDetails(null));
  }, [selectedNode]);

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
          {['DATA FEEDS', 'PRE-FILTER', 'A13', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'BRAIN AI', 'EXPERT COUNCIL', 'GRAND SYNTHESIS', 'TELEGRAM'].map((node) => (
            <button key={node} className={`block text-left w-full px-2 py-1 rounded border ${selectedNode === node ? 'border-oracle-gold bg-oracle-tertiary' : 'border-transparent'}`} onClick={() => setSelectedNode(node)}>
              {node}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-oracle-text-secondary">
          Top active nodes: {nodeSummary.map(([node, count]) => `${node} (${count})`).join(', ') || 'No activity yet'}
        </div>
      </section>
      <section className="oracle-card lg:col-span-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-medium">Activity Log</h3>
          <div className="text-xs text-oracle-text-secondary">Selected node: {selectedNode}</div>
        </div>
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

      <section className="oracle-card lg:col-span-5">
        <div className="flex gap-2 mb-3">
          <button className={`px-3 py-1 rounded text-xs ${detailTab === 'lastRun' ? 'bg-oracle-gold text-black' : 'bg-oracle-tertiary'}`} onClick={() => setDetailTab('lastRun')}>Last Run</button>
          <button className={`px-3 py-1 rounded text-xs ${detailTab === 'performance' ? 'bg-oracle-gold text-black' : 'bg-oracle-tertiary'}`} onClick={() => setDetailTab('performance')}>Performance</button>
          <button className={`px-3 py-1 rounded text-xs ${detailTab === 'configuration' ? 'bg-oracle-gold text-black' : 'bg-oracle-tertiary'}`} onClick={() => setDetailTab('configuration')}>Configuration</button>
        </div>
        {detailTab === 'lastRun' && (
          <div className="text-xs space-y-2">
            <div>Model: {details?.lastRun?.model || '-'} · Cost: {Number(details?.lastRun?.cost || 0).toFixed(4)} · Processing: {details?.lastRun?.processingTimeMs || 0} ms</div>
            <details>
              <summary className="cursor-pointer">Input JSON</summary>
              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(details?.lastRun?.input || {}, null, 2)}</pre>
            </details>
            <details>
              <summary className="cursor-pointer">Output JSON</summary>
              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(details?.lastRun?.output || {}, null, 2)}</pre>
            </details>
          </div>
        )}
        {detailTab === 'performance' && (
          <div className="text-xs space-y-1">
            <div>Event Count: {details?.performance.eventCount || 0}</div>
            <div>Output Count: {details?.performance.outputCount || 0}</div>
            <div>Current Weight: {details?.performance.currentWeight ?? '-'}</div>
            <div>Trend: {details?.performance.trend || 'flat'}</div>
          </div>
        )}
        {detailTab === 'configuration' && (
          <div className="text-xs space-y-2">
            <div>Settings link: {details?.configuration.settingsPath || '-'}</div>
            <details>
              <summary className="cursor-pointer">Prompt Preview</summary>
              <pre className="mt-1 whitespace-pre-wrap">{details?.configuration.promptPreview || 'No prompt available for this node.'}</pre>
            </details>
            <div>
              <div className="mb-1">Recent node logs</div>
              {(details?.configuration.nodeLogs || []).map((row) => (
                <div key={row.id} className="border border-oracle-border rounded p-1 mb-1">{row.createdAt} · {row.message}</div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
