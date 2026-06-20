'use client';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Users, CircleCheck, TriangleAlert, Clock, TrendingUp, Activity, ArrowRight, BarChart3, Search } from 'lucide-react';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { deriveSparkline } from '@/lib/sparkline';

interface AdminData {
  orgStats: {
    totalClients: number; activeClients: number; completedClients: number;
    totalTasks: number; activeTasks: number; overdueTasks: number;
    blockedTasks: number; extensionTasks: number;
    completedLast7d: number; onTimePct: number;
  };
  teams: Array<{ teamName: string; memberCount: number; leadCount: number; activeTasks: number; overdue: number; blocked: number; completedLast7d: number; }>;
  members: Array<{ userId: string; name: string; team: string; role: string; active: number; overdue: number; blocked: number; completedLast7d: number; }>;
  stepRollup: Array<{ stepId: string; stepNumber: number; name: string; owningTeamName: string; activeTasks: number; overdue: number; blocked: number; completedLast7d: number; }>;
  recentCompletions: Array<{ id: string; title: string; completedAt: string; assignee: string; team: string; client: string; step: string; }>;
}

const MOCK_DATA: AdminData = {
  orgStats: {
    totalClients: 24, activeClients: 18, completedClients: 4,
    totalTasks: 312, activeTasks: 87, overdueTasks: 9,
    blockedTasks: 3, extensionTasks: 2,
    completedLast7d: 41, onTimePct: 78,
  },
  teams: [
    { teamName: 'Intake Team', memberCount: 2, leadCount: 1, activeTasks: 12, overdue: 1, blocked: 0, completedLast7d: 6 },
    { teamName: 'Sales Team', memberCount: 2, leadCount: 1, activeTasks: 9, overdue: 2, blocked: 1, completedLast7d: 4 },
    { teamName: 'Design Team', memberCount: 2, leadCount: 1, activeTasks: 14, overdue: 1, blocked: 0, completedLast7d: 7 },
    { teamName: 'Tech Team', memberCount: 2, leadCount: 1, activeTasks: 11, overdue: 2, blocked: 1, completedLast7d: 5 },
    { teamName: 'Creative Team', memberCount: 2, leadCount: 1, activeTasks: 8, overdue: 0, blocked: 0, completedLast7d: 3 },
    { teamName: 'Media Buyer', memberCount: 2, leadCount: 1, activeTasks: 10, overdue: 1, blocked: 0, completedLast7d: 5 },
    { teamName: 'Automation Team', memberCount: 2, leadCount: 1, activeTasks: 6, overdue: 0, blocked: 0, completedLast7d: 4 },
    { teamName: 'Event Team', memberCount: 2, leadCount: 1, activeTasks: 7, overdue: 1, blocked: 0, completedLast7d: 3 },
    { teamName: 'Account Manager', memberCount: 1, leadCount: 0, activeTasks: 5, overdue: 1, blocked: 1, completedLast7d: 2 },
  ],
  members: [
    { userId: 'm1', name: 'Rajan Mehta', team: 'Tech Team', role: 'team_member', active: 8, overdue: 1, blocked: 1, completedLast7d: 5 },
    { userId: 'm2', name: 'Vikram Joshi', team: 'Tech Team', role: 'team_leader', active: 3, overdue: 1, blocked: 0, completedLast7d: 2 },
    { userId: 'm3', name: 'Neha Singh', team: 'Design Team', role: 'team_member', active: 9, overdue: 1, blocked: 0, completedLast7d: 4 },
    { userId: 'm4', name: 'Divya Menon', team: 'Intake Team', role: 'team_member', active: 7, overdue: 0, blocked: 0, completedLast7d: 4 },
    { userId: 'm5', name: 'Pooja Saxena', team: 'Intake Team', role: 'team_leader', active: 5, overdue: 1, blocked: 0, completedLast7d: 2 },
    { userId: 'm6', name: 'Sneha Pillai', team: 'Sales Team', role: 'team_member', active: 6, overdue: 2, blocked: 1, completedLast7d: 3 },
    { userId: 'm7', name: 'Rohan Verma', team: 'Sales Team', role: 'team_leader', active: 3, overdue: 0, blocked: 0, completedLast7d: 1 },
  ],
  stepRollup: [
    { stepId: 's1', stepNumber: 1, name: 'Onboarding Intake', owningTeamName: 'Intake Team', activeTasks: 12, overdue: 1, blocked: 0, completedLast7d: 6 },
    { stepId: 's2', stepNumber: 2, name: 'Brand & Content Setup', owningTeamName: 'Content Team', activeTasks: 14, overdue: 1, blocked: 0, completedLast7d: 7 },
    { stepId: 's3', stepNumber: 3, name: 'Content Production', owningTeamName: 'Content Team', activeTasks: 11, overdue: 2, blocked: 1, completedLast7d: 5 },
    { stepId: 's4', stepNumber: 4, name: 'Launch & Schedule', owningTeamName: 'Media Buyer', activeTasks: 10, overdue: 1, blocked: 0, completedLast7d: 5 },
    { stepId: 's5', stepNumber: 5, name: 'Handover & Retainer', owningTeamName: 'Account Manager', activeTasks: 5, overdue: 1, blocked: 1, completedLast7d: 2 },
  ],
  recentCompletions: [
    { id: 'r1', title: 'Design 12 graphics', completedAt: new Date().toISOString(), assignee: 'Neha Singh', team: 'Design Team', client: 'Nimbus Coffee', step: 'Content Production' },
    { id: 'r2', title: 'Schedule kickoff call', completedAt: new Date(Date.now() - 3600000).toISOString(), assignee: 'Divya Menon', team: 'Intake Team', client: 'Glow Skin Co.', step: 'Onboarding Intake' },
    { id: 'r3', title: 'Configure email sequences', completedAt: new Date(Date.now() - 7200000).toISOString(), assignee: 'Amit Sharma', team: 'Automation Team', client: 'Mindful with Meera', step: 'Automation Setup' },
  ],
};

export default function AdminDashboard() {
  const router = useRouter();
  const user = getUser();
  const [memberSearch, setMemberSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');

  // Client-side guard: non-admins redirected to /dashboard
  useEffect(() => {
    if (!USE_MOCK && user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const { data: liveData } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/api/dashboard/admin'),
    enabled: !USE_MOCK && user?.role === 'admin',
    retry: false,
  });

  const data: AdminData = USE_MOCK ? MOCK_DATA : (liveData || MOCK_DATA);

  const filteredMembers = useMemo(() => {
    let ms = data.members;
    if (teamFilter) ms = ms.filter((m) => m.team === teamFilter);
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      ms = ms.filter((m) => m.name.toLowerCase().includes(q) || m.team.toLowerCase().includes(q));
    }
    return ms;
  }, [data.members, memberSearch, teamFilter]);

  return (
    <AppLayout>
      <Topbar title="Admin Dashboard" subtitle="Org-wide view · Tasks, teams, performance" />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title="Operations Overview"
          subtitle="Live snapshot of every team, member, and task across the org"
        />

        {/* Stat cards — top row */}
        <div className="stat-grid">
          <StatCard
            label="Active Clients"
            value={data.orgStats.activeClients}
            accent="var(--olive)"
            trend={`${data.orgStats.completedClients} completed`}
            trendType="up"
            icon={Users}
          />
          <StatCard
            label="Active Tasks"
            value={data.orgStats.activeTasks}
            accent="var(--ink)"
            trend={`${data.orgStats.totalTasks} total`}
            trendType="neutral"
            icon={Activity}
          />
          <StatCard
            label="Overdue"
            value={data.orgStats.overdueTasks}
            accent={data.orgStats.overdueTasks > 0 ? 'var(--red)' : 'var(--muted)'}
            trend={`${data.orgStats.blockedTasks} blocked · ${data.orgStats.extensionTasks} ext.`}
            trendType="down"
            icon={TriangleAlert}
          />
          <StatCard
            label="On-time (7d)"
            value={`${data.orgStats.onTimePct}%`}
            accent="var(--green)"
            trend={`${data.orgStats.completedLast7d} completed this week`}
            trendType="up"
            icon={TrendingUp}
            sparklineData={deriveSparkline('admin_on_time', data.recentCompletions.map((r) => ({ completedAt: r.completedAt, status: 'complete' })), 7)}
          />
        </div>

        {/* Two-column: All tasks panel + Recent activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 22, alignItems: 'start' }}>
          <SectionCard
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={15} style={{ color: 'var(--olive)' }} /> All Tasks by Team
              </span>
            }
            action={
              <button onClick={() => router.push('/tasks')} style={{ fontSize: 11.5, color: 'var(--olive)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Open tasks <ArrowRight size={12} />
              </button>
            }
            padding={0}
          >
            <div style={{ padding: '8px 0' }}>
              {data.teams.map((t) => {
                const max = Math.max(...data.teams.map((x) => x.activeTasks), 1);
                const pct = (t.activeTasks / max) * 100;
                const hasIssue = t.overdue > 0 || t.blocked > 0;
                return (
                  <div key={t.teamName} onClick={() => router.push(`/tasks?team=${encodeURIComponent(t.teamName)}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{t.teamName}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {t.memberCount} members · {t.leadCount} lead{t.leadCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: hasIssue ? 'var(--amber)' : 'var(--olive)', borderRadius: 3 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 11.5, minWidth: 220, justifyContent: 'flex-end' }}>
                      <span><span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 17, fontStyle: 'italic', color: 'var(--ink)' }}>{t.activeTasks}</span> <span style={{ color: 'var(--muted)' }}>active</span></span>
                      {t.overdue > 0 && <span style={{ color: 'var(--red)' }}><span style={{ fontWeight: 700 }}>{t.overdue}</span> late</span>}
                      {t.blocked > 0 && <span style={{ color: '#6B3FA0' }}><span style={{ fontWeight: 700 }}>{t.blocked}</span> blocked</span>}
                      <span style={{ color: 'var(--green)' }}><span style={{ fontWeight: 700 }}>{t.completedLast7d}</span> done</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Recent activity */}
          <SectionCard
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <CircleCheck size={15} style={{ color: 'var(--green)' }} /> Recent Activity
              </span>
            }
            padding={0}
          >
            <div style={{ padding: '8px 0' }}>
              {data.recentCompletions.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No completions yet.</div>
              ) : data.recentCompletions.map((r) => (
                <div key={r.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--surface-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
                    <CircleCheck size={13} style={{ color: 'var(--green)', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{r.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        {r.assignee} · {r.team} · {r.client}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--soft)', whiteSpace: 'nowrap' }}>
                      {r.completedAt ? new Date(r.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Per-step rollup */}
        <SectionCard
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} style={{ color: 'var(--olive)' }} /> Pipeline by Step
            </span>
          }
          padding={0}
          style={{ marginBottom: 22 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Step', 'Owning Team', 'Active', 'Overdue', 'Blocked', 'Completed (7d)'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stepRollup.map((s) => (
                  <tr key={s.stepId} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '10px 18px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: 'var(--olive)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{String(s.stepNumber).padStart(2, '0')}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{s.name}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--ink-2)' }}>{s.owningTeamName}</td>
                    <td style={{ padding: '10px 18px', fontSize: 13, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }}>{s.activeTasks}</td>
                    <td style={{ padding: '10px 18px', fontSize: 13, color: s.overdue > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: s.overdue > 0 ? 600 : 400 }}>{s.overdue}</td>
                    <td style={{ padding: '10px 18px', fontSize: 13, color: s.blocked > 0 ? '#6B3FA0' : 'var(--muted)', fontWeight: s.blocked > 0 ? 600 : 400 }}>{s.blocked}</td>
                    <td style={{ padding: '10px 18px', fontSize: 13, color: 'var(--green)' }}>{s.completedLast7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Member load */}
        <SectionCard
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} style={{ color: 'var(--olive)' }} /> Team Performance · Member Load
            </span>
          }
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--surface)', color: 'var(--ink)' }}>
                <option value="">All teams</option>
                {data.teams.map((t) => <option key={t.teamName} value={t.teamName}>{t.teamName}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search member…"
                  style={{ padding: '6px 10px 6px 28px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
              </div>
            </div>
          }
          padding={0}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Member', 'Team', 'Role', 'Active', 'Overdue', 'Blocked', 'Done (7d)'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No matching members.</td></tr>
                ) : filteredMembers.map((m) => {
                  const max = Math.max(...data.members.map((x) => x.active), 1);
                  const pct = (m.active / max) * 100;
                  return (
                    <tr key={m.userId} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '10px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: m.role === 'team_leader' ? 'linear-gradient(135deg, #2860A1, #5B9BD5)' : 'linear-gradient(135deg, var(--olive), var(--olive-light))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>
                            {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 18px', fontSize: 12.5, color: 'var(--ink-2)' }}>{m.team}</td>
                      <td style={{ padding: '10px 18px' }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          color: m.role === 'team_leader' ? '#2860A1' : 'var(--muted)',
                          background: m.role === 'team_leader' ? '#EBF3FB' : 'transparent',
                        }}>
                          {m.role === 'team_leader' ? 'Lead' : m.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 18px', minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 24, fontFamily: 'JetBrains Mono, monospace' }}>{m.active}</span>
                          <div style={{ flex: 1, height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--amber)' : 'var(--olive)', borderRadius: 3 }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 18px', fontSize: 13, color: m.overdue > 0 ? 'var(--red)' : 'var(--muted)', fontWeight: m.overdue > 0 ? 600 : 400 }}>{m.overdue}</td>
                      <td style={{ padding: '10px 18px', fontSize: 13, color: m.blocked > 0 ? '#6B3FA0' : 'var(--muted)', fontWeight: m.blocked > 0 ? 600 : 400 }}>{m.blocked}</td>
                      <td style={{ padding: '10px 18px', fontSize: 13, color: 'var(--green)' }}>{m.completedLast7d}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
