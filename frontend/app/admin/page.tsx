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
  Sun, Moon, Shield, CheckCircle, Hourglass, Ban, Sparkles, Megaphone
} from 'lucide-react';
import { format } from 'date-fns';
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

  // Broadcast States
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'team' | 'user'>('all');
  const [broadcastTeam, setBroadcastTeam] = useState('');
  const [broadcastUser, setBroadcastUser] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastSuccess, setBroadcastSuccess] = useState('');

  const handleSendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      setBroadcastError('Please enter a message.');
      return;
    }
    if (broadcastTarget === 'team' && !broadcastTeam) {
      setBroadcastError('Please select a team.');
      return;
    }
    if (broadcastTarget === 'user' && !broadcastUser) {
      setBroadcastError('Please select a user.');
      return;
    }

    setBroadcastSending(true);
    setBroadcastError('');
    setBroadcastSuccess('');
    try {
      const body: any = {
        message: broadcastMessage.trim(),
        target: broadcastTarget,
      };
      if (broadcastTarget === 'team') {
        body.teamName = broadcastTeam;
      } else if (broadcastTarget === 'user') {
        body.userId = broadcastUser;
      }

      await apiFetch('/api/notifications/admin-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setBroadcastSuccess('Broadcast announcement sent successfully!');
      setBroadcastMessage('');
      setTimeout(() => {
        setShowBroadcastModal(false);
        setBroadcastSuccess('');
      }, 1500);
    } catch (e: any) {
      setBroadcastError(e.message || 'Failed to send broadcast announcement.');
    } finally {
      setBroadcastSending(false);
    }
  };

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
        bg: 'var(--amber-bg)',
        color: 'var(--amber)',
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
      />

      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Page Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: -4 }}>
          <button
            onClick={() => setShowBroadcastModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 14px',
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
            <Megaphone size={13} /> Broadcast Announcement
          </button>
        </div>
        
        {/* 3 Stat Cards in a row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {/* Card 1: Total Clients */}
          <div style={{
            ...statCardStyle('var(--olive)'),
            background: 'var(--olive-50)',
            borderColor: 'var(--olive)',
          }}>
            <div style={{ ...statCardHeaderStyle, color: 'var(--olive)' }}>
              <Users size={14} style={{ color: 'var(--olive)' }} />
              <span style={{ fontWeight: 800 }}>Total Clients</span>
            </div>
            <div style={statCardValueContainerStyle}>
              <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{totalClientsCount}</span>
              <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>Registered</span>
            </div>
          </div>

          {/* Card 2: Launched Clients */}
          <div style={{
            ...statCardStyle('var(--green)'),
            background: 'var(--green-bg)',
            borderColor: 'var(--green)',
          }}>
            <div style={{ ...statCardHeaderStyle, color: 'var(--green)' }}>
              <CheckCircle size={14} style={{ color: 'var(--green)' }} />
              <span style={{ fontWeight: 800 }}>Launched Clients</span>
            </div>
            <div style={statCardValueContainerStyle}>
              <span style={{ ...statCardValueStyle, color: 'var(--green)' }}>{launchedClientsCount}</span>
              <span style={{ ...statCardSubtitleStyle, color: 'var(--green)', opacity: 0.8 }}>Completed Step 9</span>
            </div>
          </div>

          {/* Card 3: Overdue - Clickable & Red Highlighted */}
          <div
            onClick={() => router.push('/clients?filter=overdue')}
            style={{
              ...statCardStyle('var(--red)'),
              background: 'var(--red-bg)',
              borderColor: 'var(--red)',
              cursor: 'pointer',
            }}
          >
            <div style={{ ...statCardHeaderStyle, color: 'var(--red)' }}>
              <TriangleAlert size={14} style={{ color: 'var(--red)' }} />
              <span style={{ fontWeight: 800 }}>Overdue</span>
            </div>
            <div style={statCardValueContainerStyle}>
              <span style={{ ...statCardValueStyle, color: 'var(--red)' }}>{overdueClientsCount}</span>
              <span style={{ ...statCardSubtitleStyle, color: 'var(--red)', opacity: 0.8 }}>Needs attention</span>
            </div>
          </div>
        </div>

        {/* Needs Attention Today Panel */}
        <div style={{
          border: '1.5px solid var(--amber)',
          borderLeft: '5px solid var(--amber)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface-2)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TriangleAlert size={16} style={{ color: 'var(--amber)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Needs Attention Today</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>— Immediate actions required to maintain service level agreements</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Critical Row */}
            <div style={attentionRowStyle}>
              <span style={badgeStyle('var(--red-bg)', 'var(--red)', 'CRITICAL')}>CRITICAL</span>
              <span style={attentionMessageStyle}>{attentionItems.critical.message}</span>
              <button
                onClick={() => router.push(attentionItems.critical.link)}
                style={attentionButtonStyle('var(--red)', 'var(--red-bg)')}
              >
                {attentionItems.critical.hasItems ? 'Resolve' : 'View'}
              </button>
            </div>

            {/* Warning Row */}
            <div style={attentionRowStyle}>
              <span style={badgeStyle('var(--amber-bg)', 'var(--amber)', 'WARNING')}>WARNING</span>
              <span style={attentionMessageStyle}>{attentionItems.warning.message}</span>
              <button
                onClick={() => router.push(attentionItems.warning.link)}
                style={attentionButtonStyle('var(--amber)', 'var(--amber-bg)')}
              >
                {attentionItems.warning.hasItems ? 'Resolve' : 'View'}
              </button>
            </div>

            {/* Info Row */}
            <div style={attentionRowStyle}>
              <span style={badgeStyle('var(--blue-bg)', 'var(--blue)', 'INFO')}>INFO</span>
              <span style={attentionMessageStyle}>{attentionItems.info.message}</span>
              <button
                onClick={() => router.push(attentionItems.info.link)}
                style={attentionButtonStyle('var(--blue)', 'var(--blue-bg)')}
              >
                {attentionItems.info.hasItems ? 'Resolve' : 'View'}
              </button>
            </div>
          </div>
        </div>

        {/* Client Risk Section (Full Width) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 400 }}>
          {/* Client Risk */}
          <SectionCard
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Activity size={15} style={{ color: 'var(--olive)' }} />
                Client Risk Analysis
              </span>
            }
            subtitle="Clients sorted by highest overdue duration"
            padding="0"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 450, padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 18px', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Client / Brand</th>
                    <th style={{ padding: '10px 18px', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Current Step</th>
                    <th style={{ padding: '10px 18px', fontSize: '11.5px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>Delay Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClientsForRisk.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '20px 18px', textAlign: 'center', color: 'var(--muted)' }}>
                        No active clients.
                      </td>
                    </tr>
                  ) : (
                    sortedClientsForRisk.map((client: any) => {
                      const sc = getClientStatusStyles(client);
                      return (
                        <tr
                          key={client.id}
                          onClick={() => router.push(`/clients/${client.id}`)}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--ink)' }}>
                            {client.brandName || client.fullName}
                          </td>
                          <td style={{ padding: '10px 18px', color: 'var(--ink-2)' }}>
                            {client.currentStep?.name || 'Unassigned'}
                          </td>
                          <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              background: sc.bg,
                              color: sc.color
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.color }} />
                              {sc.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
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

      {showBroadcastModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowBroadcastModal(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', overflow: 'hidden', padding: 24, gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                <Megaphone size={18} style={{ color: 'var(--olive)' }} />
                <span>Send Broadcast Announcement</span>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            {broadcastError && (
              <div style={{ background: '#FDF2F2', border: '1px solid #FDE8E8', borderRadius: 6, padding: '10px 14px', color: '#9B1C1C', fontSize: 13, fontWeight: 500 }}>
                {broadcastError}
              </div>
            )}

            {broadcastSuccess && (
              <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-100)', borderRadius: 6, padding: '10px 14px', color: 'var(--green)', fontSize: 13, fontWeight: 500 }}>
                {broadcastSuccess}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Target Audience</label>
              <select
                value={broadcastTarget}
                onChange={(e: any) => {
                  setBroadcastTarget(e.target.value);
                  setBroadcastError('');
                }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontSize: 13.5 }}
              >
                <option value="all">Broadcast to All Users</option>
                <option value="team">Specific Team</option>
                <option value="user">Specific User</option>
              </select>
            </div>

            {broadcastTarget === 'team' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Select Team</label>
                <select
                  value={broadcastTeam}
                  onChange={(e) => setBroadcastTeam(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontSize: 13.5 }}
                >
                  <option value="">-- Choose Team --</option>
                  {(teamsList as string[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {broadcastTarget === 'user' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Select User</label>
                <select
                  value={broadcastUser}
                  onChange={(e) => setBroadcastUser(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontSize: 13.5 }}
                >
                  <option value="">-- Choose User --</option>
                  {(usersList as any[]).filter((u: any) => u.isActive !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Announcement Message</label>
              <textarea
                placeholder="Type your broadcast announcement here..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                rows={4}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none', fontSize: 13.5, resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setShowBroadcastModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendBroadcast}
                disabled={broadcastSending}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--olive)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: broadcastSending ? 0.7 : 1
                }}
              >
                {broadcastSending ? 'Sending...' : 'Send Announcement'}
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
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 110,
  overflow: 'hidden',
  boxShadow: 'var(--shadow-sm)',
  transition: 'border-color 0.15s, transform 0.15s',
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
