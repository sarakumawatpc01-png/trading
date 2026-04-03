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

export default function LearningTab() {
  const [rows, setRows] = useState<Suggestion[]>([]);

  const load = async () => {
    const data = await apiGet<Suggestion[]>('/learning/suggestions').catch(() => []);
    setRows(data);
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
    </div>
  );
}
