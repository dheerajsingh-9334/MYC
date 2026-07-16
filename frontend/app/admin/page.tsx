'use client';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK, MOCK_CLIENTS, MOCK_TASKS } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import {
  Users, UserPlus, CircleCheck, TriangleAlert, Clock, TrendingUp, Activity,
  ArrowRight, BarChart3, Search, Bell, Check, X, Download, Play,
  Sun, Moon, Shield, CheckCircle, Hourglass, Ban, Sparkles, Megaphone,
  ListChecks, XCircle, Filter
} from 'lucide-react';
import { format, differenceInCalendarDays, startOfDay } from 'date-fns';
import SectionCard from '@/components/ui/SectionCard';

const AUTO_REFRESH_MS = 15000;

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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeDashboardTab, setActiveDashboardTab] = useState<'operations' | 'team'>('operations');

  useEffect(() => {
    setUser(getUser());
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const qc = useQueryClient();
  const [memberSearch, setMemberSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');

  // Export Modal States
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('client_full');
  const [exportFormat, setExportFormat] = useState('csv');

  // Admin Tasks State
  const [adminTaskTab, setAdminTaskTab] = useState<'active' | 'completed' | 'rejected'>('active');
  const [adminTaskSearch, setAdminTaskSearch] = useState('');
  const [adminTaskScope, setAdminTaskScope] = useState<'my' | 'all'>('all');
  const [adminTaskPriority, setAdminTaskPriority] = useState<'all' | 'high' | 'normal'>('all');
  const [showHoverFilter, setShowHoverFilter] = useState(false);
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

  // Delete Import States
  const [showDeleteImportModal, setShowDeleteImportModal] = useState(false);
  const [isDeletingImport, setIsDeletingImport] = useState(false);
  const [deleteImportError, setDeleteImportError] = useState('');

  const handleDeleteImportData = async () => {
    setIsDeletingImport(true);
    setDeleteImportError('');
    try {
      const res = await apiFetch('/api/clients/import/cleanup', {
        method: 'DELETE',
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setShowDeleteImportModal(false);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (e: any) {
      setDeleteImportError(e.message || 'Failed to purge CSV data.');
    } finally {
      setIsDeletingImport(false);
    }
  };

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
    refetchInterval: AUTO_REFRESH_MS,
    retry: false,
  });

  const { data: tasksList = [] } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    refetchInterval: AUTO_REFRESH_MS,
    retry: false,
  });

  // Client-side guard: non-admins redirected to /dashboard
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const { data: liveData } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiFetch('/api/dashboard/admin'),
    enabled: user?.role === 'admin',
    refetchInterval: AUTO_REFRESH_MS,
    retry: false,
  });

  const { data: standupData } = useQuery<any>({
    queryKey: ['standup'],
    queryFn: () => apiFetch('/api/standup'),
    refetchInterval: AUTO_REFRESH_MS,
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

  const allClients = USE_MOCK ? MOCK_CLIENTS : clientsList;
  const allTasks = USE_MOCK ? MOCK_TASKS : (tasksList || []);

  const totalClientsCount = allClients.length;
  const activeClientsCount = allClients.filter((c: any) => c.status === 'active').length;
  const launchedClientsCount = allClients.filter((c: any) => c.status === 'completed' || (c.currentStep?.stepNumber && c.currentStep.stepNumber >= 9)).length;

  const avgCompletionTimeStr = useMemo(() => {
    const completed = allClients.filter((c: any) => c.status === 'completed');
    if (completed.length === 0) {
      return data.orgStats.avgCompletionTimeDays !== undefined ? `${data.orgStats.avgCompletionTimeDays} Days` : '32 Days';
    }
    const totalDays = completed.reduce((sum: number, c: any) => sum + (c.completionDurationDays || 0), 0);
    return `${Math.round(totalDays / completed.length)} Days`;
  }, [allClients, data.orgStats.avgCompletionTimeDays]);

  const overdueClientsCount = allClients.filter((c: any) => c.computedStatus === 'overdue').length;
  const blockedClientsCount = allClients.filter((c: any) => c.computedStatus === 'blocked').length;
  const activeTasksCount = allTasks.filter((t: any) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled').length;
  const overdueTasksCount = allTasks.filter((t: any) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && differenceInCalendarDays(startOfDay(new Date(t.dueDate)), startOfDay(new Date())) < 0).length;
  const pendingRequestsCount = allTasks.filter((t: any) => t.status === 'extension_requested' || t.status === 'blocked').length;

  const standupItems = useMemo(() => {
    if (USE_MOCK || !standupData?.items) {
      return [
        { alertType: 'overdue' },
        { alertType: 'overdue' },
        { alertType: 'blocked' },
        { alertType: 'due_today' },
      ];
    }
    return standupData.items;
  }, [standupData]);

  const standupStats = useMemo(() => {
    const total = standupItems.length;
    const overdue = standupItems.filter((i: any) => i.alertType === 'overdue').length;
    const blocked = standupItems.filter((i: any) => i.alertType === 'blocked').length;
    const dueToday = standupItems.filter((i: any) => i.alertType === 'due_today').length;
    return { total, overdue, blocked, dueToday };
  }, [standupItems]);

  const getHumanReadableTiming = (client: any) => {
    const daysInStep = client.daysInStep ?? 0;
    const slaDays = client.currentStep?.slaDays ?? 0;
    const daysLate = daysInStep - slaDays;

    if (client.computedStatus === 'overdue') {
      if (daysLate > 0) {
        return `${daysLate} day${daysLate !== 1 ? 's' : ''} late`;
      } else {
        const remaining = slaDays - daysInStep;
        if (remaining > 0) {
          return `Due in ${remaining} day${remaining !== 1 ? 's' : ''}`;
        } else {
          return `Due today`;
        }
      }
    } else if (client.computedStatus === 'blocked') {
      return 'Blocked';
    } else if (client.computedStatus === 'due_today') {
      return 'Due today';
    } else {
      const remaining = slaDays - daysInStep;
      if (remaining > 0) {
        return `Due in ${remaining} day${remaining !== 1 ? 's' : ''}`;
      } else if (remaining === 0) {
        return `Due today`;
      } else {
        return 'On track';
      }
    }
  };

  const getClientStatusStyles = (client: any) => {
    const daysInStep = client.daysInStep ?? 0;
    const slaDays = client.currentStep?.slaDays ?? 0;
    const daysLate = daysInStep - slaDays;

    if (client.computedStatus === 'overdue') {
      if (daysLate > 3) {
        return {
          bg: 'var(--red-bg)',
          color: 'var(--red)',
          label: getHumanReadableTiming(client),
        };
      } else {
        return {
          bg: 'var(--amber-bg)',
          color: 'var(--amber)',
          label: getHumanReadableTiming(client),
        };
      }
    } else if (client.computedStatus === 'blocked') {
      return {
        bg: 'var(--blocked-bg)',
        color: 'var(--blocked)',
        label: 'Blocked',
      };
    } else if (client.computedStatus === 'due_today') {
      return {
        bg: 'var(--amber-bg)',
        color: 'var(--amber)',
        label: 'Due today',
      };
    } else {
      return {
        bg: 'var(--green-bg)',
        color: 'var(--green)',
        label: 'On track',
      };
    }
  };

  // Attention Panel Items
  const attentionItems = useMemo(() => {
    const overdueClients = allClients.filter((c: any) => c.computedStatus === 'overdue');
    let criticalMsg = "No critical client delays detected.";
    let criticalLink = "/clients?filter=overdue";
    if (overdueClients.length > 0) {
      const sorted = [...overdueClients].sort((a: any, b: any) => {
        const aLate = (a.daysInStep || 0) - (a.currentStep?.slaDays || 0);
        const bLate = (b.daysInStep || 0) - (b.currentStep?.slaDays || 0);
        return bLate - aLate;
      });
      const topClient = sorted[0];
      const timingLabel = getHumanReadableTiming(topClient);
      criticalMsg = `${topClient.brandName || topClient.fullName} is ${timingLabel} on step "${topClient.currentStep?.name || 'Unknown'}".`;
      criticalLink = `/clients?filter=overdue`;
    }

    const blockedClients = allClients.filter((c: any) => c.computedStatus === 'blocked');
    let warningMsg = "No blocked tasks or client onboarding holds.";
    let warningLink = "/standup?filter=blocked";
    if (blockedClients.length > 0) {
      warningMsg = `${blockedClients.length} client pipeline${blockedClients.length > 1 ? 's are' : ' is'} blocked by unresolved issues.`;
      warningLink = `/standup?filter=blocked`;
    } else {
      const dueToday = allClients.filter((c: any) => c.computedStatus === 'due_today');
      if (dueToday.length > 0) {
        warningMsg = `${dueToday.length} client task${dueToday.length > 1 ? 's are' : ' is'} due today.`;
        warningLink = `/standup?filter=due_today`;
      }
    }

    const pendingExtensions = allTasks.filter((t: any) => t.status === 'extension_requested');
    let infoMsg = "No pending extension requests.";
    let infoLink = "/standup";
    if (pendingExtensions.length > 0) {
      infoMsg = `${pendingExtensions.length} task extension request${pendingExtensions.length > 1 ? 's' : ''} awaiting approval.`;
      infoLink = `/standup`; 
    }

    return {
      critical: { message: criticalMsg, link: criticalLink, hasItems: overdueClients.length > 0 },
      warning: { message: warningMsg, link: warningLink, hasItems: blockedClients.length > 0 || allClients.filter((c: any) => c.computedStatus === 'due_today').length > 0 },
      info: { message: infoMsg, link: infoLink, hasItems: pendingExtensions.length > 0 },
    };
  }, [allClients, allTasks]);

  // Sorted Client Risk list
  const sortedClientsForRisk = useMemo(() => {
    const list = [...allClients];
    return list.sort((a: any, b: any) => {
      const aLate = a.computedStatus === 'overdue' ? Math.max(0, (a.daysInStep || 0) - (a.currentStep?.slaDays || 0)) : 0;
      const bLate = b.computedStatus === 'overdue' ? Math.max(0, (b.daysInStep || 0) - (b.currentStep?.slaDays || 0)) : 0;
      if (aLate !== bLate) return bLate - aLate;
      const statusOrder: Record<string, number> = { overdue: 0, blocked: 1, due_today: 2, on_track: 3 };
      return (statusOrder[a.computedStatus] ?? 4) - (statusOrder[b.computedStatus] ?? 4);
    });
  }, [allClients]);

  const filteredMembers = useMemo(() => {
    let ms = data.members;
    if (teamFilter) ms = ms.filter((m: any) => m.team === teamFilter);
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      ms = ms.filter((m: any) => m.name.toLowerCase().includes(q) || m.team.toLowerCase().includes(q));
    }
    return ms;
  }, [data.members, memberSearch, teamFilter]);

  const groupedAdminTasks = useMemo(() => {
    if (!user) return { active: [], completed: [], rejected: [] };
    const filteredTasks = allTasks.filter((t: any) => {
      // Filter by Scope
      if (adminTaskScope === 'my') {
        const assigneeId = t.assignedToId || t.assignedTo?.id;
        if (assigneeId !== user.id && t.assignedTo?.fullName !== user.fullName) {
          return false;
        }
      }
      // Filter by Priority
      if (adminTaskPriority !== 'all') {
        if (t.priority !== adminTaskPriority) {
          return false;
        }
      }
      return true;
    });

    return {
      active: filteredTasks.filter((t: any) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled'),
      completed: filteredTasks.filter((t: any) => t.status === 'complete'),
      rejected: filteredTasks.filter((t: any) => t.status === 'rejected' || t.status === 'cancelled'),
    };
  }, [allTasks, user, adminTaskScope, adminTaskPriority]);

  const visibleAdminTasks = useMemo(() => {
    let list = groupedAdminTasks[adminTaskTab];
    if (adminTaskSearch.trim()) {
      const q = adminTaskSearch.toLowerCase();
      list = list.filter((t: any) => (t.title?.toLowerCase().includes(q) || t.client?.brandName?.toLowerCase().includes(q)));
    }
    return list;
  }, [groupedAdminTasks, adminTaskTab, adminTaskSearch]);

  const allTimeJoinData = useMemo(() => {
    const sorted = [...allClients].map(c => {
      const date = new Date(c.dateJoined || c.createdAt || c.addedAt || new Date());
      return { ...c, parsedDate: date };
    }).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    if (sorted.length === 0) {
      return { labels: ['Start', 'Now'], data: [0, 0] };
    }

    const monthlyCounts: { [key: string]: number } = {};
    sorted.forEach(c => {
      const label = format(c.parsedDate, 'MMM yy');
      monthlyCounts[label] = (monthlyCounts[label] || 0) + 1;
    });

    const labels = Object.keys(monthlyCounts);
    const counts = Object.values(monthlyCounts);
    
    let cumulative = 0;
    const cumulativeCounts = counts.map(count => {
      cumulative += count;
      return cumulative;
    });

    if (labels.length === 1) {
      return {
        labels: ['Prev', labels[0]],
        data: [0, cumulativeCounts[0]]
      };
    }

    return { labels, data: cumulativeCounts };
  }, [allClients]);

  const launchedLineChartData = useMemo(() => {
    const launchedClients = allClients.filter((c: any) => c.currentStep?.stepNumber === 9 || c.currentStep?.isFinal);
    if (launchedClients.length === 0) {
      return { labels: ['Start', 'Now'], data: [0, 0] };
    }
    
    const timestamps = launchedClients.map((c: any) => new Date(c.updatedAt || c.createdAt || new Date()).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = new Date().getTime();
    
    const range = Math.max(1000 * 60 * 60 * 24, maxTime - minTime); 
    const step = range / 6;
    timestamps.sort((a: any, b: any) => a - b);
    
    const data = [0, 0, 0, 0, 0, 0, 0];
    const labels = ['', '', '', '', '', '', ''];
    let cumulative = 0;
    let tIdx = 0;
    
    for (let i = 0; i < 7; i++) {
      const bucketEnd = i === 6 ? maxTime : minTime + step * i;
      while (tIdx < timestamps.length && timestamps[tIdx] <= bucketEnd) {
        cumulative++;
        tIdx++;
      }
      data[i] = cumulative;
      labels[i] = new Date(bucketEnd).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    
    return { labels, data };
  }, [allClients]);

  // Fetch notifications
  const { data: liveNotifs } = useQuery<any[]>({
    queryKey: ['admin-notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    enabled: user?.role === 'admin',
    retry: false,
  });

  const notifications = liveNotifs || [];

  return (
    <AppLayout>
      <Topbar
        title="Admin Dashboard"
        subtitle="Org-wide view · Tasks, teams, performance"
        renderActions={() => (
          <button
            onClick={() => setShowDeleteImportModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 32,
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.2)',
              color: 'var(--red)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)'; }}
          >
            <TriangleAlert size={13} />
            Purge CSV Data
          </button>
        )}
      />

      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Row 2: 5 Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {[
            {
              title: 'Total Clients',
              value: totalClientsCount,
              subtitle: 'Registered portfolio',
              path: '/clients',
              accent: 'var(--olive)',
              icon: Users,
            },
            {
              title: 'Launched Clients',
              value: launchedClientsCount,
              subtitle: 'Step 9+ / Completed',
              path: '/clients?filter=completed',
              accent: 'var(--green)',
              icon: CheckCircle,
            },
            {
              title: 'Overdue Clients',
              value: overdueClientsCount,
              subtitle: 'Exceeded step SLA',
              path: '/clients?filter=overdue',
              accent: 'var(--red)',
              icon: TriangleAlert,
            },
            {
              title: 'Overdue Tasks',
              value: overdueTasksCount,
              subtitle: 'Past due date',
              path: '/tasks?filter=overdue',
              accent: 'var(--red)',
              icon: Clock,
            },
            {
              title: 'Team Size',
              value: usersList.filter((u: any) => u.isActive !== false).length,
              subtitle: 'Active employees',
              path: '/team',
              accent: 'var(--olive)',
              icon: Users,
            },
          ].map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div
                key={idx}
                onClick={() => router.push(kpi.path)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderTopColor = kpi.accent;
                  e.currentTarget.style.borderRightColor = kpi.accent;
                  e.currentTarget.style.borderBottomColor = kpi.accent;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderTopColor = 'var(--border)';
                  e.currentTarget.style.borderRightColor = 'var(--border)';
                  e.currentTarget.style.borderBottomColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
                style={{ ...statCardStyle(kpi.accent), cursor: 'pointer' }}
              >
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ ...statCardHeaderStyle, color: kpi.accent }}>
                    <Icon size={14} style={{ color: kpi.accent }} />
                    <span style={{ fontWeight: 800 }}>{kpi.title}</span>
                  </div>
                  <div style={statCardValueContainerStyle}>
                    <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{kpi.value}</span>
                    <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>{kpi.subtitle}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Row 3: Split Screen (My Tasks | Client Analysis & Graph) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          
          {/* Left Column: My Tasks */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionCard 
              title={adminTaskScope === 'all' ? 'All Tasks' : 'My Tasks'}
              subtitle={adminTaskScope === 'all' ? `${groupedAdminTasks.active.length} active · ${groupedAdminTasks.completed.length} completed across all clients` : 'Overdue, due today, and upcoming'}
              padding="0" 
              style={{ display: 'flex', flexDirection: 'column' }}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Segmented Control for Scope */}
                  <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setAdminTaskScope('all')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        border: 'none',
                        background: adminTaskScope === 'all' ? 'var(--surface)' : 'transparent',
                        color: adminTaskScope === 'all' ? 'var(--ink)' : 'var(--muted)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: adminTaskScope === 'all' ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >
                      All Tasks
                    </button>
                    <button
                      onClick={() => setAdminTaskScope('my')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        border: 'none',
                        background: adminTaskScope === 'my' ? 'var(--surface)' : 'transparent',
                        color: adminTaskScope === 'my' ? 'var(--ink)' : 'var(--muted)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: adminTaskScope === 'my' ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >
                      My Tasks
                    </button>
                  </div>

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 140 }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={adminTaskSearch}
                      onChange={(e) => setAdminTaskSearch(e.target.value)}
                      style={{ padding: '5px 8px 5px 26px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, outline: 'none', background: 'var(--surface-2)', color: 'var(--ink)', width: '100%' }}
                    />
                  </div>

                  {/* Hover Filter Button */}
                  <div 
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setShowHoverFilter(true)}
                    onMouseLeave={() => setShowHoverFilter(false)}
                  >
                    <button
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        height: 28,
                        padding: '0 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--ink-2)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <Filter size={12} />
                      Filter
                    </button>
                    {showHoverFilter && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          zIndex: 100,
                          marginTop: 4,
                          width: 180,
                          padding: 12,
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          boxShadow: 'var(--shadow-lg)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Priority</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)', cursor: 'pointer' }}>
                              <input type="radio" checked={adminTaskPriority === 'all'} onChange={() => setAdminTaskPriority('all')} style={{ cursor: 'pointer' }} />
                              All Priorities
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)', cursor: 'pointer' }}>
                              <input type="radio" checked={adminTaskPriority === 'high'} onChange={() => setAdminTaskPriority('high')} style={{ cursor: 'pointer' }} />
                              High Only
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink)', cursor: 'pointer' }}>
                              <input type="radio" checked={adminTaskPriority === 'normal'} onChange={() => setAdminTaskPriority('normal')} style={{ cursor: 'pointer' }} />
                              Normal Only
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={() => router.push('/tasks')} style={{ fontSize: 12, fontWeight: 500, color: 'var(--olive)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Open full task manager <ArrowRight size={12} />
                  </button>
                </div>
              }
            >
              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: 8, padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                {[
                  { key: 'active', label: adminTaskScope === 'all' ? 'All Active' : 'My Tasks', count: groupedAdminTasks.active.length, icon: ListChecks, accent: 'var(--olive)', bg: 'var(--olive-50)' },
                  { key: 'completed', label: 'Completed', count: groupedAdminTasks.completed.length, icon: CircleCheck, accent: 'var(--green)', bg: 'var(--green-bg)' },
                  { key: 'rejected', label: 'Rejected', count: groupedAdminTasks.rejected.length, icon: XCircle, accent: 'var(--rejected)', bg: 'var(--rejected-bg)' }
                ].map(t => {
                  const isActive = adminTaskTab === t.key;
                  return (
                    <button key={t.key} onClick={() => setAdminTaskTab(t.key as any)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${isActive ? t.accent : 'var(--border)'}`, background: isActive ? t.accent : 'var(--surface)', color: isActive ? '#fff' : 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                      <t.icon size={13} />
                      {t.label}
                      <span style={{ background: isActive ? 'rgba(255,255,255,0.25)' : t.bg, color: isActive ? '#fff' : t.accent, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>{t.count}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: 0 }}>
                {visibleAdminTasks.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>No matching tasks found.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '16px 20px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', maxHeight: 580, overflowY: 'auto' }}>
                    {visibleAdminTasks.map((t: any, idx: number) => {
                      const isAlerted = t.isAlerted;
                      const stripe = isAlerted ? 'var(--red)' : adminTaskTab === 'completed' ? 'var(--green)' : adminTaskTab === 'rejected' ? 'var(--rejected)' : 'var(--olive)';
                      const due = format(new Date(t.dueDate), 'EEE d MMM');
                      const todayStart = startOfDay(new Date());
                      const isOverdue = differenceInCalendarDays(startOfDay(new Date(t.dueDate)), todayStart) < 0;
                      const daysDiff = differenceInCalendarDays(startOfDay(new Date(t.dueDate)), todayStart);
                      
                      return (
                        <li key={t.id} onClick={() => t.client?.id && router.push(`/clients/${t.client.id}`)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 14, padding: '12px 20px', borderBottom: idx === visibleAdminTasks.length - 1 ? 'none' : '1px solid var(--surface-2)', cursor: 'pointer', background: isAlerted ? 'rgba(220, 38, 38, 0.05)' : 'transparent' }}>
                          <div style={{ background: stripe, borderRadius: 3 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>
                              <span style={{ color: 'var(--ink-2)', textTransform: 'none', fontWeight: 500 }}>{t.client?.brandName || t.client?.fullName || '—'}</span>
                              {t.step?.stepNumber && <><span>·</span><span style={{ color: 'var(--ink-2)', textTransform: 'none', fontWeight: 500 }}>Step {String(t.step.stepNumber).padStart(2, '0')} — {t.step?.name}</span></>}
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginTop: 3 }}>{t.title}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 2 }}>
                              Due: {due} {t.priority === 'high' && <span style={{ color: 'var(--red)', fontWeight: 600 }}>· High priority</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {adminTaskTab === 'active' && (
                              isOverdue ? <span style={badgeStyle('var(--red-bg)', 'var(--red)', '')}>+{Math.abs(daysDiff)}d</span>
                              : daysDiff === 0 ? <span style={badgeStyle('var(--amber-bg)', 'var(--amber)', '')}>TODAY</span>
                              : <span style={badgeStyle('var(--olive-50)', 'var(--olive-dark)', '')}>in {daysDiff}d</span>
                            )}
                            <span style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 500 }}>
                              {t.status === 'in_progress' ? 'In Progress' : t.status === 'complete' ? 'Completed' : t.status === 'pending' ? 'Pending' : t.status}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Right Column: Client Analysis with Graph */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>

            {/* Client Joins Over Time Chart */}
            <div style={{ position: 'relative', width: '100%', padding: '16px 20px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Client Growth Over Time</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Cumulative client onboarding (all-time)</div>
              </div>
              <div style={{ width: '100%', height: 180 }}>
                {(() => {
                  const { labels, data } = allTimeJoinData;
                  const maxVal = Math.max(...data, 10);
                  const minVal = 0;
                  const range = maxVal - minVal;
                  
                  const width = 500;
                  const height = 180;
                  const padding = 35;
                  
                  const chartWidth = width - padding * 2;
                  const chartHeight = height - padding * 2;
                  
                  const points = data.map((val, idx) => {
                    const x = padding + (idx / Math.max(1, data.length - 1)) * chartWidth;
                    const y = padding + chartHeight - ((val - minVal) / range) * chartHeight;
                    return { x, y, val, label: labels[idx] };
                  });
                  
                  const pathD = points.length > 0 
                    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
                    : '';
                    
                  const areaD = points.length > 0
                    ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
                    : '';

                  return (
                    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="adminChartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--olive)" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="var(--olive)" stopOpacity="0.00" />
                        </linearGradient>
                      </defs>
                      
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                        const y = padding + chartHeight * pct;
                        const val = Math.round(maxVal - pct * range);
                        return (
                          <g key={idx}>
                            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                            <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontWeight="600">{val}</text>
                          </g>
                        );
                      })}
                      
                      {/* Area Path */}
                      {areaD && <path d={areaD} fill="url(#adminChartGrad)" />}
                      
                      {/* Line Path */}
                      {pathD && <path d={pathD} fill="none" stroke="var(--olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                      
                      {/* Data Points */}
                      {points.map((p, idx) => (
                        <g key={idx} style={{ cursor: 'pointer' }}>
                          <circle cx={p.x} cy={p.y} r="4" fill="var(--surface)" stroke="var(--olive)" strokeWidth="2" />
                          <title>{`${p.label}: ${p.val} clients`}</title>
                        </g>
                      ))}
                      
                      {/* X Axis Labels */}
                      {points.map((p, idx) => {
                        const step = Math.ceil(points.length / 6);
                        if (idx % step !== 0 && idx !== points.length - 1) return null;
                        return (
                          <text key={idx} x={p.x} y={height - padding + 16} textAnchor="middle" fontSize="10" fill="var(--muted)" fontWeight="600">
                            {p.label}
                          </text>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>

            {/* Client Risk Analysis */}
            <SectionCard title="Client Risk Analysis" subtitle="Sorted by overdue duration" padding="0">
              <div style={{ padding: 0 }}>
                {sortedClientsForRisk.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>No active clients.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '16px 20px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', maxHeight: 350, overflowY: 'auto' }}>
                    {sortedClientsForRisk.map((client: any, idx: number) => {
                      const sc = getClientStatusStyles(client);
                      const stripe = sc.color;
                      return (
                        <li key={client.id} onClick={() => router.push(`/clients/${client.id}`)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 14, padding: '12px 20px', borderBottom: idx === sortedClientsForRisk.length - 1 ? 'none' : '1px solid var(--surface-2)', cursor: 'pointer', background: 'transparent' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <div style={{ background: stripe, borderRadius: 3 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{client.brandName || client.fullName}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 2 }}>
                              Current Step: <span style={{ fontWeight: 600 }}>{client.currentStep?.name || 'Unassigned'}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: sc.color, fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.color }} />
                              {sc.label}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Download size={14} /> Print PDF Report
                </button>
              </div>

            </div>
          </div>
        )}



        {showDeleteImportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 24 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteImportModal(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 450, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', overflow: 'hidden', padding: 24, gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>
                  <TriangleAlert size={18} />
                  <span>Confirm Purge CSV Data</span>
                </div>
                <button onClick={() => setShowDeleteImportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
              </div>

              <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                Are you sure you want to delete all client records (and their associated steps, tasks, documents, and history) that were uploaded via CSV or Excel imports?
                <br /><br />
                <strong style={{ color: 'var(--red)' }}>This action cannot be undone.</strong>
              </div>

              {deleteImportError && (
                <div style={{ background: '#FDF2F2', border: '1px solid #FDE8E8', borderRadius: 6, padding: '10px 14px', color: '#9B1C1C', fontSize: 13, fontWeight: 500 }}>
                  {deleteImportError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => setShowDeleteImportModal(false)}
                  disabled={isDeletingImport}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: isDeletingImport ? 'not-allowed' : 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteImportData}
                  disabled={isDeletingImport}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--red)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: isDeletingImport ? 'not-allowed' : 'pointer',
                    opacity: isDeletingImport ? 0.7 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {isDeletingImport ? 'Purging...' : 'Purge All Data'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

// ── Inline Styles ────────────────────────────────────────────────────────

const statCardStyle = (accent: string): React.CSSProperties => ({
  position: 'relative',
  background: 'var(--surface)',
  borderTop: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  borderLeft: `4px solid ${accent}`,
  borderRadius: 'var(--radius)',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 110,
  overflow: 'hidden',
  boxShadow: 'var(--shadow-sm)',
  transition: 'all 0.15s ease',
});

const statCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: 'var(--muted)',
};

const statCardValueContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginTop: 'auto',
};

const statCardValueStyle: React.CSSProperties = {
  fontFamily: 'Instrument Serif, serif',
  fontSize: 36,
  lineHeight: 1,
  color: 'var(--ink)',
};

const statCardSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
};

const attentionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
};

const badgeStyle = (bg: string, color: string, label: string): React.CSSProperties => ({
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 4,
  background: bg,
  color: color,
  minWidth: label.length <= 3 ? 24 : 'auto',
  textAlign: 'center',
});

const attentionMessageStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink-2)',
  flex: 1,
};

const attentionButtonStyle = (color: string, bg: string): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 700,
  color: color,
  background: bg,
  border: `1.5px solid ${color}`,
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'all 0.12s',
});

const notificationRowStyle = (isLast: boolean): React.CSSProperties => ({
  padding: '12px 16px',
  borderBottom: isLast ? 'none' : '1px solid var(--border)',
  background: 'var(--surface)',
});

const summaryCardStyle = (accent: string): React.CSSProperties => ({
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  boxShadow: 'var(--shadow-sm)',
  transition: 'border-color 0.15s, transform 0.15s',
});

const summaryLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: 'var(--muted)',
};

const summaryValueStyle: React.CSSProperties = {
  fontFamily: 'Instrument Serif, serif',
  fontSize: 28,
  lineHeight: 1,
  color: 'var(--ink)',
};
