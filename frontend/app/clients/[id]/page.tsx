'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import { USE_MOCK, MOCK_CLIENTS, MOCK_STEPS, MOCK_CLIENT_DETAIL } from '@/lib/mockData';
import { useFormDraft } from '@/lib/useFormDraft';
import { format, addDays } from 'date-fns';

// Short step labels for the pipeline track
const STEP_LABELS = [
  'Onboarding', 'Strategy', 'Brand Setup', 'Funnel Build',
  'Ad Creative', 'Ad Launch', 'Automation', 'Event Prep', 'Event Launch',
];

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [showMoveStep, setShowMoveStep] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [blockerTaskId, setBlockerTaskId] = useState<string | null>(null);
  const [blockerNote, setBlockerNote] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [addTaskForm, setAddTaskForm] = useState({
    teamName: '',
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    assignedToId: '',
  });
  const [addTaskError, setAddTaskError] = useState('');

  // Read the logged-in user after hydration so we can admin-gate the button.
  useEffect(() => {
    if (!USE_MOCK) setCurrentUser(getUser());
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  // Load users (for team + assignee dropdowns) when admin opens the modal
  const { data: liveUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK && showAddTask && isAdmin,
    retry: false,
  });

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    (liveUsers as any[]).forEach((u) => { if (u.teamName && u.isActive !== false) set.add(u.teamName); });
    return Array.from(set).sort();
  }, [liveUsers]);

  const assignees = useMemo(() => {
    if (!addTaskForm.teamName) return liveUsers as any[];
    return (liveUsers as any[]).filter((u) => u.teamName === addTaskForm.teamName && u.isActive !== false);
  }, [liveUsers, addTaskForm.teamName]);

  const addTaskMut = useMutation({
    mutationFn: () => apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        clientId: String(id),
        title: addTaskForm.title,
        description: addTaskForm.description || undefined,
        priority: addTaskForm.priority,
        dueDate: addTaskForm.dueDate,
        assignedToId: addTaskForm.assignedToId,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setShowAddTask(false);
      setAddTaskForm({ teamName: '', title: '', description: '', priority: 'normal', dueDate: '', assignedToId: '' });
      setAddTaskError('');
    },
    onError: (e: any) => setAddTaskError(e.message || 'Failed to create task'),
  });

  const completeMut = useMutation({
    mutationFn: (taskId: string) => apiFetch(`/api/tasks/${taskId}/complete`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      // Refresh the bell immediately — task completion may have triggered
      // an auto-advance (step_advanced notification) or auto-completion
      // (client_status_changed broadcast). Don't wait for the 30s poll.
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });
  const blockerMut = useMutation({
    mutationFn: ({ taskId, note }: { taskId: string; note: string }) =>
      apiFetch(`/api/tasks/${taskId}/blocker`, { method: 'PATCH', body: JSON.stringify({ blockerNote: note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      setBlockerTaskId(null);
      setBlockerNote('');
    },
  });

  const handleCheck = (taskId: string, currentStatus: string) => {
    if (USE_MOCK) {
      setCheckedTasks(prev => { const s = new Set(prev); if (s.has(taskId)) s.delete(taskId); else s.add(taskId); return s; });
    } else if (currentStatus !== 'complete') {
      completeMut.mutate(taskId);
    }
  };

  // MoveStep draft — persisted across modal close and reload so an
  // admin doesn't lose a multi-sentence audit reason by accident.
  const moveDraft = useFormDraft<{ moveToStepId: string; moveReason: string }>({
    kind: 'move_client_step',
    contextId: typeof id === 'string' ? id : String(id),
    initialData: { moveToStepId: '', moveReason: '' },
    enabled: !USE_MOCK,
  });
  const moveToStepId = moveDraft.data.moveToStepId;
  const moveReason = moveDraft.data.moveReason;

  // Change-status draft — reuses the move_client_step DraftKind for autosave;
  // gives admins the same draft-restore behavior on close/reload.
  const statusDraft = useFormDraft<{ newStatus: string; reasonNote: string }>({
    kind: 'move_client_step',
    contextId: typeof id === 'string' ? id : String(id),
    initialData: { newStatus: '', reasonNote: '' },
    enabled: !USE_MOCK,
  });
  const newStatus = statusDraft.data.newStatus;
  const statusReason = statusDraft.data.reasonNote;

  // Live data fetch (disabled in mock mode)
  const { data: liveClient, isLoading: liveLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => apiFetch(`/api/clients/${id}`),
    enabled: !USE_MOCK && !!id,
    retry: false,
  });
  const { data: liveSteps = [] } = useQuery({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const moveMutation = useMutation({
    mutationFn: (data: { toStepId: string; reasonNote: string }) =>
      apiFetch(`/api/clients/${id}/step`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      await moveDraft.clear();
      setShowMoveStep(false);
    },
  });
  const statusMutation = useMutation({
    mutationFn: (data: { status: string }) =>
      apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify({ status: data.status }) }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
      await statusDraft.clear();
      setShowChangeStatus(false);
    },
  });

  // Resolve mock vs live
  const mockClient = USE_MOCK
    ? (id === 'c1' ? MOCK_CLIENT_DETAIL : MOCK_CLIENTS.find((c) => c.id === id) ?? MOCK_CLIENT_DETAIL)
    : null;
  const client: any = USE_MOCK ? mockClient : liveClient;
  const steps: any[] = USE_MOCK ? MOCK_STEPS : liveSteps;
  const isLoading = USE_MOCK ? false : liveLoading;


  if (isLoading) return (
    <AppLayout>
      <Topbar title="Client Detail" />
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Instrument Serif, serif', fontSize: 20 }}>Loading client…</div>
    </AppLayout>
  );

  if (!client) return (
    <AppLayout>
      <Topbar title="Client Detail" />
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--red)', fontSize: 15 }}>Client not found.</div>
    </AppLayout>
  );

  const currentStepNum = client.currentStep?.stepNumber || 1;
  const daysInStep = client.daysInStep || 0;
  const sla = client.currentStep?.slaDays || 0;
  const isOverSLA = daysInStep > sla;
  const initials = (client.brandName || client.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2);
  // API returns `tasks` (not currentTasks) and `stepHistory` (not pipelineHistory)
  const currentTasks: any[] = client.currentTasks || client.tasks || [];
  const history: any[] = client.pipelineHistory ||
    (client.stepHistory || []).map((h: any) => ({
      date: new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      title: h.fromStep
        ? `Moved: ${h.fromStep.name} → ${h.toStep?.name}`
        : `Entered Step ${h.toStep?.stepNumber} — ${h.toStep?.name}`,
      desc: `${h.triggeredBy === 'system' ? 'Auto-advanced' : `Manual by ${h.triggeredByUser?.fullName || 'Admin'}`}${h.reasonNote ? ` · ${h.reasonNote}` : ''}`,
    }));

  // Status badge helper
  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: `${daysInStep - sla} day${daysInStep - sla > 1 ? 's' : ''} late` },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };
  const sc = statusConfig[client.computedStatus] || statusConfig.on_track;

  return (
    <AppLayout>
      <Topbar
        title="Client Detail"
        subtitle={`${client.brandName || client.fullName} · Step ${currentStepNum}`}
      />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        {/* Back */}
        <button onClick={() => router.push('/dashboard')} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
          padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
          <ArrowLeft size={13} /> Back to Pipeline
        </button>

        {/* ── CLIENT HEADER ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Instrument Serif, serif', fontSize: 22, fontWeight: 400,
          }}>{initials}</div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.3px', lineHeight: 1.1, marginBottom: 6 }}>
              {client.brandName || client.fullName}
            </h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
              {client.fullName && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>👤 {client.fullName}</span>}
              {client.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>📧 {client.email}</span>}
              {client.whatsappNumber && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>📱 {client.whatsappNumber}</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                📅 Joined {new Date(client.dateJoined).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
              View vault
            </button>
            <button onClick={() => setShowMoveStep(true)} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
              Move step
            </button>
            <button onClick={() => setShowChangeStatus(true)} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
              Change status
            </button>
            <button onClick={() => setShowAddTask(true)} disabled={!isAdmin} title={isAdmin ? 'Add a task for this client' : 'Admin only'}
              style={{ padding: '7px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--olive)', cursor: isAdmin ? 'pointer' : 'not-allowed', color: '#fff', transition: 'background 0.15s', opacity: isAdmin ? 1 : 0.5 }}
              onMouseEnter={e => { if (isAdmin) (e.currentTarget as HTMLElement).style.background = 'var(--olive-dark)'; }}
              onMouseLeave={e => { if (isAdmin) (e.currentTarget as HTMLElement).style.background = 'var(--olive)'; }}>
              Add task
            </button>
          </div>
        </div>

        {/* ── TEAM INFO BANNER ────────────────────────────────────────── */}
        <div style={{
          background: '#EBF3FB', border: '1px solid #B8D4EE', borderRadius: 'var(--radius-sm)',
          padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#1A3A5C' }}>
            <span style={{ fontSize: 16 }}>🛡️</span>
            <span>
              <strong>{client.currentStep?.owningTeamName} — you're working on Step {currentStepNum}.</strong>
              {' '}Brand guidelines, photos, niche details, and target audience from Steps 1–{currentStepNum - 1 > 0 ? currentStepNum - 1 : 1} are all in the document vault.
            </span>
          </div>
          <button style={{ fontSize: 12.5, fontWeight: 600, color: '#2860A1', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', padding: 0 }}>
            Open vault →
          </button>
        </div>

        {/* ── PIPELINE TRACK ──────────────────────────────────────────── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
          {/* Progress header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Current Progress</div>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>
                Step {currentStepNum} of 9 — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{client.currentStep?.name}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>Days in current step</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: isOverSLA ? 'var(--red)' : 'var(--olive)' }}>
                {daysInStep} / {sla} SLA
              </div>
            </div>
          </div>

          {/* 9-step pipeline track */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 0, position: 'relative' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: 18, left: '5%', right: '5%', height: 2, background: 'var(--border)', zIndex: 0 }} />

            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const completed = stepNum < currentStepNum;
              const current = stepNum === currentStepNum;
              const future = stepNum > currentStepNum;

              return (
                <div key={stepNum}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, cursor: 'pointer', padding: '4px 2px' }}>
                  {/* Circle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                    background: completed ? 'var(--olive)' : current ? 'var(--surface)' : 'var(--surface)',
                    border: `2px solid ${completed ? 'var(--olive)' : current ? 'var(--olive)' : 'var(--border)'}`,
                    color: completed ? '#fff' : current ? 'var(--olive)' : 'var(--muted)',
                    boxShadow: current ? '0 0 0 4px var(--olive-50)' : 'none',
                  }}>
                    {completed ? '✓' : stepNum}
                  </div>

                  {/* Pulse dot for current */}
                  {current && (
                    <span style={{
                      position: 'absolute', top: 14,
                      width: 8, height: 8, background: 'var(--olive)', borderRadius: '50%',
                      animation: 'pulse 2s infinite',
                    }} />
                  )}

                  {/* Label */}
                  <div style={{
                    fontSize: 11, textAlign: 'center', lineHeight: 1.3, maxWidth: 80,
                    fontWeight: current ? 600 : 500,
                    color: current ? 'var(--olive)' : completed ? 'var(--ink-2)' : 'var(--muted)',
                  }}>
                    {label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DETAIL GRID ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>

          {/* Current step tasks */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                Current Step Tasks
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>· {client.currentStep?.name}</span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: 600, background: sc.bg, color: sc.color }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
                {sc.label}
              </span>
            </div>

            <div style={{ padding: '8px 12px' }}>
              {currentTasks.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tasks in this step yet.</div>
              ) : currentTasks.map((task: any) => {
                const done = task.status === 'complete' || checkedTasks.has(task.id);
                const isBlocked = task.status === 'blocked';
                const high = task.priority === 'high';
                const today = new Date(); today.setHours(0,0,0,0);
                const daysOverdue = done ? 0 : Math.max(0, Math.floor((today.getTime() - new Date(task.dueDate).getTime()) / 86400000));
                const assigneeName = task.assignedTo?.fullName
                  ? `${task.assignedTo.fullName}${task.assignedTo.teamName ? ` (${task.assignedTo.teamName})` : ''}`
                  : task.assignedTo || '—';

                return (
                  <div key={task.id} style={{
                    margin: 8, border: '1px solid var(--border)',
                    borderLeft: `${isBlocked ? '3px solid #6B3FA0' : high && !done ? '3px solid var(--red)' : '1px solid var(--border)'}`,
                    borderRadius: 'var(--radius)', padding: '14px 16px',
                    display: 'flex', gap: 12, alignItems: 'flex-start', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>

                    {/* Checkbox */}
                    <div onClick={() => handleCheck(task.id, task.status)}
                      style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        border: done ? 'none' : '1.5px solid var(--border-strong)',
                        background: done ? 'var(--olive)' : 'var(--surface)',
                        color: '#fff', fontSize: 12, cursor: done ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                      }}>
                      {done && '✓'}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>
                        {task.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                        <span>{assigneeName}</span>
                        <span>·</span>
                        <span style={{ color: done ? 'var(--green)' : daysOverdue > 0 ? 'var(--red)' : isBlocked ? '#6B3FA0' : 'var(--muted)', fontWeight: done || daysOverdue > 0 ? 600 : 400 }}>
                          {done ? `✓ Done` : daysOverdue > 0 ? `Overdue ${daysOverdue}d` : isBlocked ? '⏸ Blocked' : 'In progress'}
                        </span>
                        {task.blockerNote && <span style={{ color: '#6B3FA0', fontSize: 11, background: '#F0E8FA', padding: '1px 8px', borderRadius: 4 }}>🚫 {task.blockerNote}</span>}
                      </div>
                      {blockerTaskId === task.id && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <input autoFocus value={blockerNote} onChange={e => setBlockerNote(e.target.value)} placeholder="Describe the blocker..."
                            style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }} />
                          <button onClick={() => blockerMut.mutate({ taskId: task.id, note: blockerNote })} disabled={!blockerNote || blockerMut.isPending}
                            style={{ padding: '7px 12px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                            {blockerMut.isPending ? '...' : 'Raise'}
                          </button>
                          <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }}
                            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink-2)' }}>Cancel</button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!done && blockerTaskId !== task.id && (
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
                          🚫 Blocker
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step History timeline */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Step History</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {history.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px auto 1fr', gap: 14, alignItems: 'flex-start' }}>
                    {/* Date */}
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--muted)', paddingTop: 4 }}>
                      {item.date}
                    </div>

                    {/* Dot + line */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--olive)', marginTop: 5, zIndex: 1 }} />
                      {i < history.length - 1 && (
                        <div style={{ position: 'absolute', top: 15, bottom: -20, width: 2, background: 'var(--border)' }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── MOVE STEP MODAL ─────────────────────────────────────────── */}
        {showMoveStep && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowMoveStep(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Move to a different step</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Incomplete tasks in the current step will be cancelled.</div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Target Step</label>
                  <select value={moveToStepId} onChange={e => moveDraft.setData(p => ({ ...p, moveToStepId: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Select a step...</option>
                    {steps.map((s: any) => (
                      <option key={s.id} value={s.id} disabled={s.id === client.currentStepId}>
                        Step {s.stepNumber} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Reason (required)</label>
                  <textarea value={moveReason} onChange={e => moveDraft.setData(p => ({ ...p, moveReason: e.target.value }))} placeholder="Why is this client being moved?"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
                <button onClick={() => setShowMoveStep(false)} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
                <button
                  disabled={USE_MOCK ? false : (!moveToStepId || !moveReason || moveMutation.isPending)}
                  onClick={() => USE_MOCK ? setShowMoveStep(false) : moveMutation.mutate({ toStepId: moveToStepId, reasonNote: moveReason })}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--olive)', color: '#fff', cursor: 'pointer' }}>
                  {moveMutation.isPending ? 'Moving…' : 'Move Client'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CHANGE STATUS MODAL ─────────────────────────────────────── */}
        {showChangeStatus && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowChangeStatus(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Change client status</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Current: <strong>{client.status}</strong>. All teams in the org will be notified.
                </div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>New status</label>
                  <select value={newStatus} onChange={e => statusDraft.setData(p => ({ ...p, newStatus: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Select a status...</option>
                    {(['active', 'paused', 'completed', 'churned'] as const).map(s => (
                      <option key={s} value={s} disabled={s === client.status}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Reason (required)</label>
                  <textarea value={statusReason} onChange={e => statusDraft.setData(p => ({ ...p, reasonNote: e.target.value }))} placeholder="Why is this status changing?"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
                <button onClick={() => setShowChangeStatus(false)} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
                <button
                  disabled={!newStatus || !statusReason || statusMutation.isPending || newStatus === client.status}
                  onClick={() => statusMutation.mutate({ status: newStatus })}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--olive)', color: '#fff', cursor: (!newStatus || !statusReason || statusMutation.isPending || newStatus === client.status) ? 'not-allowed' : 'pointer', opacity: (!newStatus || !statusReason || statusMutation.isPending || newStatus === client.status) ? 0.5 : 1 }}>
                  {statusMutation.isPending ? 'Updating…' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ADD TASK MODAL (admin only) ── */}
        {showAddTask && isAdmin && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowAddTask(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add Task</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    For {client?.brandName || client?.fullName} · {client?.currentStep?.name ? `Step ${client.currentStep.stepNumber} — ${client.currentStep.name}` : 'this client'}
                  </div>
                </div>
                <button onClick={() => setShowAddTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>

              <div style={{ padding: '20px 24px' }}>
                {/* Team (dropdown) — drives assignee filter */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Team *</label>
                  <select
                    value={addTaskForm.teamName}
                    onChange={e => setAddTaskForm(f => ({ ...f, teamName: e.target.value, assignedToId: '' }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
                  >
                    <option value="">Select team…</option>
                    {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Task name */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Task name *</label>
                  <input
                    value={addTaskForm.title}
                    onChange={e => setAddTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Send brand questionnaire"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
                  <textarea
                    value={addTaskForm.description}
                    onChange={e => setAddTaskForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Optional context for the assignee…"
                    rows={2}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                {/* Assignee + Priority + Due date */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Assignee *</label>
                    <select
                      value={addTaskForm.assignedToId}
                      onChange={e => setAddTaskForm(f => ({ ...f, assignedToId: e.target.value }))}
                      disabled={!addTaskForm.teamName}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', opacity: !addTaskForm.teamName ? 0.6 : 1 }}
                    >
                      <option value="">{addTaskForm.teamName ? 'Select member…' : 'Pick a team first'}</option>
                      {assignees.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.fullName}{u.role === 'team_leader' ? ' (Lead)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Priority</label>
                    <select
                      value={addTaskForm.priority}
                      onChange={e => setAddTaskForm(f => ({ ...f, priority: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Due date *</label>
                    <input
                      type="date"
                      value={addTaskForm.dueDate}
                      min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                      onChange={e => setAddTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
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
                <button onClick={() => setShowAddTask(false)} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
                <button
                  onClick={() => { setAddTaskError(''); addTaskMut.mutate(); }}
                  disabled={addTaskMut.isPending || !addTaskForm.teamName || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId}
                  style={{
                    padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500,
                    background: 'var(--olive)', color: '#fff',
                    cursor: addTaskMut.isPending ? 'not-allowed' : 'pointer',
                    opacity: addTaskMut.isPending || !addTaskForm.teamName || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId ? 0.5 : 1,
                  }}
                >
                  {addTaskMut.isPending ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
