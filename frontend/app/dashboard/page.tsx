'use client';
import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK, MOCK_TASKS } from '@/lib/mockData';
import { useRouter } from 'next/navigation';
import {
  ListChecks,
  CircleCheck,
  XCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  Check,
  Clock,
  TriangleAlert,
  Hourglass,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Play,
  Pause,
} from 'lucide-react';
import {
  differenceInCalendarDays,
  format,
  startOfDay,
  addDays,
  isPast,
  isToday,
} from 'date-fns';

const AUTO_REFRESH_MS = 30_000;

type TabKey = 'active' | 'completed' | 'rejected';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('active');
  const [showDueDrawer, setShowDueDrawer] = useState(false);
  const [blockerTask, setBlockerTask] = useState<any | null>(null);
  const [blockerNote, setBlockerNote] = useState('');
  const [extensionTask, setExtensionTask] = useState<any | null>(null);
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionDate, setExtensionDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeTooltipDate, setActiveTooltipDate] = useState<string | null>(null);

  const { data: liveTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: !USE_MOCK,
  });

  const { data: liveNotifications = [] } = useQuery<Array<{ id: string; title: string; body?: string | null; createdAt: string; isRead: boolean }>>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: !USE_MOCK,
  });

  // Server already scopes team_member/team_leader to their own tasks.
  // For admins the API returns the whole org's tasks, so we filter the
  // dashboard view to only show the admin's own assignments.
  const myTasks = useMemo(() => {
    const tasks = (USE_MOCK ? MOCK_TASKS : (liveTasks as any[])) || [];
    if (!user) return tasks as any[];
    return tasks.filter((t: any) => {
      const assigneeId = t.assignedToId || t.assignedTo?.id;
      if (assigneeId) return assigneeId === user.id;
      return t.assignedTo?.fullName === user.fullName;
    });
  }, [liveTasks, user]);

  const grouped = useMemo(() => {
    const active: any[] = [];
    const completed: any[] = [];
    const rejected: any[] = [];

    for (const t of myTasks) {
      if (t.status === 'complete') {
        completed.push(t);
        continue;
      }
      if (t.status === 'rejected' || t.status === 'cancelled') {
        rejected.push(t);
        continue;
      }
      // Annotate active tasks with daysLate/daysAhead for the row chip
      const today = startOfDay(new Date());
      const due = startOfDay(new Date(t.dueDate));
      const diff = differenceInCalendarDays(due, today);
      active.push({
        ...t,
        _daysLate: diff < 0 ? Math.abs(diff) : 0,
        _daysAhead: diff >= 0 ? diff : 0,
        _isDueToday: diff === 0,
      });
    }

    active.sort((a, b) => {
      // Overdue first (most late), then due today, then upcoming (soonest first)
      if (a._daysLate !== b._daysLate) return b._daysLate - a._daysLate;
      if (a._isDueToday !== b._isDueToday) return a._isDueToday ? -1 : 1;
      return a._daysAhead - b._daysAhead;
    });
    completed.sort((a, b) => {
      const ad = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bd = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bd - ad;
    });
    rejected.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

    return { active, completed, rejected };
  }, [myTasks]);

  // Re-open a rejected task — sets it back to in_progress for the assignee
  const reopenMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/reopen`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/complete`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const blockerMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/api/tasks/${id}/blocker`, { method: 'PATCH', body: JSON.stringify({ blockerNote: note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setBlockerTask(null);
      setBlockerNote('');
    },
  });

  const extensionMut = useMutation({
    mutationFn: ({ id, requestedDate, reason }: { id: string; requestedDate: string; reason: string }) =>
      apiFetch(`/api/tasks/${id}/extension`, {
        method: 'PATCH',
        body: JSON.stringify({ extensionRequestedDate: requestedDate, extensionReason: reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setExtensionTask(null);
      setExtensionReason('');
      setExtensionDate(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
    },
  });

  const startTimerMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/start-timer`, { method: 'PATCH' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);

      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => {
          if (t.id === id) {
            return {
              ...t,
              status: 'in_progress',
              isTimerRunning: true,
              timerStartedAt: new Date().toISOString(),
            };
          }
          return t;
        });
      });

      return { previousTasks };
    },
    onError: (err, id, context: any) => {
      if (context?.previousTasks) {
        qc.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const stopTimerMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/stop-timer`, { method: 'PATCH' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);

      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => {
          if (t.id === id) {
            let addedSeconds = 0;
            if (t.timerStartedAt) {
              addedSeconds = Math.max(0, Math.floor((Date.now() - new Date(t.timerStartedAt).getTime()) / 1000));
            }
             return {
              ...t,
              status: 'pending',
              isTimerRunning: false,
              timerStartedAt: null,
              timeSpentSeconds: t.timeSpentSeconds + addedSeconds,
            };
          }
          return t;
        });
      });

      return { previousTasks };
    },
    onError: (err, id, context: any) => {
      if (context?.previousTasks) {
        qc.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previousTasks = qc.getQueryData(['tasks']);

      qc.setQueryData(['tasks'], (old: any) => {
        if (!old) return old;
        return old.map((t: any) => {
          if (t.id === id) {
            let data = { ...t, status };
            if (status === 'in_progress') {
              if (!t.isTimerRunning) {
                data.isTimerRunning = true;
                data.timerStartedAt = new Date().toISOString();
              }
            } else {
              if (t.isTimerRunning) {
                let addedSeconds = 0;
                if (t.timerStartedAt) {
                  addedSeconds = Math.max(0, Math.floor((Date.now() - new Date(t.timerStartedAt).getTime()) / 1000));
                }
                data.isTimerRunning = false;
                data.timerStartedAt = null;
                data.timeSpentSeconds = t.timeSpentSeconds + addedSeconds;
              }
            }
            return data;
          }
          return t;
        });
      });

      return { previousTasks };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousTasks) {
        qc.setQueryData(['tasks'], context.previousTasks);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // ── Progress snapshot ────────────────────────────────────────────────
  const completionRate = useMemo(() => {
    const total = myTasks.length;
    if (total === 0) return 0;
    return Math.round((grouped.completed.length / total) * 100);
  }, [myTasks, grouped]);

  const avgCompletionTimeStr = useMemo(() => {
    const completedTasks = grouped.completed;
    const timedTasks = completedTasks.filter(t => t.timeSpentSeconds > 0);
    const tasksToUse = timedTasks.length > 0 ? timedTasks : completedTasks;
    if (tasksToUse.length === 0) return '—';

    let totalMs = 0;
    if (timedTasks.length > 0) {
      for (const t of timedTasks) {
        totalMs += t.timeSpentSeconds * 1000;
      }
    } else {
      let validCount = 0;
      for (const t of completedTasks) {
        if (t.createdAt && t.completedAt) {
          totalMs += new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
          validCount++;
        }
      }
      if (validCount === 0) return '—';
    }
    const avgMs = totalMs / tasksToUse.length;
    const avgDays = avgMs / (1000 * 60 * 60 * 24);
    if (avgDays >= 1) {
      return `${avgDays.toFixed(1)}d`;
    }
    const avgHours = avgMs / (1000 * 60 * 60);
    if (avgHours >= 1) {
      return `${avgHours.toFixed(1)}h`;
    }
    const avgMins = avgMs / (1000 * 60);
    if (avgMins >= 1) {
      return `${avgMins.toFixed(1)}m`;
    }
    return `${Math.round(avgMs / 1000)}s`;
  }, [grouped.completed]);

  const taskStats = useMemo(() => {
    const today = startOfDay(new Date());
    const weekStart = startOfDay(addDays(today, -6));
    const active = grouped.active;
    const completedToday = grouped.completed.filter((t) => t.completedAt && startOfDay(new Date(t.completedAt)).getTime() === today.getTime());
    const completedWeek = grouped.completed.filter((t) => t.completedAt && new Date(t.completedAt) >= weekStart);
    const onTimeWeek = completedWeek.filter((t) => t.completedAt && new Date(t.completedAt) <= new Date(t.dueDate));
    return {
      active: active.length,
      dueToday: active.filter((t) => t._isDueToday).length,
      overdue: active.filter((t) => t._daysLate > 0).length,
      completedToday: completedToday.length,
      completedWeek: completedWeek.length,
      onTimePct: completedWeek.length > 0 ? Math.round((onTimeWeek.length / completedWeek.length) * 100) : completionRate,
      pending: active.length,
    };
  }, [grouped, completionRate]);

  const calendarItems = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(addDays(today, 1));
    const active = grouped.active;
    return {
      today: active.filter((t) => startOfDay(new Date(t.dueDate)).getTime() === today.getTime()).slice(0, 5),
      tomorrow: active.filter((t) => startOfDay(new Date(t.dueDate)).getTime() === tomorrow.getTime()).slice(0, 5),
    };
  }, [grouped.active]);

  const notificationItems = USE_MOCK
    ? [
        { id: 'mn1', title: 'New task assigned', body: 'Landing Page', createdAt: new Date().toISOString(), isRead: false },
        { id: 'mn2', title: 'Deadline approved', body: 'Strategy Call moved', createdAt: new Date(Date.now() - 35 * 60000).toISOString(), isRead: true },
        { id: 'mn3', title: 'Step completed', body: 'Brand Setup', createdAt: new Date(Date.now() - 80 * 60000).toISOString(), isRead: true },
      ]
    : liveNotifications;

  const tabs: { key: TabKey; label: string; count: number; icon: any; accent: string; bg: string }[] = [
    { key: 'active',    label: 'My Tasks',   count: grouped.active.length,    icon: ListChecks, accent: 'var(--olive)', bg: 'var(--olive-50)' },
    { key: 'completed', label: 'Completed',  count: grouped.completed.length, icon: CircleCheck, accent: 'var(--green)', bg: 'var(--green-bg)' },
    { key: 'rejected',  label: 'Rejected',   count: grouped.rejected.length,  icon: XCircle,     accent: '#B0436A',     bg: '#FBEEF1' },
  ];

  const activeTab = tabs.find((t) => t.key === tab)!;
  const allVisible =
    tab === 'active' ? grouped.active :
    tab === 'completed' ? grouped.completed :
    grouped.rejected;

  // Search & Filter state
  const [taskSearch, setTaskSearch] = useState('');
  useEffect(() => { setTaskLimit(15); }, [tab, taskSearch]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return allVisible;
    const q = taskSearch.toLowerCase();
    return allVisible.filter((t: any) => {
      const titleMatch = t.title?.toLowerCase().includes(q);
      const clientMatch = (t.client?.brandName || t.client?.fullName || '').toLowerCase().includes(q);
      const stepMatch = t.step?.name?.toLowerCase().includes(q);
      return titleMatch || clientMatch || stepMatch;
    });
  }, [allVisible, taskSearch]);

  // Scrolling — infinite scroll
  const [taskLimit, setTaskLimit] = useState(15);
  const scrollableTasks = useMemo(() => {
    return filteredTasks.slice(0, taskLimit);
  }, [filteredTasks, taskLimit]);

  const handleTaskScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setTaskLimit(prev => Math.min(prev + 10, filteredTasks.length));
    }
  };

  return (
    <AppLayout>
      <Topbar title="Dashboard" subtitle={`${user?.fullName || 'You'} · ${grouped.active.length} active · ${grouped.completed.length} completed`} />
      <div style={{ padding: '16px 20px', flex: 1 }}>

        {/* Top metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Left: My Tasks Stats */}
          <SectionCard title="My Tasks" padding="14px 16px">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <ProgressMetric label="Completed" value={grouped.completed.length} color="var(--green)" />
              <ProgressMetric label="Rejected" value={grouped.rejected.length} color="#B0436A" />
              <ProgressMetric label="Pending" value={grouped.active.length} color="var(--olive)" />
            </div>
          </SectionCard>

          {/* Right: My Progress Stats */}
          <SectionCard title="My Progress" padding="14px 16px">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <ProgressMetric label="Avg. Time to Complete" value={avgCompletionTimeStr} color="var(--green)" />
            </div>
          </SectionCard>
        </div>

        {/* Filter tabs (placed outside/above the split grid for starting alignment) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {tabs.map((t) => {
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? t.accent : 'var(--border)'}`,
                  background: isActive ? t.accent : 'var(--surface)',
                  color: isActive ? '#fff' : 'var(--ink-2)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <t.icon size={13} />
                {t.label}
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : t.bg,
                  color: isActive ? '#fff' : t.accent,
                  fontSize: 11, fontWeight: 700,
                  padding: '1px 8px', borderRadius: 999,
                }}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Split Layout: 70% Tasks (Left) and 30% Calendar (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 16, alignItems: 'stretch' }}>
          
          {/* Left 70% Column */}
          <div>
            <SectionCard
              title="My Tasks"
              subtitle="Overdue, due today, and upcoming"
              style={{ height: 540, display: 'flex', flexDirection: 'column' }}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--muted)' }} />
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      style={{
                        padding: '5px 8px 5px 26px',
                        fontSize: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        outline: 'none',
                        background: 'var(--surface-2)',
                        color: 'var(--ink)',
                        width: 140,
                        transition: 'all 0.15s',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.width = '180px'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.width = '140px'; }}
                    />
                  </div>
                  <button
                    onClick={() => router.push('/tasks')}
                    style={{ fontSize: 12, fontWeight: 500, color: 'var(--olive)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    Open full task manager <ArrowRight size={12} />
                  </button>
                </div>
              }
              padding={0}
            >
              {scrollableTasks.length === 0 ? (
                <EmptyState
                  accent={activeTab.accent}
                  icon={activeTab.icon}
                  title="All clear"
                  message={
                    tab === 'active' ? 'No matching active tasks found.' :
                    tab === 'completed' ? 'No matching completed tasks found.' :
                    'No matching rejected tasks found.'
                  }
                />
              ) : (
                <>
                  <ul
                    onScroll={handleTaskScroll}
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '16px 20px 20px',
                      flex: 1,
                      minHeight: 0,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    {scrollableTasks.map((t, idx) => {
                      const stripe = tab === 'completed' ? 'var(--green)' : tab === 'rejected' ? '#B0436A' : 'var(--olive)';
                      const due = format(new Date(t.dueDate), 'EEE d MMM');
                      const completedAt = t.completedAt ? format(new Date(t.completedAt), "d MMM, h:mma") : null;
                      const whenLabel = tab === 'completed' && completedAt ? completedAt : due;
                      const isReopening = reopenMut.isPending && reopenMut.variables === t.id;

                      const timeTook = (() => {
                        if (tab !== 'completed' || !t.createdAt || !t.completedAt) return '';
                        const ms = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
                        const days = ms / (1000 * 60 * 60 * 24);
                        if (days >= 1) {
                          return `Took ${days.toFixed(1)}d`;
                        }
                        const hours = ms / (1000 * 60 * 60);
                        if (hours >= 1) {
                          return `Took ${hours.toFixed(1)}h`;
                        }
                        const mins = ms / (1000 * 60);
                        return `Took ${Math.round(mins)}m`;
                      })();

                      return (
                        <li
                          key={t.id || idx}
                          onClick={() => t.client?.id && router.push(`/clients/${t.client.id}`)}
                          style={{
                            position: 'relative',
                            display: 'grid',
                            gridTemplateColumns: '3px 1fr auto',
                            gap: 14,
                            padding: '12px 20px',
                            borderBottom: idx === scrollableTasks.length - 1 ? 'none' : '1px solid var(--surface-2)',
                            cursor: 'pointer',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <div style={{ background: stripe, borderRadius: 3 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase', color: 'var(--muted)' }}>
                              <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                                {t.client?.brandName || t.client?.fullName || '—'}
                              </span>
                              {t.step?.stepNumber && (
                                <>
                                  <span>·</span>
                                  <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                                    Step {String(t.step.stepNumber).padStart(2, '0')} — {t.step?.name}
                                  </span>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.title}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', marginTop: 2 }}>
                              {tab === 'completed' ? 'Completed' : 'Due'}: {whenLabel}
                              {tab === 'completed' && timeTook && (
                                <span style={{ color: 'var(--olive-dark)', marginLeft: 8, fontWeight: 600 }}>· {timeTook}</span>
                              )}
                              {t.priority === 'high' && tab !== 'completed' && tab !== 'rejected' && (
                                <span style={{ color: 'var(--red)', marginLeft: 8, fontWeight: 600 }}>· High priority</span>
                              )}
                              {tab !== 'completed' && (t.status === 'in_progress' || t.timeSpentSeconds > 0) && (
                                <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                  · Status: <span style={{ fontWeight: 600, color: t.status === 'in_progress' ? 'var(--olive)' : 'var(--muted)' }}>
                                    {t.status === 'in_progress' ? 'In Progress' : t.status}
                                  </span>
                                  <TaskTimer
                                    isTimerRunning={t.isTimerRunning}
                                    timerStartedAt={t.timerStartedAt}
                                    timeSpentSeconds={t.timeSpentSeconds}
                                  />
                                  {t.status === 'in_progress' && (
                                    t.isTimerRunning ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); stopTimerMut.mutate(t.id); }}
                                        title="Pause timer"
                                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                      >
                                        <Pause size={12} style={{ color: 'var(--amber)' }} />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); startTimerMut.mutate(t.id); }}
                                        title="Resume timer"
                                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                      >
                                        <Play size={12} style={{ color: 'var(--green)' }} />
                                      </button>
                                    )
                                  )}
                                </span>
                              )}
                            </div>
                            {tab === 'rejected' && (t.rejectionNote || t.blockerNote) && (
                              <div style={{ fontSize: 11.5, color: '#B0436A', marginTop: 4, fontStyle: 'italic' }}>
                                "{(t.rejectionNote || t.blockerNote).slice(0, 100)}{(t.rejectionNote || t.blockerNote).length > 100 ? '…' : ''}"
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {tab === 'active' && (
                              t._daysLate > 0 ? (
                                <span style={chipStyle('var(--red-bg)', 'var(--red)')}>+{t._daysLate}d</span>
                              ) : t._isDueToday ? (
                                <span style={chipStyle('var(--amber-bg)', 'var(--amber)')}>TODAY</span>
                              ) : (
                                <span style={chipStyle('var(--olive-50)', 'var(--olive-dark)')}>in {t._daysAhead}d</span>
                              )
                            )}
                            {tab === 'completed' && (
                              <span style={chipStyle('var(--green-bg)', 'var(--green)')}>DONE</span>
                            )}
                            {tab === 'rejected' && (
                              <span style={chipStyle('#FBEEF1', '#B0436A')}>REJECTED</span>
                            )}
                            {tab === 'rejected' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); reopenMut.mutate(t.id); }}
                                disabled={isReopening}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '5px 10px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  background: 'var(--surface)',
                                  color: 'var(--ink-2)',
                                  fontSize: 11.5, fontWeight: 500,
                                  cursor: isReopening ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <RotateCcw size={11} />
                                {isReopening ? 'Reopening…' : 'Reopen'}
                              </button>
                            )}
                            {tab === 'active' && (
                              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={t.status}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'in_progress') {
                                      startTimerMut.mutate(t.id);
                                    } else if (val === 'pending') {
                                      statusMut.mutate({ id: t.id, status: 'pending' });
                                    } else if (val === 'complete') {
                                      completeMut.mutate(t.id);
                                    } else if (val === 'blocked') {
                                      setBlockerTask(t);
                                      setBlockerNote('');
                                    } else if (val === 'extension_requested') {
                                      setExtensionTask(t);
                                      setExtensionReason('');
                                      setExtensionDate(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    color: 'var(--ink-2)',
                                    fontSize: 11.5,
                                    fontWeight: 500,
                                    outline: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="complete">Complete...</option>
                                  <option value="blocked">Blocked...</option>
                                  <option value="extension_requested">Request Extension...</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </SectionCard>
          </div>

          {/* Right 30% Column */}
          <div>
            <SectionCard
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CalendarDays size={15} style={{ color: 'var(--olive)' }} />
                    My Calendar
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, fontStyle: 'italic', color: 'var(--ink)' }}>
                      {format(currentDate, 'MMMM yyyy')}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'var(--surface)',
                          color: 'var(--ink-2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        onClick={() => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'var(--surface)',
                          color: 'var(--ink-2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              }
              padding="16px 18px"
              style={{ height: 540, display: 'flex', flexDirection: 'column', overflow: 'visible' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Weekday labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                  {(() => {
                    const year = currentDate.getFullYear();
                    const month = currentDate.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const startDayOfWeek = firstDay.getDay();
                    const daysList: Date[] = [];
                    
                    const prevMonthEnd = new Date(year, month, 0).getDate();
                    for (let i = startDayOfWeek - 1; i >= 0; i--) {
                      daysList.push(new Date(year, month - 1, prevMonthEnd - i));
                    }
                    
                    const lastDay = new Date(year, month + 1, 0).getDate();
                    for (let i = 1; i <= lastDay; i++) {
                      daysList.push(new Date(year, month, i));
                    }
                    
                    const totalSlots = Math.ceil(daysList.length / 7) * 7;
                    const nextMonthPadding = totalSlots - daysList.length;
                    for (let i = 1; i <= nextMonthPadding; i++) {
                      daysList.push(new Date(year, month + 1, i));
                    }

                    const todayStart = startOfDay(new Date());

                    return daysList.map((day, idx) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const dYear = day.getFullYear();
                      const dMonth = day.getMonth();
                      const dDate = day.getDate();
                      
                      const dayTasks = myTasks.filter((t: any) => {
                        const tDate = new Date(t.dueDate);
                        return tDate.getFullYear() === dYear && tDate.getMonth() === dMonth && tDate.getDate() === dDate;
                      });

                      const isCurrentMonth = day.getMonth() === month;
                      const isDayToday = isToday(day);

                      const hasOverdue = dayTasks.some(t => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && differenceInCalendarDays(startOfDay(new Date(t.dueDate)), todayStart) < 0);
                      const hasBlocked = dayTasks.some(t => t.status === 'blocked');
                      const hasRejected = dayTasks.some(t => t.status === 'rejected' || t.status === 'cancelled');
                      const hasPending = dayTasks.some(t => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && t.status !== 'blocked');
                      const allComplete = dayTasks.length > 0 && dayTasks.every(t => t.status === 'complete');

                      let boxBg = isDayToday ? 'var(--olive-50)' : isCurrentMonth ? 'var(--surface)' : 'var(--surface-2)';
                      let boxBorder = activeTooltipDate === dateStr ? '1px solid var(--olive)' : '1px solid var(--border)';
                      let textColor = isDayToday ? 'var(--olive-dark)' : 'var(--ink-2)';
                      let textWeight = isDayToday ? 800 : 500;

                      if (dayTasks.length > 0) {
                        textWeight = 700;
                        if (hasOverdue) {
                          boxBg = '#FDF2F2';
                          boxBorder = activeTooltipDate === dateStr ? '1px solid var(--red)' : '1px solid #FDE8E8';
                          textColor = 'var(--red)';
                        } else if (hasBlocked) {
                          boxBg = '#F6F0FD';
                          boxBorder = activeTooltipDate === dateStr ? '1px solid #6B3FA0' : '1px solid #EADCF9';
                          textColor = '#6B3FA0';
                        } else if (hasRejected) {
                          boxBg = '#FDF2F5';
                          boxBorder = activeTooltipDate === dateStr ? '1px solid #B0436A' : '1px solid #FCE4EC';
                          textColor = '#B0436A';
                        } else if (hasPending) {
                          boxBg = '#FEFBF0';
                          boxBorder = activeTooltipDate === dateStr ? '1px solid #C99A2E' : '1px solid #FDF6B2';
                          textColor = '#C99A2E';
                        } else if (allComplete) {
                          boxBg = '#F3FAF4';
                          boxBorder = activeTooltipDate === dateStr ? '1px solid var(--green)' : '1px solid #DEF7EC';
                          textColor = 'var(--green)';
                        }
                      }

                      const colIdx = idx % 7;
                      let tooltipStyle: React.CSSProperties = {
                        position: 'absolute',
                        bottom: idx < 14 ? 'auto' : '105%',
                        top: idx < 14 ? '105%' : 'auto',
                        width: 230,
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 100,
                        pointerEvents: 'none',
                        color: 'var(--ink)'
                      };
                      if (colIdx <= 1) {
                        tooltipStyle.left = 0;
                      } else if (colIdx >= 5) {
                        tooltipStyle.right = 0;
                        tooltipStyle.left = 'auto';
                      } else {
                        tooltipStyle.left = '50%';
                        tooltipStyle.transform = 'translateX(-50%)';
                      }

                      return (
                        <div
                          key={dateStr || idx}
                          onMouseEnter={() => setActiveTooltipDate(dateStr)}
                          onMouseLeave={() => setActiveTooltipDate(null)}
                          style={{
                            position: 'relative',
                            aspectRatio: '1',
                            border: boxBorder,
                            borderRadius: 6,
                            background: boxBg,
                            padding: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: isCurrentMonth ? 1 : 0.45,
                            boxShadow: activeTooltipDate === dateStr 
                              ? '0 4px 12px var(--shadow-sm), 0 0 0 2px var(--olive-50)' 
                              : isDayToday ? '0 0 0 2px var(--olive-light)' : 'none',
                            transform: activeTooltipDate === dateStr ? 'translateY(-2px)' : 'none',
                            transition: 'all 0.15s ease-in-out',
                            cursor: 'pointer',
                            zIndex: activeTooltipDate === dateStr ? 50 : 1
                          }}
                        >
                          <span style={{
                            fontSize: 12,
                            fontWeight: textWeight,
                            color: textColor,
                            lineHeight: 1
                          }}>
                            {day.getDate()}
                          </span>

                          {activeTooltipDate === dateStr && dayTasks.length > 0 && (
                            <div style={tooltipStyle}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                                {format(day, 'EEE, d MMM yyyy')}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {dayTasks.map(t => {
                                  const isOverdue = t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && differenceInCalendarDays(startOfDay(new Date(t.dueDate)), todayStart) < 0;
                                  let statusText = t.status.replace('_', ' ');
                                  let statusColor = 'var(--muted)';
                                  
                                  if (t.status === 'complete') {
                                    statusColor = 'var(--green)';
                                  } else if (t.status === 'rejected' || t.status === 'cancelled') {
                                    statusColor = '#B0436A';
                                  } else if (t.status === 'blocked') {
                                    statusColor = '#6B3FA0';
                                  } else if (isOverdue) {
                                    statusColor = 'var(--red)';
                                    statusText = 'overdue';
                                  } else {
                                    statusColor = '#C99A2E';
                                  }

                                  return (
                                    <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
                                        {t.title}
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                                        <span>{t.client?.brandName || t.client?.fullName || 'Client'}</span>
                                        <span style={{ color: statusColor, fontWeight: 700, textTransform: 'uppercase' }}>
                                          {statusText}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* ── Due tasks drawer ──────────────────────────────────────────── */}
        {showDueDrawer && (
          <DueTasksDrawer
            tasks={myTasks}
            onClose={() => setShowDueDrawer(false)}
          />
        )}

        {blockerTask && (
          <TaskNoteModal
            title="Raise blocker"
            subtitle={`${blockerTask.title} · ${blockerTask.client?.brandName || blockerTask.client?.fullName || 'Client'}`}
            textareaLabel="What is blocking this task?"
            textareaValue={blockerNote}
            onTextareaChange={setBlockerNote}
            confirmLabel={blockerMut.isPending ? 'Raising...' : 'Raise blocker'}
            confirmDisabled={!blockerNote.trim() || blockerMut.isPending}
            onCancel={() => { setBlockerTask(null); setBlockerNote(''); }}
            onConfirm={() => blockerMut.mutate({ id: blockerTask.id, note: blockerNote })}
          />
        )}

        {extensionTask && (
          <TaskNoteModal
            title="Request extension"
            subtitle={`${extensionTask.title} · ${extensionTask.client?.brandName || extensionTask.client?.fullName || 'Client'}`}
            textareaLabel="Why do you need more time?"
            textareaValue={extensionReason}
            onTextareaChange={setExtensionReason}
            dateValue={extensionDate}
            onDateChange={setExtensionDate}
            confirmLabel={extensionMut.isPending ? 'Requesting...' : 'Request extension'}
            confirmDisabled={!extensionReason.trim() || !extensionDate || extensionMut.isPending}
            onCancel={() => { setExtensionTask(null); setExtensionReason(''); setExtensionDate(format(addDays(new Date(), 2), 'yyyy-MM-dd')); }}
            onConfirm={() => extensionMut.mutate({ id: extensionTask.id, requestedDate: extensionDate, reason: extensionReason })}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function chipStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11, fontWeight: 700,
    padding: '3px 8px', borderRadius: 5,
    background: bg, color,
  };
}

function SmallTaskButton({
  label, icon, color, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        border: `1px solid ${color}`,
        borderRadius: 6,
        background: 'var(--surface)',
        color,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ProgressMetric({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 10px', background: 'var(--surface)' }}>
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 30, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.3px', textTransform: 'uppercase', marginTop: 7 }}>
        {label}
      </div>
    </div>
  );
}

function CalendarGroup({ label, tasks }: { label: string; tasks: any[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      {tasks.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No tasks scheduled.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {tasks.map((task) => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.client?.brandName || task.client?.fullName || 'Client'}
                </div>
              </div>
              {task.priority === 'high' && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 6px', borderRadius: 5 }}>
                  HIGH
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskNoteModal({
  title,
  subtitle,
  textareaLabel,
  textareaValue,
  onTextareaChange,
  dateValue,
  onDateChange,
  confirmLabel,
  confirmDisabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  textareaLabel: string;
  textareaValue: string;
  onTextareaChange: (value: string) => void;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  confirmLabel: string;
  confirmDisabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 32, 0.45)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>{title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          </div>
          <button onClick={onCancel} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 3 }}>
            <XCircle size={18} />
          </button>
        </div>

        {dateValue !== undefined && onDateChange && (
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Requested date</span>
            <input type="date" value={dateValue} onChange={(e) => onDateChange(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
          </label>
        )}

        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{textareaLabel}</span>
          <textarea
            value={textareaValue}
            onChange={(e) => onTextareaChange(e.target.value)}
            rows={4}
            autoFocus
            style={{ width: '100%', padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{ padding: '8px 13px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={confirmDisabled}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 7, background: confirmDisabled ? 'var(--soft)' : 'var(--olive)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: confirmDisabled ? 'not-allowed' : 'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const quickActionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--ink-2)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
};

function EmptyState({ accent, icon: Icon, title, message }: { accent: string; icon: any; title: string; message: string }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Sparkles size={32} style={{ color: accent, margin: '0 auto 10px', display: 'block', opacity: 0.7 }} />
      <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--ink)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{message}</div>
    </div>
  );
}

function StatCard({
  accent, icon: Icon, header, value, footer, isText, onClick, headerExtra,
}: {
  accent: string; icon: any; header: string; value: number | string; footer: string;
  isText?: boolean; onClick?: () => void; headerExtra?: React.ReactNode;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '20px 22px 22px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 122,
        overflow: 'hidden',
        boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
        cursor: clickable ? 'pointer' : 'default',
        transition: clickable ? 'border-color 0.15s, transform 0.15s' : 'none',
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.borderColor = accent;
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }
      }}
    >
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
          background: accent, borderRadius: '10px 0 0 10px',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Icon size={14} style={{ color: accent, flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {header}
          </span>
        </div>
        {headerExtra}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span
          style={{
            fontFamily: isText ? 'Inter, system-ui, sans-serif' : 'Instrument Serif, serif',
            fontSize: isText ? 36 : 44,
            lineHeight: 1,
            color: 'var(--ink)',
            fontWeight: isText ? 600 : 400,
            letterSpacing: isText ? '-0.5px' : 0,
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{footer}</span>
      </div>
    </div>
  );
}

function WindowToggle({ value, onChange }: { value: 'week' | 'month'; onChange: (v: 'week' | 'month') => void }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 2,
        gap: 0,
      }}
    >
      {(['week', 'month'] as const).map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          style={{
            padding: '3px 9px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: value === k ? 'var(--surface)' : 'transparent',
            color: value === k ? 'var(--ink)' : 'var(--muted)',
            boxShadow: value === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function DueTasksDrawer({ tasks, onClose }: { tasks: any[]; onClose: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'overdue' | 'today' | 'thisWeek'>('overdue');
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

  const filtered = useMemo(() => {
    const due = tasks.filter((t) => {
      if (t.status === 'complete' || t.status === 'cancelled') return false;
      const dueDate = new Date(t.dueDate);
      if (filter === 'overdue') return isPast(dueDate) && !isToday(dueDate);
      if (filter === 'today') return isToday(dueDate);
      return dueDate >= today && dueDate <= weekEnd;
    });
    return due.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [tasks, filter]);

  const counts = useMemo(() => {
    const due = tasks.filter((t) => t.status !== 'complete' && t.status !== 'cancelled');
    return {
      overdue: due.filter((t) => isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))).length,
      today:   due.filter((t) => isToday(new Date(t.dueDate))).length,
      thisWeek: due.filter((t) => {
        const d = new Date(t.dueDate);
        return d >= today && d <= weekEnd;
      }).length,
    };
  }, [tasks]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 32, 0.45)',
        backdropFilter: 'blur(2px)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '90vw', height: '100%',
          background: 'var(--surface)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
        }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Tasks due</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Upcoming work assigned to you</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <XCircle size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
          {([
            { k: 'overdue',   label: 'Overdue',   color: 'var(--red)' },
            { k: 'today',     label: 'Today',     color: 'var(--amber)' },
            { k: 'thisWeek',  label: 'This week', color: 'var(--olive)' },
          ] as const).map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                border: '1px solid var(--border)', borderRadius: 999,
                background: filter === f.k ? f.color : 'var(--surface)',
                color: filter === f.k ? '#fff' : 'var(--ink-2)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}>
              {f.label}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                background: filter === f.k ? 'rgba(255,255,255,0.22)' : 'var(--surface-2)',
                color: filter === f.k ? '#fff' : f.color,
              }}>{counts[f.k]}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              <Sparkles size={28} style={{ margin: '0 auto 8px', display: 'block', color: 'var(--olive)' }} />
              <div>No {filter === 'overdue' ? 'overdue' : filter === 'today' ? 'tasks due today' : 'upcoming'} tasks.</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filtered.map((t) => {
                const isOver = filter === 'overdue' || (isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
                const stripe = isOver ? 'var(--red)' : isToday(new Date(t.dueDate)) ? 'var(--amber)' : 'var(--olive)';
                return (
                  <li key={t.id} onClick={() => router.push(`/clients/${t.client?.id}`)}
                    style={{ display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 12, padding: '11px 24px', borderBottom: '1px solid var(--surface-2)', cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <div style={{ background: stripe, borderRadius: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {t.client?.brandName || t.client?.fullName || '—'}
                        {t.step ? ` · Step ${String(t.step.stepNumber).padStart(2, '0')}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: isOver ? 'var(--red)' : 'var(--muted)', fontWeight: isOver ? 600 : 400, alignSelf: 'center' }}>
                      {isOver
                        ? `+${differenceInCalendarDays(startOfDay(new Date(t.dueDate)), today)}d`
                        : isToday(new Date(t.dueDate))
                        ? 'Today'
                        : format(new Date(t.dueDate), 'd MMM')}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskTimer({
  isTimerRunning,
  timerStartedAt,
  timeSpentSeconds,
}: {
  isTimerRunning: boolean;
  timerStartedAt: string | null;
  timeSpentSeconds: number;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const calculateSeconds = () => {
      if (isTimerRunning && timerStartedAt) {
        const elapsed = Math.floor((Date.now() - new Date(timerStartedAt).getTime()) / 1000);
        setSeconds(timeSpentSeconds + Math.max(0, elapsed));
      } else {
        setSeconds(timeSpentSeconds);
      }
    };

    calculateSeconds();

    if (isTimerRunning) {
      const interval = setInterval(calculateSeconds, 1000);
      return () => clearInterval(interval);
    }
  }, [isTimerRunning, timerStartedAt, timeSpentSeconds]);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '11px',
      color: isTimerRunning ? 'var(--olive-dark)' : 'var(--muted)',
      fontWeight: 600,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      padding: '2px 6px',
      borderRadius: '4px',
      marginLeft: '8px',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: isTimerRunning ? 'var(--green)' : 'var(--muted)',
        animation: isTimerRunning ? 'pulse 1.5s infinite' : 'none',
      }} />
      {formatTime(seconds)}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
      `}</style>
    </span>
  );
}
