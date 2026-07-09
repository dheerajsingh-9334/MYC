'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK, MOCK_TEAM, MOCK_TASKS, MOCK_CLIENTS, MOCK_STEPS } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Users, UserPlus, CircleCheck, TriangleAlert, Clock, TrendingUp, Activity, ArrowRight, BarChart3, Search, Bell, Check, X, Download, Play } from 'lucide-react';
import { format } from 'date-fns';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { deriveSparkline } from '@/lib/sparkline';

const TEAMS = ['Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 'Account Manager', 'Content Team'];

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
  recentCompletions: Array<{ id: string; title: string; completedAt: string; assignee: string; team: string; client: string; step: string; action?: string; }>;
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

const MOCK_ADMIN_DATA: AdminData = {
  orgStats: {
    totalClients: 8,
    activeClients: 8,
    completedClients: 0,
    avgCompletionTimeDays: 4,
    totalTasks: 25,
    activeTasks: 18,
    overdueTasks: 2,
    blockedTasks: 1,
    extensionTasks: 0,
    inProgressTasks: 8,
    completedLast7d: 12,
    onTimePct: 85,
  },
  teams: [
    { teamName: 'Intake Team', memberCount: 1, leadCount: 1, activeTasks: 4, overdue: 0, blocked: 0, completedLast7d: 3 },
    { teamName: 'Sales Team', memberCount: 1, leadCount: 0, activeTasks: 6, overdue: 0, blocked: 0, completedLast7d: 4 },
    { teamName: 'Design Team', memberCount: 1, leadCount: 0, activeTasks: 3, overdue: 0, blocked: 0, completedLast7d: 9 },
    { teamName: 'Tech Team', memberCount: 2, leadCount: 0, activeTasks: 9, overdue: 2, blocked: 0, completedLast7d: 14 },
    { teamName: 'Creative Team', memberCount: 1, leadCount: 0, activeTasks: 4, overdue: 0, blocked: 1, completedLast7d: 5 },
    { teamName: 'Automation Team', memberCount: 1, leadCount: 0, activeTasks: 3, overdue: 0, blocked: 0, completedLast7d: 7 },
    { teamName: 'Event Team', memberCount: 1, leadCount: 0, activeTasks: 5, overdue: 0, blocked: 0, completedLast7d: 4 },
  ],
  members: [
    { userId: 'u1', name: 'Rajan Mehta', team: 'Tech Team', role: 'team_member', active: 5, overdue: 2, blocked: 0, completedLast7d: 8 },
    { userId: 'u2', name: 'Neha Singh', team: 'Design Team', role: 'team_member', active: 3, overdue: 0, blocked: 0, completedLast7d: 9 },
    { userId: 'u3', name: 'Karan Roy', team: 'Creative Team', role: 'team_member', active: 4, overdue: 0, blocked: 1, completedLast7d: 5 },
    { userId: 'u4', name: 'Sneha Pillai', team: 'Sales Team', role: 'team_member', active: 6, overdue: 0, blocked: 0, completedLast7d: 4 },
    { userId: 'u5', name: 'Karthik Iyer', team: 'Tech Team', role: 'team_member', active: 4, overdue: 0, blocked: 0, completedLast7d: 6 },
    { userId: 'u6', name: 'Amit Sharma', team: 'Automation Team', role: 'team_member', active: 3, overdue: 0, blocked: 0, completedLast7d: 7 },
    { userId: 'u7', name: 'Preethi Nair', team: 'Event Team', role: 'team_member', active: 5, overdue: 0, blocked: 0, completedLast7d: 4 },
    { userId: 'u8', name: 'Divya Menon', team: 'Intake Team', role: 'team_leader', active: 4, overdue: 0, blocked: 0, completedLast7d: 3 },
  ],
  stepRollup: [],
  recentCompletions: [
    { id: 't5', title: 'Configure email automation sequence', completedAt: new Date().toISOString(), assignee: 'Rajan Mehta', team: 'Tech Team', client: 'Mindful with Meera', step: 'Automation Setup' },
  ],
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
  const { data: liveSteps = [] } = useQuery({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const stepsList = useMemo(() => USE_MOCK ? MOCK_STEPS : liveSteps, [liveSteps]);

  const { data: liveTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const teamsList = useMemo(() => USE_MOCK ? TEAMS : liveTeams, [liveTeams]);

  const { data: liveUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const usersList = useMemo(() => USE_MOCK ? MOCK_TEAM : liveUsers, [liveUsers]);

  const { data: liveClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const clientsList = useMemo(() => USE_MOCK ? MOCK_CLIENTS : liveClients, [liveClients]);

  // Client-side guard: non-admins and non-leaders redirected to /dashboard
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'team_leader') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const { data: liveData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/api/dashboard/admin'),
    enabled: !USE_MOCK && (user?.role === 'admin' || user?.role === 'team_leader'),
    retry: false,
  });

  const { data: liveTasks = [], isLoading: isTasksLoading } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK && (user?.role === 'admin' || user?.role === 'team_leader'),
    retry: false,
  });
  const tasksList = useMemo(() => USE_MOCK ? MOCK_TASKS : liveTasks, [liveTasks]);

  const approveExtensionMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => {
      if (USE_MOCK) return Promise.resolve();
      return apiFetch(`/api/tasks/${id}/approve-extension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const assignTaskMut = useMutation({
    mutationFn: ({ taskId, assignedToId }: { taskId: string; assignedToId: string | null }) => {
      if (USE_MOCK) return Promise.resolve();
      return apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedToId }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
  });

  const data: AdminData = useMemo(() => {
    if (USE_MOCK) return MOCK_ADMIN_DATA;
    return {
      orgStats: { ...EMPTY_DATA.orgStats, ...(liveData?.orgStats || {}) },
      teams: liveData?.teams || EMPTY_DATA.teams,
      members: liveData?.members || EMPTY_DATA.members,
      stepRollup: liveData?.stepRollup || EMPTY_DATA.stepRollup,
      recentCompletions: liveData?.recentCompletions || EMPTY_DATA.recentCompletions,
      pendingExtensions: liveData?.pendingExtensions || EMPTY_DATA.pendingExtensions,
    };
  }, [liveData]);

  const filteredMembers = useMemo(() => {
    let ms = data.members;
    if (user?.role === 'team_leader' && user.teamName) {
      ms = ms.filter((m) => m.team === user.teamName);
    } else if (teamFilter) {
      ms = ms.filter((m) => m.team === teamFilter);
    }
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      ms = ms.filter((m) => 
        (m.name || '').toLowerCase().includes(q) || 
        (m.team || '').toLowerCase().includes(q)
      );
    }
    return ms;
  }, [data.members, memberSearch, teamFilter, user]);

  // Operations Overview tabbed details state and infinite scroll limits
  const [opTab, setOpTab] = useState<'Workload' | 'Team Tasks' | 'Notifications' | 'Pending Requests' | 'Audit Logs'>('Workload');
  
  useEffect(() => {
    if (user && user.role !== 'admin') {
      setOpTab('Team Tasks');
    }
  }, [user]);

  const tabs = useMemo(() => {
    if (user?.role === 'admin') {
      return ['Workload', 'Team Tasks', 'Notifications', 'Pending Requests', 'Audit Logs'];
    }
    return ['Team Tasks', 'Pending Requests', 'Notifications'];
  }, [user]);

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
    enabled: !USE_MOCK && (user?.role === 'admin' || user?.role === 'team_leader'),
    retry: false,
  });

  const clearNotifsMut = useMutation({
    mutationFn: () => {
      if (USE_MOCK) return Promise.resolve();
      return apiFetch('/api/notifications/clear-all', { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });

  const notifications = useMemo(() => USE_MOCK ? [] : (liveNotifs || []), [liveNotifs]);

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

  // Team tasks computations
  const filteredTasks = useMemo(() => {
    let list = tasksList;
    if (user?.role === 'team_leader') {
      list = list.filter((t: any) => {
        const team = t.step?.owningTeamName || t.assignedTo?.teamName;
        return team === user.teamName;
      });
    }
    if (workloadSearch.trim()) {
      const q = workloadSearch.toLowerCase();
      list = list.filter((t: any) =>
        t.title.toLowerCase().includes(q) ||
        (t.client?.brandName || t.client?.fullName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasksList, user, workloadSearch]);

  // Recent Activity computations
  const filteredActivity = useMemo(() => {
    let list = data.recentCompletions;
    if (user?.role === 'team_leader' && user.teamName) {
      list = list.filter((c) => c.team === user.teamName);
    }
    if (activitySearch.trim()) {
      const q = activitySearch.toLowerCase();
      list = list.filter(
        (c) =>
          (c.title || '').toLowerCase().includes(q) ||
          (c.assignee || '').toLowerCase().includes(q) ||
          (c.client || '').toLowerCase().includes(q) ||
          (c.team && c.team.toLowerCase().includes(q))
      );
    }
    return list;
  }, [data.recentCompletions, activitySearch, user]);

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

  const handleOpScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      if (opTab === 'Workload') {
        setWorkloadLimit(prev => Math.min(prev + 10, filteredWorkload.length));
      } else if (opTab === 'Pending Requests') {
        setPendingLimit(prev => Math.min(prev + 10, pendingExtensionsList.length));
      } else if (opTab === 'Audit Logs') {
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

  if (!user || (user.role !== 'admin' && user.role !== 'team_leader') || (!USE_MOCK && (isDashboardLoading || isNotifsLoading))) {
    return (
      <AppLayout>
        <Topbar
          title="Workload Management"
          subtitle="Manage workloads, tasks, and team assignments"
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
          <span style={{ fontSize: 13, fontWeight: 500 }}>Loading workload data...</span>
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
        title="Workload Management"
        subtitle={`Manage team workload, assignments, and alerts · Org Avg Completion Time: ${data.orgStats.avgCompletionTimeDays || 0} days`}
      />
      <div style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* ── Main Dashboard Body ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          
          <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', minHeight: 550 }}>
            <SectionCard
              padding="0"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
            >
              {/* Tab selector */}
              <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--surface-2)', overflowX: 'auto' }}>
                {tabs.map((t) => {
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
                
                {/* 1. WORKLOAD TAB */}
                {opTab === 'Workload' && (
                  <div>
                    {/* Filter / Search */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                        <input
                          value={workloadSearch}
                          onChange={(e) => { setWorkloadSearch(e.target.value); setWorkloadLimit(15); }}
                          placeholder="Search teams..."
                          style={{
                            width: '100%',
                            padding: '12px 16px 12px 32px',
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

                    {/* List */}
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Team</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Members</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: 200 }}>Capacity Load</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Active</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Late</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Blocked</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center' }}>Done</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrollableWorkload.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No teams match search.</td></tr>
                          ) : (
                            scrollableWorkload.map((t) => {
                              const max = Math.max(...data.teams.map(x => x.activeTasks), 1);
                              const pct = (t.activeTasks / max) * 100;
                              const avgTasksPerMember = t.activeTasks / Math.max(t.memberCount, 1);
                              const overloaded = t.overdue > 2 || avgTasksPerMember > 3;
                              const loadStatus = overloaded 
                                ? { label: 'High Load', bg: '#FBEEF1', color: 'var(--red)', dot: 'var(--red)' } 
                                : t.activeTasks > 0 
                                  ? { label: 'Normal', bg: 'var(--olive-50)', color: 'var(--olive)', dot: 'var(--olive)' } 
                                  : { label: 'Idle', bg: 'var(--surface-2)', color: 'var(--muted)', dot: 'var(--soft)' };

                              return (
                                <tr
                                  key={t.teamName}
                                  onClick={() => router.push(`/team?team=${encodeURIComponent(t.teamName)}`)}
                                  style={{ borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', transition: 'background 0.15s' }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{t.teamName}</div>
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)' }}>
                                    {t.memberCount}
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pct}%`, background: overloaded ? 'var(--amber)' : 'var(--olive)', borderRadius: 3 }} />
                                      </div>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                        background: loadStatus.bg, color: loadStatus.color, whiteSpace: 'nowrap'
                                      }}>
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: loadStatus.dot }} />
                                        {loadStatus.label}
                                      </span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t.activeTasks}</td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', fontSize: 13, fontWeight: 500, color: t.overdue > 0 ? 'var(--red)' : 'var(--muted)' }}>{t.overdue}</td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', fontSize: 13, fontWeight: 500, color: t.blocked > 0 ? '#6B3FA0' : 'var(--muted)' }}>{t.blocked}</td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{t.completedLast7d}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. TEAM TASKS TAB (Leader Assignment View) */}
                {opTab === 'Team Tasks' && (
                  <div>
                    {/* Search bar */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                        <input
                          value={workloadSearch}
                          onChange={(e) => setWorkloadSearch(e.target.value)}
                          placeholder="Search team tasks or clients..."
                          style={{
                            width: '100%',
                            padding: '12px 16px 12px 32px',
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

                    {/* Table of Tasks */}
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Task</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Client</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Due Date</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Status</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Assignee (Direct Action)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredTasks.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tasks found.</td></tr>
                          ) : (
                            filteredTasks.map((t: any) => {
                              const isAlerted = t.isAlerted;
                              return (
                                <tr
                                  key={t.id}
                                  style={{
                                    borderBottom: '1px solid var(--surface-2)',
                                    background: isAlerted ? 'var(--red-bg)' : 'transparent',
                                    position: 'relative'
                                  }}
                                >
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      {isAlerted && <span style={{ color: 'var(--red)' }}>⚠️</span>}
                                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{t.title}</div>
                                    </div>
                                    {t.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.description}</div>}
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)' }}>
                                    {t.client?.brandName || t.client?.fullName || '—'}
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)' }}>
                                    {t.dueDate ? format(new Date(t.dueDate), 'd MMM yyyy') : '—'}
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                                    <span className={`status-badge status-${t.status === 'complete' ? 'ontrack' : t.status === 'blocked' ? 'blocked' : 'due'}`}>
                                      {t.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
                                    <select
                                      value={t.assignedToId || t.assignedTo?.id || ''}
                                      onChange={(e) => assignTaskMut.mutate({ taskId: t.id, assignedToId: e.target.value || null })}
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface)',
                                        color: 'var(--ink)',
                                        fontSize: 12.5,
                                        outline: 'none',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <option value="">Unassigned</option>
                                      {user?.role === 'admin' ? (
                                        usersList.map((u: any) => (
                                          <option key={u.id} value={u.id}>{u.fullName} ({u.teamName || 'No Team'})</option>
                                        ))
                                      ) : (
                                        <>
                                          <option value={user.id}>{user.fullName} (Lead)</option>
                                          {usersList.filter((u: any) => u.teamName === user.teamName && u.id !== user.id).map((u: any) => (
                                            <option key={u.id} value={u.id}>{u.fullName}</option>
                                          ))}
                                        </>
                                      )}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. PENDING REQUESTS TAB */}
                {opTab === 'Pending Requests' && (
                  <div>
                    {/* Heading */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                      Pending Task Extension Requests ({pendingExtensionsList.length})
                    </div>

                    {/* List */}
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10, textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Task & Details</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Client & Step</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Team & Assignee</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Dates</th>
                            <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrollableExtensions.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No pending extension requests.</td></tr>
                          ) : (
                            scrollableExtensions.map((ext) => (
                              <tr key={ext.id} style={{ borderBottom: '1px solid var(--surface-2)' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                <td style={{ padding: '10px 18px', verticalAlign: 'top', minWidth: 260 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{ext.title}</div>
                                  {ext.extensionReason && (
                                    <div style={{ fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: 4, borderLeft: '2px solid var(--red)' }}>
                                      &ldquo;{ext.extensionReason}&rdquo;
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '10px 18px', verticalAlign: 'top' }}>
                                  <div style={{ fontSize: 13, color: 'var(--ink)' }}>{ext.client}</div>
                                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>{ext.step}</div>
                                </td>
                                <td style={{ padding: '10px 18px', verticalAlign: 'top' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                      {ext.team}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{ext.assignee}</div>
                                </td>
                                <td style={{ padding: '10px 18px', verticalAlign: 'top', fontSize: 12 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div><span style={{ color: 'var(--muted)' }}>Current Due:</span> <strong style={{ color: 'var(--ink-2)' }}>{format(new Date(ext.dueDate), 'd MMM yyyy')}</strong></div>
                                    <div><span style={{ color: 'var(--muted)' }}>Requested:</span> <strong style={{ color: 'var(--blue)' }}>{format(new Date(ext.extensionRequestedDate), 'd MMM yyyy')}</strong></div>
                                  </div>
                                </td>
                                <td style={{ padding: '10px 18px', verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      onClick={() => approveExtensionMut.mutate({ id: ext.id, approved: false })}
                                      disabled={approveExtensionMut.isPending}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                                        background: '#FBEEF1', border: '1px solid #F3D0D7',
                                        color: 'var(--red)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
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
                                        color: 'var(--green)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = '#D7F1E1'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--green-bg)'; }}
                                    >
                                      <Check size={12} /> Approve
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. NOTIFICATIONS TAB */}
                {opTab === 'Notifications' && (
                  <div>
                    {/* Alert Heading */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Latest alerts for your account
                      </div>
                      <button
                        onClick={() => clearNotifsMut.mutate()}
                        disabled={clearNotifsMut.isPending || scrollableNotifications.length === 0}
                        style={{
                          background: 'none', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                          fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer'
                        }}
                      >
                        {clearNotifsMut.isPending ? 'Clearing...' : 'Clear All'}
                      </button>
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

                {/* 5. AUDIT LOGS TAB */}
                {opTab === 'Audit Logs' && (
                  <div>
                    {/* Filter / Search */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                        <input
                          value={activitySearch}
                          onChange={(e) => { setActivitySearch(e.target.value); setActivityLimit(15); }}
                          placeholder="Search audit logs..."
                          style={{
                            width: '100%',
                            padding: '12px 16px 12px 32px',
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
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No audit logs found.</div>
                      ) : (
                        scrollableActivity.map((c) => {
                          let icon = '✅';
                          let messageElement = (
                            <>
                              {c.assignee} completed <strong style={{ color: 'var(--ink-2)' }}>{c.title}</strong>
                            </>
                          );
                          if (c.action === 'created') {
                            icon = '➕';
                            messageElement = (
                              <>
                                {c.assignee} was assigned task <strong style={{ color: 'var(--ink-2)' }}>{c.title}</strong>
                              </>
                            );
                          } else if (c.action === 'in_progress') {
                            icon = '⚡';
                            messageElement = (
                              <>
                                {c.assignee} started task <strong style={{ color: 'var(--ink-2)' }}>{c.title}</strong>
                              </>
                            );
                          } else if (c.action === 'blocked') {
                            icon = '🚫';
                            messageElement = (
                              <>
                                Task <strong style={{ color: 'var(--ink-2)' }}>{c.title}</strong> was blocked
                              </>
                            );
                          }
                          return (
                            <div key={c.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 15, marginTop: 2 }}>{icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>
                                  {messageElement}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                  {c.client} · {c.step}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                                {c.completedAt ? format(new Date(c.completedAt), 'd MMM, HH:mm') : ''}
                              </span>
                            </div>
                          );
                        })
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
