'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../lib/api';

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
  const [showSystem, setShowSystem] = useState(true);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await apiGet<Notification[]>('/notifications?limit=200').catch(() => []);
      setRows(data);
    };
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => rows.filter((row) => {
    if (row.type === 'system' && !showSystem) return false;
    if (row.type !== 'system' && !showInfo) return false;
    return true;
  }), [rows, showSystem, showInfo]);

  return (
    <div className="space-y-4">
      <section className="oracle-card flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showSystem} onChange={(event) => setShowSystem(event.target.checked)} />
          System Alerts
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showInfo} onChange={(event) => setShowInfo(event.target.checked)} />
          Info / Feed
        </label>
      </section>
      <section className="space-y-2">
        {filtered.map((row) => (
          <div key={row.id} className="oracle-card text-sm">
            <div className="flex justify-between gap-2">
              <div>{row.title}</div>
              <div className="text-xs text-oracle-text-secondary">{row.createdAt}</div>
            </div>
            <div className="text-xs text-oracle-text-secondary mt-1">{row.body}</div>
          </div>
        ))}
        {!filtered.length && <div className="oracle-card text-sm text-oracle-text-secondary">No notifications.</div>}
      </section>
    </div>
  );
}
