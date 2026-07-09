'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Users, UserPlus, CircleCheck, TriangleAlert, Clock, TrendingUp, Activity, ArrowRight, BarChart3, Search, Bell, Check, X, Download, Play } from 'lucide-react';
import { format } from 'date-fns';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { deriveSparkline } from '@/lib/sparkline';
import { SVGLineChart, SVGFunnelChart } from '@/components/ui/Charts';

interface AdminData {
  orgStats: {
    totalClients: number; activeClients: number; completedClients: number;
    avgCompletionTimeDays?: number;
    totalTasks: number; activeTasks: number; overdueTasks: number;
    blockedTasks: number; extensionTasks: number; inProgressTasks?: number;
    completedLast7d: number; onTimePct: number;
  };
  teams: Array<{ teamName: string; memberCount: number; leadCount: number; activeTasks: number; overdue: number; blocked: number; completedLast7d: number; }>;
  members: Array<{ userId: string; name: string; team: string; role: string; active: number; overdue: number; blocked: number; completedLast7d: number; }>;
  stepRollup: Array<{ stepId: string; stepNumber: number; name: string; owningTeamName: string; activeTasks: number; overdue: number; blocked: number; completedLast7d: number; averageDurationDays?: number; }>;
  recentCompletions: Array<{ id: string; title: string; completedAt: string; assignee: string; team: string; client: string; step: string; }>;
  pendingExtensions?: Array<{ id: string; title: string; dueDate: string; extensionRequestedDate: string; extensionReason: string; assignee: string; team: string; client: string; step: string; }>;
}

const EMPTY_DATA: AdminData = {
  orgStats: {
    totalClients: 0, activeClients: 0, completedClients: 0,
    avgCompletionTimeDays: 0,
    totalTasks: 0, activeTasks: 0, overdueTasks: 0,
    blockedTasks: 0, extensionTasks: 0, inProgressTasks: 0,
    completedLast7d: 0, onTimePct: 0,
  },
  teams: [],
  members: [],
  stepRollup: [],
  recentCompletions: [],
  pendingExtensions: [],
};

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const qc = useQueryClient();
  const [memberSearch, setMemberSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');

  // Export Modal States
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('client_full');
  const [exportFormat, setExportFormat] = useState('csv');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');
  const [expStepId, setExpStepId] = useState('');
  const [expStatus, setExpStatus] = useState('');
  const [expTeam, setExpTeam] = useState('');
  const [expAssignedToId, setExpAssignedToId] = useState('');
  const [expClientId, setExpClientId] = useState('');
  const [expPriority, setExpPriority] = useState('');
  const [expCompleted, setExpCompleted] = useState('all');
  const [expIncludeArchived, setExpIncludeArchived] = useState(false);

  // Queries for export dropdowns
  const { data: stepsList = [] } = useQuery({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    retry: false,
  });

  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    retry: false,
  });

  const { data: usersList = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    retry: false,
  });

  const { data: clientsList = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    retry: false,
  });

  const { data: liveData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/api/dashboard/admin'),
    enabled: user?.role === 'admin',
    retry: false,
  });

  const approveExtensionMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      apiFetch(`/api/tasks/${id}/approve-extension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
  });

  const data: AdminData = liveData || EMPTY_DATA;

  const filteredMembers = useMemo(() => {
    let ms = data.members;
    if (teamFilter) ms = ms.filter((m) => m.team === teamFilter);
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      ms = ms.filter((m) => m.name.toLowerCase().includes(q) || m.team.toLowerCase().includes(q));
    }
    return ms;
  }, [data.members, memberSearch, teamFilter]);

  // Operations Overview tabbed details state and infinite scroll limits
  const [opTab, setOpTab] = useState<'Pending Requests' | 'Recent Activity' | 'Notifications'>('Notifications');
  const [workloadSearch, setWorkloadSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');

  const [workloadLimit, setWorkloadLimit] = useState(15);
  const [pendingLimit, setPendingLimit] = useState(15);
  const [activityLimit, setActivityLimit] = useState(15);
  const [notificationsLimit, setNotificationsLimit] = useState(15);
  const [membersLimit, setMembersLimit] = useState(15);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    data.members.forEach((m) => {
      if (m.team) set.add(m.team);
    });
    return Array.from(set).sort();
  }, [data.members]);

  // Fetch notifications
  const { data: liveNotifs, isLoading: isNotifsLoading } = useQuery<any[]>({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    enabled: !!user,
    retry: false,
  });

  const notifications = liveNotifs || [];

  // Workload computations
  const filteredWorkload = useMemo(() => {
    let list = data.teams.filter((t) => {
      const name = t.teamName.toLowerCase().trim();
      return name !== 'admin' && name !== 'administrators' && name !== '(unassigned)';
    });
    if (workloadSearch.trim()) {
      const q = workloadSearch.toLowerCase();
      list = list.filter((t) => t.teamName.toLowerCase().includes(q));
    }
    return list;
  }, [data.teams, workloadSearch]);

  const scrollableWorkload = useMemo(() => {
    return filteredWorkload.slice(0, workloadLimit);
  }, [filteredWorkload, workloadLimit]);

  // Recent Activity computations
  const filteredActivity = useMemo(() => {
    let list = data.recentCompletions;
    if (activitySearch.trim()) {
      const q = activitySearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.assignee.toLowerCase().includes(q) ||
          c.client.toLowerCase().includes(q) ||
          (c.team && c.team.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data.recentCompletions, activitySearch]);

  const scrollableActivity = useMemo(() => {
    return filteredActivity.slice(0, activityLimit);
  }, [filteredActivity, activityLimit]);

  // Notifications computations
  const scrollableNotifications = useMemo(() => {
    return notifications.slice(0, notificationsLimit);
  }, [notifications, notificationsLimit]);

  // Pending Requests computations
  const pendingExtensionsList = data.pendingExtensions || [];
  const scrollableExtensions = useMemo(() => {
    return pendingExtensionsList.slice(0, pendingLimit);
  }, [pendingExtensionsList, pendingLimit]);

  // Team Members infinite scroll computation
  const scrollableMembers = useMemo(() => {
    return filteredMembers.slice(0, membersLimit);
  }, [filteredMembers, membersLimit]);

  // Infinite Scroll Event Handlers
  const handleOpScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      if (opTab === 'Pending Requests') {
        setPendingLimit(prev => Math.min(prev + 10, pendingExtensionsList.length));
      } else if (opTab === 'Recent Activity') {
        setActivityLimit(prev => Math.min(prev + 10, filteredActivity.length));
      } else if (opTab === 'Notifications') {
        setNotificationsLimit(prev => Math.min(prev + 10, notifications.length));
      }
    }
  };

  const handleMembersScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setMembersLimit(prev => Math.min(prev + 10, filteredMembers.length));
    }
  };

  if (!user || isNotifsLoading || (user.role === 'admin' && isDashboardLoading)) {
    return (
      <AppLayout>
        <Topbar
          title="Notifications & Activity"
          subtitle="Manage alerts, pending requests, and recent team activity"
        />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 120px)',
          gap: 12,
          color: 'var(--muted)',
        }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--olive)',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Loading notifications...</span>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Topbar
        title="Notifications & Activity"
        subtitle="Manage alerts, pending requests, and recent team activity"
      />
      <div style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DashboardHeader title="" subtitle="">
          {user.role === 'admin' && (
            <button
              onClick={() => {
                setExportType('client_full');
                setShowExportModal(true);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
            >
              <Download size={14} /> Export Reports
            </button>
          )}
        </DashboardHeader>
        {/* ── Main Dashboard Body ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          
          <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 550 }}>
            <SectionCard
              title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Bell size={15} style={{ color: 'var(--olive)' }} /> Notifications Dashboard</span>}
              subtitle="Alerts, requests, and activity feed"
              padding="0"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
            >
              {/* Tab selector */}
              <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--surface-2)', overflowX: 'auto' }}>
                {['Notifications', 'Pending Requests', 'Recent Activity']
                  .filter((t) => user.role === 'admin' || t === 'Notifications')
                  .map((t) => {
                    const isActive = opTab === t;
                    return (
                      <button
                        key={t}
                        onClick={() => { setOpTab(t as any); }}
                        style={{
                          padding: '12px 4px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: isActive ? 'var(--olive)' : 'var(--muted)',
                          borderBottom: `2px solid ${isActive ? 'var(--olive)' : 'transparent'}`,
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          transition: 'all 0.15s',
                          marginBottom: -1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
              </div>

              {/* Tab Contents */}
              <div
                onScroll={handleOpScroll}
                style={{
                  padding: '12px 16px',
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  margin: '16px 20px 20px',
                  background: 'var(--surface-2)',
                }}
              >
                {/* 1. WORKLOAD TAB (REMOVED) */}

                {/* 2. PENDING REQUESTS TAB */}
                {opTab === 'Pending Requests' && (
                  <div>
                    {/* Heading */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                      Pending Task Extension Requests ({pendingExtensionsList.length})
                    </div>

                    {/* List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {scrollableExtensions.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No pending extension requests.</div>
                      ) : (
                        scrollableExtensions.map((ext) => (
                          <div key={ext.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{ext.title}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
                                  Client: <strong style={{ color: 'var(--ink-2)' }}>{ext.client}</strong> · Step: {ext.step}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                                {ext.team}
                              </span>
                            </div>

                            {/* Date details */}
                            <div style={{ display: 'flex', gap: 12, background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                              <div>
                                <span style={{ color: 'var(--muted)' }}>Current Due:</span>{' '}
                                <strong style={{ color: 'var(--ink-2)' }}>{format(new Date(ext.dueDate), 'd MMM yyyy')}</strong>
                              </div>
                              <div style={{ borderLeft: '1px solid var(--border)' }} />
                              <div>
                                <span style={{ color: 'var(--muted)' }}>Requested Due:</span>{' '}
                                <strong style={{ color: 'var(--blue)' }}>{format(new Date(ext.extensionRequestedDate), 'd MMM yyyy')}</strong>
                              </div>
                            </div>

                            {/* Reason */}
                            {ext.extensionReason && (
                              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontStyle: 'italic', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid var(--red)' }}>
                                &ldquo;{ext.extensionReason}&rdquo;
                              </div>
                            )}

                            {/* Bottom line: Assignee + Actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                Requested by: <strong style={{ color: 'var(--ink-2)' }}>{ext.assignee}</strong>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => approveExtensionMut.mutate({ id: ext.id, approved: false })}
                                  disabled={approveExtensionMut.isPending}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                    background: '#FBEEF1', border: '1px solid #F3D0D7',
                                    color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#F9DFE2'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = '#FBEEF1'; }}
                                >
                                  <X size={12} /> Reject
                                </button>
                                <button
                                  onClick={() => approveExtensionMut.mutate({ id: ext.id, approved: true })}
                                  disabled={approveExtensionMut.isPending}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--green-bg)', border: '1px solid #CDEBD9',
                                    color: 'var(--green)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#D7F1E1'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-bg)'; }}
                                >
                                  <Check size={12} /> Approve
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 3. RECENT ACTIVITY TAB */}
                {opTab === 'Recent Activity' && (
                  <div>
                    {/* Filter / Search */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                        <input
                          value={activitySearch}
                          onChange={(e) => { setActivitySearch(e.target.value); setActivityLimit(15); }}
                          placeholder="Search completions..."
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12.5,
                            background: 'var(--surface)',
                            color: 'var(--ink)',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Activity Feed */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {scrollableActivity.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No recent activities found.</div>
                      ) : (
                        scrollableActivity.map((c) => (
                          <div key={c.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 16, marginTop: 16 }}>✅</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                                {c.assignee} completed <strong style={{ color: 'var(--ink-2)' }}>{c.title}</strong>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
                                {c.client} · {c.step}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                              {c.completedAt ? format(new Date(c.completedAt), 'd MMM, HH:mm') : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 4. NOTIFICATIONS TAB */}
                {opTab === 'Notifications' && (
                  <div>
                    {/* Alert Heading */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                      Latest alerts for your account
                    </div>

                    {/* Notifications list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {scrollableNotifications.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No alerts right now.</div>
                      ) : (
                        scrollableNotifications.map((n) => (
                          <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 12, alignItems: 'start', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: n.isRead ? 'var(--surface)' : 'var(--olive-50)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: n.isRead ? 'var(--border-strong)' : 'var(--olive)', marginTop: 5 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{n.title || n.message}</div>
                              {n.body && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 16 }}>{n.body}</div>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                              {n.createdAt ? format(new Date(n.createdAt), 'd MMM, HH:mm') : ''}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>


        </div>
        {/* ── EXPORT MODAL ── */}
        {showExportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
              
              {/* Modal header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Export Operational Data & Reports</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Filter and download reports in CSV/PDF or generate a full backup.</div>
                </div>
                <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
                
                {/* Select export type */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Select Report Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { type: 'projects', label: 'Projects Portfolio', desc: 'Status, priority, manager, and completion rates' },
                      { type: 'clients', label: 'Clients List', desc: 'Company, contact info, and status details' },
                      { type: 'tasks', label: 'Tasks List', desc: 'Detailed task assignments, due dates, and statuses' },
                      { type: 'users', label: 'Employees Roster', desc: 'Roster, workloads, and department stats' },
                      { type: 'client_full', label: 'Client Full Report', desc: 'Active & task progress summary' },
                      { type: 'team_performance', label: 'Team Performance', desc: 'Workload & on-time stats' }
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => {
                          setExportType(item.type);
                          if (exportFormat === 'json') setExportFormat('csv');
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '12px 14px',
                          borderRadius: 'var(--radius)',
                          border: `1.5px solid ${exportType === item.type ? 'var(--olive)' : 'var(--border)'}`,
                          background: exportType === item.type ? 'var(--olive-50)' : 'var(--surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{item.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Metadata exports */}
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', marginRight: 4 }}>Other Exports:</span>
                    {[
                      { type: 'teams', label: 'Teams List' },
                      { type: 'steps', label: 'Steps List' },
                      { type: 'templates', label: 'Templates' }
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => {
                          setExportType(item.type);
                          if (exportFormat === 'json') setExportFormat('csv');
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${exportType === item.type ? 'var(--olive)' : 'var(--border)'}`,
                          background: exportType === item.type ? 'var(--olive-50)' : 'var(--surface-2)',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          color: 'var(--ink-2)'
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filters Section (conditional on type) */}
                {exportType !== 'backup' && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Filter Options</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Start Date (Due Date/Created At)</label>
                        <input type="date" value={expStartDate} onChange={e => setExpStartDate(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>End Date (Due Date/Created At)</label>
                        <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                      </div>

                      {/* Client Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Client</label>
                        <select value={expClientId} onChange={e => setExpClientId(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Clients</option>
                          {clientsList.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.brandName || c.fullName}</option>
                          ))}
                        </select>
                      </div>

                      {/* Step Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Step</label>
                        <select value={expStepId} onChange={e => setExpStepId(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Steps</option>
                          {stepsList.map((s: any) => (
                            <option key={s.id} value={s.id}>Step {s.stepNumber}: {s.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Team Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Team</label>
                        <select value={expTeam} onChange={e => setExpTeam(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Teams</option>
                          {teamsList.map((t: string) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      {/* Assigned Member Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Assigned Member</label>
                        <select value={expAssignedToId} onChange={e => setExpAssignedToId(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Members</option>
                          {usersList.map((u: any) => (
                            <option key={u.id} value={u.id}>{u.fullName} ({u.teamName || 'No Team'})</option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Task/Client Status</label>
                        <select value={expStatus} onChange={e => setExpStatus(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Statuses</option>
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="complete">Complete</option>
                          <option value="blocked">Blocked</option>
                          <option value="extension_requested">Extension Requested</option>
                          <option value="rejected">Rejected</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>

                      {/* Priority Filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Priority</label>
                        <select value={expPriority} onChange={e => setExpPriority(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="">All Priorities</option>
                          <option value="high">High</option>
                          <option value="normal">Normal</option>
                          <option value="low">Low</option>
                        </select>
                      </div>

                      {/* Completed / Pending filter */}
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Completion State</label>
                        <select value={expCompleted} onChange={e => setExpCompleted(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                          <option value="all">All States</option>
                          <option value="true">Completed Only</option>
                          <option value="false">Pending Only</option>
                        </select>
                      </div>

                      {/* Include Archived checkbox */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                        <input type="checkbox" id="expIncludeArchived" checked={expIncludeArchived} onChange={e => setExpIncludeArchived(e.target.checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--olive)' }} />
                        <label htmlFor="expIncludeArchived" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>Include Archived / Churned Clients</label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, flexShrink: 0, background: 'var(--surface-2)' }}>
                <button onClick={() => setShowExportModal(false)}
                  style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
                  Cancel
                </button>
                <button onClick={() => { setExportFormat('csv'); setTimeout(() => {
                  const params = new URLSearchParams();
                  params.set('format', 'csv');
                  params.set('type', exportType);
                  if (expStartDate) params.set('startDate', expStartDate);
                  if (expEndDate) params.set('endDate', expEndDate);
                  if (expStepId) params.set('stepId', expStepId);
                  if (expStatus) params.set('status', expStatus);
                  if (expTeam) params.set('team', expTeam);
                  if (expAssignedToId) params.set('assignedToId', expAssignedToId);
                  if (expClientId) params.set('clientId', expClientId);
                  if (expPriority) params.set('priority', expPriority);
                  if (expCompleted !== 'all') params.set('completed', expCompleted);
                  if (expIncludeArchived) params.set('includeArchived', 'true');
                  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                  if (token) params.set('token', token);
                  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${exportType}_export_${Date.now()}.csv`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }, 50); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
                  <Download size={14} /> Download CSV
                </button>
                <button onClick={() => { setExportFormat('pdf'); setTimeout(() => {
                  const params = new URLSearchParams();
                  params.set('format', 'pdf');
                  params.set('type', exportType);
                  if (expStartDate) params.set('startDate', expStartDate);
                  if (expEndDate) params.set('endDate', expEndDate);
                  if (expStepId) params.set('stepId', expStepId);
                  if (expStatus) params.set('status', expStatus);
                  if (expTeam) params.set('team', expTeam);
                  if (expAssignedToId) params.set('assignedToId', expAssignedToId);
                  if (expClientId) params.set('clientId', expClientId);
                  if (expPriority) params.set('priority', expPriority);
                  if (expCompleted !== 'all') params.set('completed', expCompleted);
                  if (expIncludeArchived) params.set('includeArchived', 'true');
                  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                  if (token) params.set('token', token);
                  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                  window.open(url, '_blank');
                }, 50); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Download size={14} /> Print PDF Report
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
