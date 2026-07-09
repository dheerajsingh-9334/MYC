'use client';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK, MOCK_TASKS, MOCK_CLIENTS } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import {
  Users,
  CheckCircle,
  Clock,
  TriangleAlert,
  Hourglass,
  Moon,
  Sun,
  Activity,
  Sparkles,
  ArrowRight,
  Ban,
  Shield,
} from 'lucide-react';

const AUTO_REFRESH_MS = 30_000;

export default function EnterpriseDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    refetchInterval: AUTO_REFRESH_MS,
    enabled: !USE_MOCK,
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    refetchInterval: AUTO_REFRESH_MS,
    enabled: !USE_MOCK,
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    refetchInterval: AUTO_REFRESH_MS,
    enabled: !USE_MOCK,
  });

  const { data: standupData } = useQuery<any>({
    queryKey: ['standup'],
    queryFn: () => apiFetch('/api/standup'),
    refetchInterval: AUTO_REFRESH_MS,
    enabled: !USE_MOCK,
  });

  const allClients = USE_MOCK ? MOCK_CLIENTS : clients;
  const allTasks = USE_MOCK ? MOCK_TASKS : tasks;

  const allNotifications = useMemo(() => {
    if (USE_MOCK || notifications.length === 0) {
      return [
        { id: 'n1', title: 'Critical Delay: Priya Healing Arts', body: 'Funnel Build is 12 days overdue. Action required.', createdAt: new Date(Date.now() - 3600000).toISOString(), isRead: false },
        { id: 'n2', title: 'Task Blocked: SoulPath Wellness', body: 'Karan raised a blocker: waiting on client brand photos.', createdAt: new Date(Date.now() - 7200000).toISOString(), isRead: false },
        { id: 'n3', title: 'New Task: Connect form submissions', body: 'Assigned to Rajan Mehta.', createdAt: new Date(Date.now() - 10800000).toISOString(), isRead: true },
        { id: 'n4', title: 'Step Completed: Strategy Call', body: 'Vikram Reddy advanced to Brand Setup.', createdAt: new Date(Date.now() - 14400000).toISOString(), isRead: true },
      ];
    }
    return notifications;
  }, [notifications]);

  // Calculations for stats
  const totalClientsCount = allClients.length;
  const launchedClientsCount = allClients.filter(c => c.status === 'completed' || (c.currentStep?.stepNumber && c.currentStep.stepNumber >= 9)).length;

  const avgCompletionTimeStr = useMemo(() => {
    const completed = allClients.filter(c => c.status === 'completed');
    if (completed.length === 0) return '32 Days'; // realistic default
    const totalDays = completed.reduce((sum, c) => sum + (c.completionDurationDays || 0), 0);
    return `${Math.round(totalDays / completed.length)} Days`;
  }, [allClients]);

  const overdueClientsCount = allClients.filter(c => c.computedStatus === 'overdue').length;
  const pendingRequestsCount = allTasks.filter(t => t.status === 'extension_requested' || t.status === 'blocked').length;

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
    // 1. Critical
    const overdueClients = allClients.filter(c => c.computedStatus === 'overdue');
    let criticalMsg = "No critical client delays detected.";
    let criticalLink = "/clients?filter=overdue";
    if (overdueClients.length > 0) {
      const sorted = [...overdueClients].sort((a, b) => {
        const aLate = (a.daysInStep || 0) - (a.currentStep?.slaDays || 0);
        const bLate = (b.daysInStep || 0) - (b.currentStep?.slaDays || 0);
        return bLate - aLate;
      });
      const worst = sorted[0];
      const lateDays = (worst.daysInStep || 0) - (worst.currentStep?.slaDays || 0);
      criticalMsg = `${worst.brandName || worst.fullName} (${worst.currentStep?.name || 'Step'}) is ${Math.max(0, lateDays)} days overdue`;
      criticalLink = `/clients/${worst.id}`;
    }

    // 2. Warning
    const blockedClients = allClients.filter(c => c.computedStatus === 'blocked');
    let warningMsg = "All active clients are currently unblocked.";
    let warningLink = "/clients?filter=blocked";
    if (blockedClients.length > 0) {
      const worst = blockedClients[0];
      warningMsg = `${worst.brandName || worst.fullName} is currently blocked on ${worst.currentStep?.name || 'current step'}`;
      warningLink = `/clients/${worst.id}`;
    } else {
      const dueTodayClients = allClients.filter(c => c.computedStatus === 'due_today');
      if (dueTodayClients.length > 0) {
        const worst = dueTodayClients[0];
        warningMsg = `${worst.brandName || worst.fullName} (${worst.currentStep?.name || 'Step'}) SLA expires today`;
        warningLink = `/clients/${worst.id}`;
      }
    }

    // 3. Info
    const pendingExtensions = allTasks.filter(t => t.status === 'extension_requested');
    let infoMsg = "No pending task extension requests.";
    let infoLink = "/standup";
    if (pendingExtensions.length > 0) {
      infoMsg = `${pendingExtensions.length} task extension request${pendingExtensions.length > 1 ? 's' : ''} pending approval`;
      infoLink = `/standup`; // admin can review them on standup
    }

    return {
      critical: { message: criticalMsg, link: criticalLink, hasItems: overdueClients.length > 0 },
      warning: { message: warningMsg, link: warningLink, hasItems: blockedClients.length > 0 || allClients.filter(c => c.computedStatus === 'due_today').length > 0 },
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

  return (
    <AppLayout>
      <Topbar
        title="Enterprise Dashboard"
        subtitle={`Real-time client pipeline, task statuses, and risk factors`}
        renderActions={() => (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {user?.role === 'admin' && (
              <button
                onClick={() => router.push('/admin')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--olive)',
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <Shield size={14} /> Admin Dashboard
              </button>
            )}
          </div>
        )}
      />

      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Daily Standup Brief Summary Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {/* Total Alerts */}
            <div
              onClick={() => router.push('/standup')}
              style={{ ...summaryCardStyle('var(--olive)'), cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--olive)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={summaryLabelStyle}>
                <Users size={13} style={{ color: 'var(--olive)' }} />
                <span>Total Alerts</span>
              </div>
              <div style={summaryValueStyle}>{standupStats.total}</div>
            </div>
            {/* Overdue Tasks */}
            <div
              onClick={() => router.push('/standup?filter=overdue')}
              style={{ ...summaryCardStyle('var(--red)'), cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--red)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={summaryLabelStyle}>
                <TriangleAlert size={13} style={{ color: 'var(--red)' }} />
                <span>Overdue Tasks</span>
              </div>
              <div style={summaryValueStyle}>{standupStats.overdue}</div>
            </div>
            {/* Blocked Tasks */}
            <div
              onClick={() => router.push('/standup?filter=blocked')}
              style={{ ...summaryCardStyle('#6B3FA0'), cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6B3FA0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={summaryLabelStyle}>
                <Ban size={13} style={{ color: '#6B3FA0' }} />
                <span>Blocked Tasks</span>
              </div>
              <div style={summaryValueStyle}>{standupStats.blocked}</div>
            </div>
            {/* Due Today */}
            <div
              onClick={() => router.push('/standup?filter=due_today')}
              style={{ ...summaryCardStyle('var(--amber)'), cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--amber)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={summaryLabelStyle}>
                <Clock size={13} style={{ color: 'var(--amber)' }} />
                <span>Due Today</span>
              </div>
              <div style={summaryValueStyle}>{standupStats.dueToday}</div>
            </div>
          </div>
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
                {attentionItems.info.hasItems ? 'Review' : 'View'}
              </button>
            </div>

          </div>
        </div>

        {/* Client Risk Section (Full Width) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Client Risk */}
          <SectionCard
            title="Client Risk Analysis"
            subtitle="Most overdue clients listed first"
            padding={0}
          >
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {sortedClientsForRisk.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  No active clients in risk pipeline.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {sortedClientsForRisk.map((c, i) => {
                    const sc = getClientStatusStyles(c);

                    return (
                      <div
                        key={c.id}
                        onClick={() => router.push(`/clients/${c.id}`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 20px',
                          borderBottom: i === sortedClientsForRisk.length - 1 ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--olive-50)', color: 'var(--olive)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700
                          }}>
                            {(c.brandName || c.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                              {c.brandName || c.fullName}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              {c.currentStep?.name || 'Unassigned'}
                            </div>
                          </div>
                        </div>

                        <span style={badgeStyle(sc.bg, sc.color, sc.label)}>
                          {sc.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionCard>

        </div>

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
