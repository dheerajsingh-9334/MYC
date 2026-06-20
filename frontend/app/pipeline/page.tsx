'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useViewPreference } from '@/lib/useViewPreference';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import OverviewTab from '@/components/pipeline/tabs/OverviewTab';
import AdminTab from '@/components/pipeline/tabs/AdminTab';
import TeamTab from '@/components/pipeline/tabs/TeamTab';
import ClientTab from '@/components/pipeline/tabs/ClientTab';
import SystemTab from '@/components/pipeline/tabs/SystemTab';
import { Sparkles } from 'lucide-react';
import {
  USE_MOCK,
  MOCK_STATS,
  MOCK_STEPS,
  MOCK_CLIENTS,
  MOCK_TASKS,
  MOCK_STANDUP,
} from '@/lib/mockData';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'admin', label: 'Admin' },
  { key: 'team', label: 'Team member' },
  { key: 'client', label: 'Client' },
  { key: 'system', label: 'System / engine' },
];

export default function PipelinePage() {
  // Persisted active tab — survives reloads and syncs across devices.
  const [active, setActive] = useViewPreference<string>({
    page: 'pipeline',
    key: 'active_tab',
    defaultValue: 'overview',
  });

  // Live queries — skipped when USE_MOCK is true
  const { data: liveStats }   = useQuery({ queryKey: ['dashboard-stats'], queryFn: () => apiFetch('/api/dashboard/stats'),  enabled: !USE_MOCK, retry: false });
  const { data: liveSteps = [] }  = useQuery({ queryKey: ['steps'],          queryFn: () => apiFetch('/api/steps'),            enabled: !USE_MOCK, retry: false });
  const { data: liveClients = [] }= useQuery({ queryKey: ['clients'],        queryFn: () => apiFetch('/api/clients'),          enabled: !USE_MOCK, retry: false });
  const { data: liveTasks = [] }  = useQuery({ queryKey: ['tasks'],          queryFn: () => apiFetch('/api/tasks'),            enabled: !USE_MOCK, retry: false });
  const { data: liveStandup }     = useQuery({ queryKey: ['standup'],        queryFn: () => apiFetch('/api/standup'),          enabled: !USE_MOCK, retry: false });

  // Resolve: mock wins when USE_MOCK = true
  const stats   = USE_MOCK ? MOCK_STATS    : liveStats;
  const steps   = USE_MOCK ? MOCK_STEPS   : liveSteps;
  const clients = USE_MOCK ? MOCK_CLIENTS : liveClients;
  const tasks   = USE_MOCK ? MOCK_TASKS   : liveTasks;
  const standup = USE_MOCK ? MOCK_STANDUP : liveStandup;

  return (
    <AppLayout>
      <Topbar title="Pipeline" subtitle="Full system view by role" />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        {/* Demo banner */}
        {USE_MOCK && (
          <div style={{
            marginBottom: 20, padding: '10px 16px', borderRadius: 8,
            background: '#FFF8E7', border: '1px solid #F0D9A0',
            fontSize: 13, color: '#92682A', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Sparkles size={14} />
            <span><strong>Demo mode</strong> — showing 5 dummy clients + sample tasks. Set <code>USE_MOCK = false</code> in <code>lib/mockData.ts</code> to connect the live backend.</span>
          </div>
        )}

        <DashboardHeader
          title="MyC Ops Pipeline"
          subtitle="9 steps · 3 roles · 5 auto-triggers · 1 manual gate — all wired and live"
        />

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActive(t.key)}
              style={{
                padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                border: '1px solid', transition: 'all 0.15s',
                borderColor: active === t.key ? 'var(--olive)' : 'var(--border)',
                background: active === t.key ? 'var(--olive)' : 'var(--surface)',
                color: active === t.key ? '#fff' : 'var(--ink-2)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {active === 'overview' && <OverviewTab stats={stats} steps={steps} clients={clients} />}
        {active === 'admin'    && <AdminTab stats={stats} standup={standup} clients={clients} />}
        {active === 'team'     && <TeamTab tasks={tasks} />}
        {active === 'client'   && <ClientTab />}
        {active === 'system'   && <SystemTab steps={steps} />}
      </div>
    </AppLayout>
  );
}
