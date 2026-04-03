'use client';

import { useMemo, useState } from 'react';
import DashboardHomeTab from './tabs/DashboardHomeTab';
import ChartsTab from './tabs/ChartsTab';
import OrchestrationTab from './tabs/OrchestrationTab';
import BacktestingTab from './tabs/BacktestingTab';
import PaperTradingTab from './tabs/PaperTradingTab';
import LearningTab from './tabs/LearningTab';
import SettingsTab from './tabs/SettingsTab';
import NotificationsTab from './tabs/NotificationsTab';

type MainTab = 'dashboard' | 'charts' | 'orchestration' | 'backtesting' | 'paper' | 'learning' | 'settings' | 'notifications';

const TABS: Array<{ key: MainTab; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'charts', label: 'Charts' },
  { key: 'orchestration', label: 'Orchestration' },
  { key: 'backtesting', label: 'Backtesting' },
  { key: 'paper', label: 'Paper Trading' },
  { key: 'learning', label: 'Learning' },
  { key: 'settings', label: 'Settings' },
  { key: 'notifications', label: 'Notifications' }
];

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');

  const body = useMemo(() => {
    if (activeTab === 'dashboard') return <DashboardHomeTab />;
    if (activeTab === 'charts') return <ChartsTab />;
    if (activeTab === 'orchestration') return <OrchestrationTab />;
    if (activeTab === 'backtesting') return <BacktestingTab />;
    if (activeTab === 'paper') return <PaperTradingTab />;
    if (activeTab === 'learning') return <LearningTab />;
    if (activeTab === 'settings') return <SettingsTab />;
    return <NotificationsTab />;
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-oracle-bg text-oracle-text-primary flex">
      <aside className="w-[220px] shrink-0 border-r border-oracle-border bg-oracle-secondary p-4 hidden md:block">
        <div className="text-oracle-gold font-semibold mb-4">ORACLE</div>
        <nav className="space-y-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`w-full text-left px-3 py-2 rounded border transition ${activeTab === tab.key ? 'bg-oracle-gold text-black border-oracle-gold' : 'bg-oracle-tertiary border-oracle-border text-oracle-text-primary hover:border-oracle-gold'}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-14 border-b border-oracle-border bg-oracle-secondary px-4 flex items-center justify-between">
          <div className="font-medium">{TABS.find((t) => t.key === activeTab)?.label}</div>
          <div className="text-xs text-oracle-text-secondary">IST · ORACLE Trading Intelligence</div>
        </header>
        <main className="p-4 md:p-6">{body}</main>
      </div>
    </div>
  );
}
