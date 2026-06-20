'use client';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useViewPreference } from '@/lib/useViewPreference';
import { deriveSparkline } from '@/lib/sparkline';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import AddClientModal from '@/components/pipeline/AddClientModal';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import {
  Sparkles,
  TriangleAlert,
  Ban,
  Clock,
  ArrowRight,
  UserPlus,
  CircleCheck,
  ArrowRightLeft,
  Filter,
  ArrowUpDown,
  EllipsisVertical,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
} from 'date-fns';

const AUTO_REFRESH_MS = 30_000;

export default function DashboardPage() {
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useViewPreference<string>({
    page: 'dashboard',
    key: 'status_filter',
    defaultValue: 'all',
  });
  const router = useRouter();

  // ── Live queries with 30-second auto-refresh ────────────────────────────
  const { data: liveStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/api/dashboard/stats'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { data: liveClients = [], isLoading: liveLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { data: liveTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { data: liveStandup } = useQuery({
    queryKey: ['standup'],
    queryFn: () => apiFetch('/api/standup'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const stats = liveStats;
  const allClients: any[] = liveClients;
  const allTasks: any[] = liveTasks;
  const isLoading = liveLoading;

  const filtered = allClients.filter((c: any) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return c.computedStatus === 'overdue';
    if (filter === 'due_today') return c.computedStatus === 'due_today';
    if (filter === 'on_track') return c.computedStatus === 'on_track' || c.computedStatus === 'blocked';
    return true;
  });

  const statCards = [
    {
      label: 'Active Clients', value: stats?.total ?? '—', accent: 'var(--olive)',
      trend: `${allClients.length} in pipeline`, trendType: 'up' as const,
      icon: UserPlus,
      sparklineData: deriveSparkline('active', allTasks),
    },
    {
      label: 'On Track', value: stats?.onTrack ?? '—', accent: 'var(--green)',
      trend: stats?.total ? `${Math.round((stats.onTrack / stats.total) * 100)}% of total` : '—',
      trendType: 'up' as const,
      icon: CircleCheck,
      sparklineData: deriveSparkline('on_track', allTasks),
    },
    {
      label: 'Due Today', value: stats?.dueToday ?? '—', accent: 'var(--amber)',
      trend: 'Needs check-in', trendType: 'warn' as const,
      icon: Clock,
      sparklineData: deriveSparkline('due_today', allTasks),
    },
    {
      label: 'Overdue', value: stats?.overdue ?? '—', accent: 'var(--red)',
      trend: 'See standup brief', trendType: 'down' as const,
      icon: TriangleAlert,
      sparklineData: deriveSparkline('overdue', allTasks),
    },
  ];

  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track: { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: 'Overdue' },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };

  const chips = [
    { key: 'all',      label: 'All',      count: stats?.total ?? allClients.length },
    { key: 'overdue',  label: 'Overdue',  count: stats?.overdue ?? 0 },
    { key: 'due_today',label: 'Due Today',count: stats?.dueToday ?? 0 },
    { key: 'on_track', label: 'On Track', count: stats?.onTrack ?? 0 },
  ];

  // ── "9 things need your attention" — top 9 standup alerts ──────────────
  const attentionItems = useMemo(() => {
    const items = (liveStandup?.items || []) as any[];
    if (items.length === 0) return [];
    const priority: Record<string, number> = { overdue: 0, blocked: 1, due_today: 2 };
    return [...items]
      .sort((a, b) => {
        const pa = priority[a.alertType] ?? 9;
        const pb = priority[b.alertType] ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.daysLate || 0) - (a.daysLate || 0);
      })
      .slice(0, 9)
      .map((it) => ({
        alertType: it.alertType as string,
        clientName: it.client?.brandName || it.client?.fullName || '—',
        clientId: it.client?.id,
        stepNumber: it.step?.stepNumber,
        stepName: it.step?.name,
        owningTeamName: it.step?.owningTeamName,
        title: it.task?.title || '—',
        assignee: it.task?.assignedTo?.fullName,
        assigneeTeam: it.task?.assignedTo?.teamName,
        dueDate: it.task?.dueDate,
        daysLate: it.daysLate || 0,
        blockerNote: it.task?.blockerNote,
      }));
  }, [liveStandup]);

  // ── "Week at a glance" — derived from live data ────────────────────────
  const weekGlance = useMemo(() => {
    const now = new Date();
    const wkStart = startOfWeek(now, { weekStartsOn: 1 });
    const wkEnd = endOfWeek(now, { weekStartsOn: 1 });
    const today = startOfDay(now);

    const joinedThisWeek = allClients.filter((c: any) => {
      const d = new Date(c.dateJoined);
      return d >= wkStart && d <= wkEnd;
    }).length;

    const completedThisWeek = allTasks.filter((t: any) => {
      if (t.status !== 'complete' || !t.completedAt) return false;
      const d = new Date(t.completedAt);
      return d >= wkStart && d <= wkEnd;
    }).length;

    const upcoming7d = allTasks.filter((t: any) => {
      if (t.status === 'complete' || t.status === 'cancelled') return false;
      const d = startOfDay(new Date(t.dueDate));
      return d >= today && differenceInCalendarDays(d, today) <= 7;
    }).length;

    const stepMoves = allClients.filter((c: any) => {
      const d = new Date(c.stepEnteredAt);
      const sevenAgo = addDays(today, -7);
      return d >= sevenAgo && d <= now;
    }).length;

    const byStep: Record<number, { name: string; count: number; overdue: number }> = {};
    for (const c of allClients) {
      const n = c.currentStep?.stepNumber;
      if (!n) continue;
      if (!byStep[n]) byStep[n] = { name: c.currentStep.name, count: 0, overdue: 0 };
      byStep[n].count += 1;
      if (c.computedStatus === 'overdue') byStep[n].overdue += 1;
    }
    const stepRows = Object.entries(byStep)
      .map(([k, v]) => ({ stepNumber: Number(k), ...v }))
      .sort((a, b) => a.stepNumber - b.stepNumber);

    return { weekStart: wkStart, weekEnd: wkEnd, joinedThisWeek, completedThisWeek, upcoming7d, stepMoves, stepRows };
  }, [allClients, allTasks]);

  return (
    <AppLayout>
      <Topbar title="Pipeline Dashboard" subtitle="All clients · Live status" showAddClient onAddClient={() => setShowModal(true)} />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title="Pipeline Dashboard"
          subtitle="Live view of every coaching client across the 9-step program"
        >
          <button style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={13} /> Export
          </button>
          <button style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} /> Filters
            <ArrowRight size={11} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </DashboardHeader>

        {/* Stats row */}
        <div className="stat-grid">
          {statCards.map((s) => (
            <StatCard
              key={s.label}
              label={s.label}
              value={s.value}
              accent={s.accent}
              trend={s.trend}
              trendType={s.trendType}
              icon={s.icon}
              sparklineData={s.sparklineData}
            />
          ))}
        </div>

        {/* ── Two-up: 9 things + Week at a glance ──────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 24, marginBottom: 28 }}>

          <SectionCard
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                9 things need your attention
                {attentionItems.length > 0 && (
                  <span style={{ background: 'var(--red-bg)', color: 'var(--red)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                    {attentionItems.length}
                  </span>
                )}
              </span>
            }
            subtitle="Overdue · blocked · due today — sorted by urgency"
            action={
              <button onClick={() => router.push('/standup')} style={{ fontSize: 12, fontWeight: 500, color: 'var(--olive)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View standup brief <ArrowRight size={12} />
              </button>
            }
            padding={0}
          >
            {isLoading && attentionItems.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
            ) : attentionItems.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Sparkles size={32} style={{ color: 'var(--olive)', margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--ink)', marginBottom: 4 }}>All clear</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No overdue, blocked, or due-today tasks across the pipeline.</div>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 520, overflowY: 'auto' }}>
                {attentionItems.map((it, idx) => {
                  const isOverdue = it.alertType === 'overdue';
                  const isBlocked = it.alertType === 'blocked';
                  const stripe = isOverdue ? 'var(--red)' : isBlocked ? '#6B3FA0' : 'var(--amber)';
                  const tag = isOverdue ? `+${it.daysLate}d` : isBlocked ? 'BLOCKED' : 'TODAY';
                  const tagBg = isOverdue ? 'var(--red-bg)' : isBlocked ? '#F0E8FA' : 'var(--amber-bg)';
                  const tagColor = isOverdue ? 'var(--red)' : isBlocked ? '#6B3FA0' : 'var(--amber)';
                  const AlertIcon = isOverdue ? TriangleAlert : isBlocked ? Ban : Clock;
                  return (
                    <li key={`${it.clientId}-${idx}`}
                      onClick={() => it.clientId && router.push(`/clients/${it.clientId}`)}
                      style={{ position: 'relative', display: 'grid', gridTemplateColumns: '3px 1fr auto auto', gap: 14, padding: '12px 20px', borderBottom: idx === attentionItems.length - 1 ? 'none' : '1px solid var(--surface-2)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--olive-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ background: stripe, borderRadius: 3 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                          <AlertIcon size={11} style={{ color: tagColor }} />
                          <span style={{ color: tagColor }}>{isOverdue ? 'OVERDUE' : isBlocked ? 'BLOCKER RAISED' : 'DUE TODAY'}</span>
                          <span>·</span>
                          <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{it.clientName}</span>
                          {it.stepNumber && (
                            <>
                              <span>·</span>
                              <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Step {String(it.stepNumber).padStart(2, '0')} — {it.stepName}</span>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 2 }}>
                          {it.assignee ? `Assigned to ${it.assignee}${it.assigneeTeam ? ` (${it.assigneeTeam})` : ''}` : 'Unassigned'}
                          {isBlocked && it.blockerNote ? ` · "${it.blockerNote.slice(0, 60)}${it.blockerNote.length > 60 ? '…' : ''}"` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: tagBg, color: tagColor }}>{tag}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', color: 'var(--olive)', opacity: 0, transition: 'opacity 0.15s' }} className="attention-arrow">
                        <ArrowRight size={13} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Our week at a glance"
            subtitle={`${format(weekGlance.weekStart, 'd MMM')} – ${format(weekGlance.weekEnd, 'd MMM')}`}
            padding="14px 20px"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              <KpiTile label="Joined this week" value={weekGlance.joinedThisWeek} accent="var(--olive)" hint="new clients" icon={UserPlus} />
              <KpiTile label="Tasks completed" value={weekGlance.completedThisWeek} accent="var(--green)" hint="this week" icon={CircleCheck} />
              <KpiTile label="Step advances" value={weekGlance.stepMoves} accent="var(--blue)" hint="last 7 days" icon={ArrowRightLeft} />
              <KpiTile label="Due in next 7d" value={weekGlance.upcoming7d} accent="var(--amber)" hint="upcoming" icon={Clock} />
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Pipeline distribution</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {weekGlance.stepRows.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '12px 0' }}>No active clients in any step yet.</div>
              ) : weekGlance.stepRows.map((s) => {
                const max = Math.max(1, ...weekGlance.stepRows.map((r) => r.count));
                const pct = (s.count / max) * 100;
                return (
                  <div key={s.stepNumber} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 36px', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--olive-dark)', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 4, padding: '2px 0', textAlign: 'center' }}>
                      {String(s.stepNumber).padStart(2, '0')}
                    </span>
                    <div style={{ position: 'relative', height: 18, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: s.overdue > 0 ? 'linear-gradient(90deg, var(--olive-light), var(--olive))' : 'var(--olive)', borderRadius: 4 }} />
                      <div style={{ position: 'relative', padding: '0 8px', fontSize: 11.5, color: 'var(--ink)', lineHeight: '18px', fontWeight: 500 }}>
                        {s.name}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 15, fontStyle: 'italic', textAlign: 'right', color: s.overdue > 0 ? 'var(--red)' : 'var(--ink)' }}>
                      {s.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        {/* Clients table */}
        <SectionCard
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              All Clients
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpDown size={11} /> Sorted by status
              </span>
            </span>
          }
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              {chips.map((chip) => (
                <button key={chip.key} onClick={() => setFilter(chip.key)}
                  style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer', transition: 'background 0.12s, color 0.12s, border-color 0.12s', borderColor: filter === chip.key ? 'var(--olive)' : 'var(--border)', background: filter === chip.key ? 'var(--olive)' : 'var(--surface)', color: filter === chip.key ? '#fff' : 'var(--ink-2)' }}>
                  {chip.label}
                  <span style={{ background: filter === chip.key ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)', padding: '1px 6px', borderRadius: 10, fontSize: 10.5, marginLeft: 4 }}>{chip.count}</span>
                </button>
              ))}
            </div>
          }
          padding={0}
        >
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
                {isLoading ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Loading clients...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No clients found</td></tr>
                ) : filtered.map((client: any) => {
                  const sc = statusConfig[client.computedStatus] || statusConfig.on_track;
                  const initials = (client.brandName || client.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2);
                  const stepNum = client.currentStep?.stepNumber;
                  const stepNumPad = String(stepNum || 0).padStart(2, '0');
                  const daysInStep = client.daysInStep ?? 0;
                  const slaDays = client.currentStep?.slaDays ?? 0;
                  const isLate = client.computedStatus === 'overdue';
                  const isBlocked = client.computedStatus === 'blocked';
                  const dayLabel = isLate ? `D+${daysInStep} · ${daysInStep - slaDays} day${daysInStep - slaDays > 1 ? 's' : ''} late` : isBlocked ? `D+${daysInStep} · waiting on client` : `D+${daysInStep} of ${slaDays}`;

                  return (
                    <tr key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      style={{ position: 'relative', cursor: 'pointer', transition: 'background 0.1s', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--olive-50)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ position: 'relative', padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--olive)', transform: 'scaleY(0)', transformOrigin: 'top', transition: 'transform 0.1s' }} className="row-stripe" />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, color: 'var(--olive)', flexShrink: 0 }}>{initials}</div>
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.2px', background: sc.bg, color: sc.color }}>
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
                        <button onClick={e => e.stopPropagation()} style={{ color: 'var(--soft)', padding: '4px 8px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} aria-label="Row actions">
                          <EllipsisVertical size={16} />
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

      <AddClientModal open={showModal} onClose={() => setShowModal(false)} onSuccess={() => {}} />
      <style>{`
        ul > li:hover .attention-arrow { opacity: 1 !important; }
        tr:hover .row-stripe { transform: scaleY(1) !important; }
      `}</style>
    </AppLayout>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────

function KpiTile({ label, value, accent, hint, icon: Icon }: { label: string; value: number | string; accent: string; hint?: string; icon?: any }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
        {Icon && <Icon size={11} style={{ color: accent }} />}
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 26, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.3px' }}>{value}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
      </div>
    </div>
  );
}