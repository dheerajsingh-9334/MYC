'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import AddClientModal from '@/components/pipeline/AddClientModal';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { deriveSparkline } from '@/lib/sparkline';
import { ArrowRight, ArrowUpDown, Search, UserPlus, CircleCheck, Clock, TriangleAlert, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { USE_MOCK, MOCK_CLIENTS, MOCK_STATS } from '@/lib/mockData';

export default function ClientsPage() {
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const router = useRouter();
  const qc = useQueryClient();

  const { data: liveStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/api/dashboard/stats'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const { data: liveClients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const { data: liveTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK,
    retry: false,
  });

  const stats = USE_MOCK ? MOCK_STATS : liveStats;
  const allClients: any[] = USE_MOCK ? MOCK_CLIENTS : liveClients;
  const allTasks: any[] = USE_MOCK ? [] : liveTasks;

  const filtered = allClients
    .filter((c: any) => {
      if (filter === 'overdue') return c.computedStatus === 'overdue';
      if (filter === 'due_today') return c.computedStatus === 'due_today';
      if (filter === 'on_track') return c.computedStatus === 'on_track';
      if (filter === 'blocked') return c.computedStatus === 'blocked';
      return true;
    })
    .filter((c: any) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.fullName?.toLowerCase().includes(q) ||
        c.brandName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { overdue: 0, blocked: 1, due_today: 2, on_track: 3 };
      return (order[a.computedStatus] ?? 4) - (order[b.computedStatus] ?? 4);
    });

  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: 'Overdue' },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };

  const chips = [
    { key: 'all',       label: 'All',       count: allClients.length },
    { key: 'overdue',   label: 'Overdue',   count: allClients.filter((c: any) => c.computedStatus === 'overdue').length },
    { key: 'blocked',   label: 'Blocked',   count: allClients.filter((c: any) => c.computedStatus === 'blocked').length },
    { key: 'due_today', label: 'Due Today', count: allClients.filter((c: any) => c.computedStatus === 'due_today').length },
    { key: 'on_track',  label: 'On Track',  count: allClients.filter((c: any) => c.computedStatus === 'on_track').length },
  ];

  return (
    <AppLayout>
      <Topbar
        title="Clients"
        subtitle={`${allClients.length} active clients`}
        showAddClient
        onAddClient={() => setShowModal(true)}
      />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title="All Clients"
          subtitle="Live view of every coaching client across the 9-step program"
        />

        {/* Stats row */}
        <div className="stat-grid">
          <StatCard
            label="Active Clients"
            value={stats?.total ?? allClients.length}
            accent="var(--olive)"
            trend={`${allClients.length} in pipeline`}
            trendType="up"
            icon={UserPlus}
            sparklineData={deriveSparkline('active', allTasks)}
          />
          <StatCard
            label="On Track"
            value={stats?.onTrack ?? 0}
            accent="var(--green)"
            trend={stats?.total ? `${Math.round((stats.onTrack / stats.total) * 100)}% of total` : '—'}
            trendType="up"
            icon={CircleCheck}
            sparklineData={deriveSparkline('on_track', allTasks)}
          />
          <StatCard
            label="Due Today"
            value={stats?.dueToday ?? 0}
            accent="var(--amber)"
            trend="Needs check-in"
            trendType="warn"
            icon={Clock}
            sparklineData={deriveSparkline('due_today', allTasks)}
          />
          <StatCard
            label="Overdue"
            value={stats?.overdue ?? 0}
            accent="var(--red)"
            trend="See standup brief"
            trendType="down"
            icon={TriangleAlert}
            sparklineData={deriveSparkline('overdue', allTasks)}
          />
        </div>

        {/* Table card */}
        <SectionCard
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Client Pipeline
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpDown size={11} /> Sorted by status
              </span>
            </span>
          }
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search clients…"
                  aria-label="Search clients"
                  style={{ padding: '7px 12px 7px 30px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', width: 220, transition: 'border-color 0.12s' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--olive)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              </div>
            </div>
          }
          padding={0}
        >
          {/* Filter chips */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {chips.map((chip) => (
              <button key={chip.key} onClick={() => setFilter(chip.key)}
                style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer', transition: 'background 0.12s, color 0.12s, border-color 0.12s', borderColor: filter === chip.key ? 'var(--olive)' : 'var(--border)', background: filter === chip.key ? 'var(--olive)' : 'var(--surface)', color: filter === chip.key ? '#fff' : 'var(--ink-2)' }}>
                {chip.label}
                <span style={{ background: filter === chip.key ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)', padding: '1px 6px', borderRadius: 10, fontSize: 10.5, marginLeft: 4 }}>{chip.count}</span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Client', 'Step', 'Team', 'Status', 'Days in Step', ''].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(USE_MOCK ? false : isLoading) ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading clients…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={28} style={{ color: 'var(--olive)' }} />
                      <div>{search ? 'No clients match your search.' : 'No clients found.'}</div>
                    </div>
                  </td></tr>
                ) : filtered.map((client: any) => {
                  const sc = statusConfig[client.computedStatus] || statusConfig.on_track;
                  const initials = (client.brandName || client.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const stepNum = client.currentStep?.stepNumber;
                  const stepNumPad = String(stepNum || 0).padStart(2, '0');
                  const daysInStep = client.daysInStep ?? 0;
                  const slaDays = client.currentStep?.slaDays ?? 0;
                  const isLate = client.computedStatus === 'overdue';
                  const isBlocked = client.computedStatus === 'blocked';
                  const dayLabel = isLate
                    ? `D+${daysInStep} · ${daysInStep - slaDays} day${daysInStep - slaDays > 1 ? 's' : ''} late`
                    : isBlocked ? `D+${daysInStep} · waiting on client`
                    : `D+${daysInStep} of ${slaDays}`;

                  return (
                    <tr key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      style={{ position: 'relative', cursor: 'pointer', transition: 'background 0.1s', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--olive-50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ position: 'relative', padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--olive)', transform: 'scaleY(0)', transformOrigin: 'top', transition: 'transform 0.1s' }} className="row-stripe" />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--olive), var(--olive-light))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{initials}</div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13.5 }}>{client.brandName || client.fullName}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)' }}>{client.fullName} · joined {new Date(client.dateJoined).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--olive-dark)' }}>
                          <span style={{ background: 'var(--olive)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{stepNumPad}</span>
                          {client.currentStep?.name}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)', flexShrink: 0 }} />
                          {client.currentStep?.owningTeamName}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: 600, background: sc.bg, color: sc.color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: isLate ? 'var(--red)' : 'var(--muted)', fontWeight: isLate ? 600 : 400 }}>
                          {dayLabel}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/clients/${client.id}`); }}
                          style={{ padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'background 0.12s, border-color 0.12s, color 0.12s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; (e.currentTarget as HTMLElement).style.color = 'var(--olive)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}
                        >
                          View <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <AddClientModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['clients'] })}
      />
      <style>{`tr:hover .row-stripe { transform: scaleY(1) !important; }`}</style>
    </AppLayout>
  );
}