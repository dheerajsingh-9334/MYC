'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import { isPast, isToday, format, addDays } from 'date-fns';
import { USE_MOCK, MOCK_TASKS } from '@/lib/mockData';
import { Plus, X, User, CircleAlert, Ban, Clock, Check, CircleCheck } from 'lucide-react';

export default function TasksPage() {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [blockerTaskId, setBlockerTaskId] = useState<string | null>(null);
  const [blockerNote, setBlockerNote] = useState('');
  const [extTaskId, setExtTaskId] = useState<string | null>(null);
  const [extDate, setExtDate] = useState('');
  const [extReason, setExtReason] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [addTaskForm, setAddTaskForm] = useState({
    clientId: '',
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    assignedToId: '',
    teamName: '',
  });
  const [addTaskError, setAddTaskError] = useState('');

  // Read user on mount (avoids the "nothing happened" issue where SSR/client
  // mismatch hides the button).
  useEffect(() => {
    if (!USE_MOCK) setUser(getUser());
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: liveTasks = [], isLoading: liveLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK,
    retry: false,
  });

  const tasks: any[] = USE_MOCK ? MOCK_TASKS : liveTasks;
  const isLoading = USE_MOCK ? false : liveLoading;

  const completeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/complete`, { method: 'PATCH' }),
    onSuccess: () => {
      // Refetch tasks (table) + notifications (so the bell badge + dropdown
      // pick up the new task_completed event without waiting 30s for poll).
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const blockerMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/api/tasks/${id}/blocker`, { method: 'PATCH', body: JSON.stringify({ blockerNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setBlockerTaskId(null); setBlockerNote(''); },
  });
  const extMut = useMutation({
    mutationFn: ({ id, date, reason }: { id: string; date: string; reason: string }) =>
      apiFetch(`/api/tasks/${id}/extension`, { method: 'PATCH', body: JSON.stringify({ extensionRequestedDate: date, extensionReason: reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setExtTaskId(null); setExtDate(''); setExtReason(''); },
  });

  // Add task modal queries — fetched eagerly so the modal opens instantly
  const { data: liveClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK && isAdmin,
    retry: false,
  });
  const { data: liveUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK && isAdmin,
    retry: false,
  });

  // Distinct team names for the Team dropdown
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    (liveUsers as any[]).forEach((u) => { if (u.teamName && u.isActive !== false) set.add(u.teamName); });
    return Array.from(set).sort();
  }, [liveUsers]);

  // Filtered assignees based on selected team
  const assignees = useMemo(() => {
    if (!addTaskForm.teamName) return liveUsers as any[];
    return (liveUsers as any[]).filter((u) => u.teamName === addTaskForm.teamName && u.isActive !== false);
  }, [liveUsers, addTaskForm.teamName]);

  const addTaskMut = useMutation({
    mutationFn: () => apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        clientId: addTaskForm.clientId,
        title: addTaskForm.title,
        description: addTaskForm.description || undefined,
        priority: addTaskForm.priority,
        dueDate: addTaskForm.dueDate,
        assignedToId: addTaskForm.assignedToId,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setShowAddTask(false);
      setAddTaskForm({ clientId: '', title: '', description: '', priority: 'normal', dueDate: '', assignedToId: '', teamName: '' });
      setAddTaskError('');
    },
    onError: (e: any) => setAddTaskError(e.message || 'Failed to create task'),
  });

  const handleCheck = (id: string, status: string) => {
    if (USE_MOCK) {
      setChecked(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
    } else if (status !== 'complete') {
      completeMut.mutate(id);
    }
  };

  const isComplete = (t: any) => t.status === 'complete' || checked.has(t.id);
  const isBlocked = (t: any) => t.status === 'blocked';
  const isExtReq = (t: any) => t.status === 'extension_requested';
  const isOverdue  = (t: any) => !isComplete(t) && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate));
  const isDueToday = (t: any) => !isComplete(t) && isToday(new Date(t.dueDate));
  const isUpcoming = (t: any) => !isComplete(t) && !isPast(new Date(t.dueDate));

  const overdue  = tasks.filter(isOverdue);
  const dueToday = tasks.filter(isDueToday);
  const upcoming = tasks.filter(isUpcoming);
  const complete = tasks.filter(isComplete);

  const activeCnt = overdue.length + dueToday.length + upcoming.length;

  const dueLabel = (t: any) => {
    if (isComplete(t)) {
      const at = t.completedAt ? format(new Date(t.completedAt), 'HH:mm') : '';
      return `Completed${at ? ` at ${at}` : ''}`;
    }
    if (isOverdue(t)) {
      const days = Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86400000);
      return `Overdue ${days} day${days !== 1 ? 's' : ''}`;
    }
    if (isDueToday(t)) return 'Due today';
    const diff = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
    return diff === 1 ? 'Due Tomorrow' : `Due in ${diff} days`;
  };

  const dueLabelColor = (t: any) => {
    if (isComplete(t)) return 'var(--green)';
    if (isOverdue(t)) return 'var(--red)';
    if (isDueToday(t)) return 'var(--amber)';
    return 'var(--muted)';
  };

  const SectionLabel = ({ label, count }: { label: string; count: number }) => (
    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {label}
      <span style={{ background: 'var(--surface-2)', padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>{count}</span>
    </div>
  );

  const TaskCard = ({ task }: { task: any }) => {
    const done = isComplete(task);
    const late = isOverdue(task);
    const today = isDueToday(task);
    const high = task.priority === 'high';
    const clientName = task.client?.brandName || task.client?.fullName || '—';
    const stepLabel = task.step ? `Step ${String(task.step.stepNumber).padStart(2, '0')} · ${task.step.name}` : '';

    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: `${high && !done ? '3px solid var(--red)' : '1px solid var(--border)'}`,
        borderRadius: 'var(--radius)', padding: '16px 18px',
        display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'all 0.15s', position: 'relative',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = done ? 'var(--border)' : 'var(--olive)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = high && !done ? '' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
        {/* Checkbox */}
        <div onClick={() => handleCheck(task.id, task.status)}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: done ? 'none' : '1.5px solid var(--border-strong)',
            background: done ? 'var(--olive)' : 'var(--surface)',
            color: '#fff', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!done) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; } }}
          onMouseLeave={e => { if (!done) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; } }}>
          {done && <Check size={12} strokeWidth={3} />}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: done ? 'var(--muted)' : 'var(--ink)', marginBottom: 4, textDecoration: done ? 'line-through' : 'none' }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <User size={11} /> {clientName}
            </span>
            {stepLabel && <><span>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{stepLabel}</span></>}
            <span>·</span>
            <span style={{ color: dueLabelColor(task), fontWeight: late || today ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {done && <CircleCheck size={11} />}
              {dueLabel(task)}
            </span>
            {high && !done && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <CircleAlert size={11} /> High priority
                </span>
              </>
            )}
          </div>
        </div>

        {/* Inline blocker form */}
        {blockerTaskId === task.id && (
          <div style={{ gridColumn: '1/-1', marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input autoFocus value={blockerNote} onChange={e => setBlockerNote(e.target.value)} placeholder="Describe the blocker..."
              style={{ flex: 1, minWidth: 180, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
            <button onClick={() => blockerMut.mutate({ id: task.id, note: blockerNote })} disabled={!blockerNote || blockerMut.isPending}
              style={{ padding: '7px 12px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              {blockerMut.isPending ? '...' : 'Submit Blocker'}
            </button>
            <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink-2)' }}>Cancel</button>
          </div>
        )}
        {/* Inline extension form */}
        {extTaskId === task.id && (
          <div style={{ gridColumn: '1/-1', marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={extDate} min={format(addDays(new Date(), 1), 'yyyy-MM-dd')} onChange={e => setExtDate(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
            <input value={extReason} onChange={e => setExtReason(e.target.value)} placeholder="Reason for extension..."
              style={{ flex: 1, minWidth: 180, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
            <button onClick={() => extMut.mutate({ id: task.id, date: extDate, reason: extReason })} disabled={!extDate || !extReason || extMut.isPending}
              style={{ padding: '7px 12px', background: 'var(--amber)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              {extMut.isPending ? '...' : 'Request Extension'}
            </button>
            <button onClick={() => { setExtTaskId(null); setExtDate(''); setExtReason(''); }}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink-2)' }}>Cancel</button>
          </div>
        )}
        {/* Actions */}
        {!done && blockerTaskId !== task.id && extTaskId !== task.id && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => handleCheck(task.id, task.status)}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; (e.currentTarget as HTMLElement).style.color = 'var(--olive)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}>
              Mark done
            </button>
            <button onClick={() => setBlockerTaskId(task.id)}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--red)'; (e.currentTarget as HTMLElement).style.color = 'var(--red)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Ban size={11} /> Blocker
              </span>
            </button>
            <button onClick={() => setExtTaskId(task.id)}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--amber)'; (e.currentTarget as HTMLElement).style.color = 'var(--amber)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> Extend
              </span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Week stats
  const completedThisWeek = 12;
  const ringPct = 60;
  const circumference = 2 * Math.PI * 24; // r=24
  const dashOffset = circumference * (1 - ringPct / 100);

  return (
    <AppLayout>
      <Topbar title="My Tasks" subtitle={`${user?.fullName || 'Team Member'} · ${user?.teamName || ''} · ${activeCnt} active task${activeCnt !== 1 ? 's' : ''}`} />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title="My Tasks Today"
          subtitle={`${user?.fullName || 'Team Member'} · ${user?.teamName || ''} · ${activeCnt} active task${activeCnt !== 1 ? 's' : ''}`}
        >
          {isAdmin && (
            <button onClick={() => setShowAddTask(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--olive)', color: '#fff', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
              <Plus size={14} /> Add Task
            </button>
          )}
        </DashboardHeader>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* Task list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading tasks...</div>
            ) : (
              <>
                {overdue.length > 0 && (
                  <>
                    <SectionLabel label="Overdue" count={overdue.length} />
                    {overdue.map(t => <TaskCard key={t.id} task={t} />)}
                  </>
                )}
                {(dueToday.length > 0 || complete.filter(t => isToday(new Date(t.dueDate))).length > 0) && (
                  <>
                    <div style={{ marginTop: 8 }}>
                      <SectionLabel label="Due Today" count={dueToday.length + complete.filter(t => isToday(new Date(t.dueDate))).length} />
                    </div>
                    {dueToday.map(t => <TaskCard key={t.id} task={t} />)}
                    {/* Show completed tasks that were due today */}
                    {complete.filter(t => isToday(new Date(t.dueDate))).map(t => <TaskCard key={t.id} task={t} />)}
                  </>
                )}
                {upcoming.length > 0 && (
                  <>
                    <div style={{ marginTop: 8 }}><SectionLabel label="Upcoming" count={upcoming.length} /></div>
                    {upcoming.map(t => <TaskCard key={t.id} task={t} />)}
                  </>
                )}
                {activeCnt === 0 && complete.length > 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--green)', fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <CircleCheck size={16} /> All caught up!
                  </div>
                )}
              </>
            )}
          </div>

          {/* Side panel */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, position: 'sticky', top: 80 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>Your week at a glance</div>

            {/* Ring */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: 'var(--olive-50)', borderRadius: 'var(--radius-sm)' }}>
              <svg width={60} height={60} viewBox="0 0 60 60">
                <circle cx={30} cy={30} r={24} fill="none" stroke="#E4ECD0" strokeWidth={6} />
                <circle cx={30} cy={30} r={24} fill="none" stroke="var(--olive)" strokeWidth={6}
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  strokeLinecap="round" transform="rotate(-90 30 30)" />
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--olive-dark)', fontWeight: 500, marginBottom: 2 }}>On-time completion</div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--olive)' }}>{ringPct}%</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {[
                { label: 'Completed this week', value: String(completedThisWeek) },
                { label: 'Active right now', value: String(activeCnt) },
                { label: 'Currently overdue', value: String(overdue.length), color: overdue.length > 0 ? 'var(--red)' : undefined },
                { label: 'Avg time per task', value: '1.4d' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--muted)' }}>{s.label}</span>
                  <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: s.color || 'var(--ink)', fontStyle: 'italic' }}>{s.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Need help?</div>
              <button style={{ width: '100%', padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Request extension</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── ADD TASK MODAL (admin only) ── */}
      {showAddTask && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddTask(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add Task</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Pick a team, then assign to a member on that team.</div>
              </div>
              <button onClick={() => setShowAddTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Row 1: Team (dropdown) + Client (dropdown) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lblStyle}>Team *</label>
                  <select
                    value={addTaskForm.teamName}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, teamName: e.target.value, assignedToId: '' }))}
                    style={inpStyle}
                  >
                    <option value="">Select team…</option>
                    {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Client *</label>
                  <select
                    value={addTaskForm.clientId}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, clientId: e.target.value }))}
                    style={inpStyle}
                  >
                    <option value="">Select client…</option>
                    {(liveClients as any[]).map((c) => (
                      <option key={c.id} value={c.id}>{c.brandName || c.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Task name (full width) */}
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Task name *</label>
                <input
                  value={addTaskForm.title}
                  onChange={(e) => setAddTaskForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Review contract clause 4"
                  style={inpStyle}
                />
              </div>

              {/* Row 3: Description */}
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Description</label>
                <textarea
                  value={addTaskForm.description}
                  onChange={(e) => setAddTaskForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional context for the assignee…"
                  rows={2}
                  style={{ ...inpStyle, resize: 'vertical' }}
                />
              </div>

              {/* Row 4: Assignee + Priority + Due date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lblStyle}>Assignee *</label>
                  <select
                    value={addTaskForm.assignedToId}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, assignedToId: e.target.value }))}
                    style={inpStyle}
                    disabled={!addTaskForm.teamName}
                  >
                    <option value="">{addTaskForm.teamName ? 'Select member…' : 'Pick a team first'}</option>
                    {assignees.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}{u.role === 'team_leader' ? ' (Lead)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Priority</label>
                  <select
                    value={addTaskForm.priority}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, priority: e.target.value }))}
                    style={inpStyle}
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Due date *</label>
                  <input
                    type="date"
                    value={addTaskForm.dueDate}
                    min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                    onChange={(e) => setAddTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                    style={inpStyle}
                  />
                </div>
              </div>

              {addTaskError && (
                <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  {addTaskError}
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
              <button
                onClick={() => setShowAddTask(false)}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setAddTaskError(''); addTaskMut.mutate(); }}
                disabled={addTaskMut.isPending || !addTaskForm.clientId || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId || !addTaskForm.teamName}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
                  background: 'var(--olive)', color: '#fff', cursor: addTaskMut.isPending ? 'not-allowed' : 'pointer',
                  opacity: addTaskMut.isPending || !addTaskForm.clientId || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId || !addTaskForm.teamName ? 0.5 : 1,
                }}
              >
                {addTaskMut.isPending ? 'Adding…' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5,
};
const inpStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)',
  background: 'var(--surface)', outline: 'none',
};
