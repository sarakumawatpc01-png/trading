'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api';

type Suggestion = {
  id: string;
  title: string;
  issue: string;
  evidence: string;
  fix: string;
  expectedImpact: string;
  backtestEvidence: string;
  status: string;
  implementationStatus?: string | null;
};

type AgentDashboardRow = {
  agent: string;
  model: string;
  weight: number;
  winRate7d: number;
  winRate30d: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  lastEvolution: string;
  status: string;
};

type WeightHistoryResponse = {
  points: Array<{ date: string; weights: Record<string, number> }>;
  evolutionDates: string[];
};

type ImplementationLogRow = {
  id: string;
  suggestedAt: string;
  summary: string;
  decision: string;
  implementationDate: string | null;
  outcome: string;
  commitHash: string | null;
  details: Suggestion;
};

export default function LearningTab() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [agentRows, setAgentRows] = useState<AgentDashboardRow[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightHistoryResponse | null>(null);
  const [implementationLog, setImplementationLog] = useState<ImplementationLogRow[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const load = async () => {
    const [data, agents, history, impl] = await Promise.all([
      apiGet<Suggestion[]>('/learning/suggestions').catch(() => []),
      apiGet<AgentDashboardRow[]>('/learning/agent-dashboard').catch(() => []),
      apiGet<WeightHistoryResponse>('/learning/weight-history').catch(() => null),
      apiGet<ImplementationLogRow[]>('/learning/implementation-log').catch(() => [])
    ]);
    setRows(data);
    setAgentRows(agents);
    setWeightHistory(history);
    setImplementationLog(impl);
    const byWeight = [...agents].sort((a, b) => b.weight - a.weight);
    const topBottom = byWeight.length >= 10
      ? [...byWeight.slice(0, 5), ...byWeight.slice(-5)].map((row) => row.agent)
      : byWeight.map((row) => row.agent);
    setSelectedAgents(Array.from(new Set(topBottom)));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex gap-2">
        <button className="px-3 py-2 rounded bg-oracle-gold text-black text-sm" onClick={async () => {
          await apiPost('/learning/generate-suggestions', {});
          await load();
        }}>Generate Suggestions</button>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Agent Performance Dashboard</h3>
        <div className="max-h-72 overflow-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-left text-oracle-text-secondary">
                <th>Agent</th><th>Model</th><th>Weight</th><th>7d</th><th>30d</th><th>Trend</th><th>Last Evolution</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map((row) => (
                <tr key={row.agent} className="border-t border-oracle-border">
                  <td>{row.agent}</td>
                  <td>{row.model}</td>
                  <td><span className={`px-2 py-0.5 rounded ${row.weight > 1.5 ? 'bg-oracle-green/30' : row.weight >= 1 ? 'bg-oracle-blue/30' : row.weight >= 0.5 ? 'bg-oracle-orange/30' : 'bg-oracle-red/30'}`}>{row.weight.toFixed(2)}</span></td>
                  <td>{(row.winRate7d * 100).toFixed(1)}%</td>
                  <td>{(row.winRate30d * 100).toFixed(1)}%</td>
                  <td>{row.trend === 'UP' ? '↑' : row.trend === 'DOWN' ? '↓' : '→'}</td>
                  <td>{row.lastEvolution.slice(0, 10)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Weight History</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          {agentRows.map((row) => (
            <label key={row.agent} className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={selectedAgents.includes(row.agent)} onChange={(event) => {
                setSelectedAgents((prev) => event.target.checked ? [...prev, row.agent] : prev.filter((item) => item !== row.agent));
              }} />
              {row.agent}
            </label>
          ))}
        </div>
        <div className="max-h-64 overflow-auto text-xs space-y-1">
          {(weightHistory?.points || []).map((point) => (
            <div key={point.date} className="border border-oracle-border rounded p-2">
              <div className="font-medium">{point.date}{(weightHistory?.evolutionDates || []).includes(point.date) ? ' · prompt evolution' : ''}</div>
              <div>{selectedAgents.map((agent) => `${agent}:${Number(point.weights?.[agent] ?? 0).toFixed(2)}`).join(' | ')}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="oracle-card text-sm">
            <div className="font-medium">{row.title}</div>
            <div className="text-oracle-text-secondary mt-1">{row.issue}</div>
            <div className="mt-1">Evidence: {row.evidence}</div>
            <div className="mt-1">Fix: {row.fix}</div>
            <div className="mt-1">Impact: {row.expectedImpact}</div>
            <div className="mt-1">Backtest: {row.backtestEvidence}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button aria-label="Approve suggestion" className="px-2 py-1 rounded bg-oracle-green text-black text-xs" onClick={async () => {
                await apiPost(`/learning/approve/${row.id}`, { decision: 'APPROVE' });
                await load();
              }}>APPROVE</button>
              <button aria-label="Reject suggestion" className="px-2 py-1 rounded bg-oracle-red text-white text-xs" onClick={async () => {
                await apiPost(`/learning/approve/${row.id}`, { decision: 'REJECT' });
                await load();
              }}>REJECT</button>
              <button aria-label="Defer suggestion" className="px-2 py-1 rounded bg-oracle-tertiary border border-oracle-border text-xs" onClick={async () => {
                await apiPost(`/learning/approve/${row.id}`, { decision: 'DEFER' });
                await load();
              }}>DEFER</button>
              <span className="text-xs text-oracle-text-secondary self-center">{row.status} {row.implementationStatus ? `· ${row.implementationStatus}` : ''}</span>
            </div>
          </div>
        ))}
        {!rows.length && <div className="oracle-card text-sm text-oracle-text-secondary">No suggestions yet.</div>}
      </section>

      <section className="oracle-card">
        <h3 className="font-medium mb-2">Implementation Log</h3>
        <div className="space-y-1 text-xs max-h-64 overflow-auto">
          {implementationLog.map((row) => (
            <div key={row.id} className="border border-oracle-border rounded p-2">
              <div>{row.suggestedAt} · {row.summary}</div>
              <div>Decision {row.decision} · Outcome {row.outcome} · Impl {row.implementationDate || '-'}</div>
              <div>Commit {row.commitHash || '-'}</div>
            </div>
          ))}
          {!implementationLog.length && <div className="text-oracle-text-secondary">No implementation log entries.</div>}
        </div>
      </section>
    </div>
  );
}
