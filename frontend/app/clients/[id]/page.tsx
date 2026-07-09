'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Check, TriangleAlert, CircleCheck, Clock, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { USE_MOCK, MOCK_CLIENTS, MOCK_STEPS, MOCK_CLIENT_DETAIL } from '@/lib/mockData';
import { useFormDraft } from '@/lib/useFormDraft';
import { format, addDays, differenceInCalendarDays, startOfDay, isPast, isToday } from 'date-fns';

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
  const [showAddStep, setShowAddStep] = useState(false);
  const [addStepForm, setAddStepForm] = useState({ name: '', owningTeamName: '', slaDays: '3', description: '', stepNumber: '' });
  const [addStepError, setAddStepError] = useState('');
  const [editingStep, setEditingStep] = useState<any>(null);
  const [editStepForm, setEditStepForm] = useState({ name: '', owningTeamName: '', slaDays: '3', description: '' });
  const [editStepError, setEditStepError] = useState('');
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());
  const [blockerTaskId, setBlockerTaskId] = useState<string | null>(null);
  const [blockerNote, setBlockerNote] = useState('');
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [proofLink, setProofLink] = useState('');
  const [proofDescription, setProofDescription] = useState('');

  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('tasks');
  const [exportFormat, setExportFormat] = useState('csv');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');
  const [expStepId, setExpStepId] = useState('');
  const [expStatus, setExpStatus] = useState('');
  const [expTeam, setExpTeam] = useState('');
  const [expAssignedToId, setExpAssignedToId] = useState('');
  const [expPriority, setExpPriority] = useState('');
  const [expCompleted, setExpCompleted] = useState('all');

  // Queries for export dropdown filters
  const { data: stepsList = [] } = useQuery({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    retry: false,
  });

  const { data: usersList = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    retry: false,
  });

  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    retry: false,
  });

  const handleCreateNewTeam = async () => {
    const name = prompt('Enter new team name:');
    if (!name?.trim()) return;
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      qc.invalidateQueries({ queryKey: ['teams'] });
      setAddStepForm(f => ({ ...f, owningTeamName: name.trim() }));
    } catch (e: any) {
      alert(e.message || 'Failed to create team');
    }
  };
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

  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskTeamFilter, setTaskTeamFilter] = useState('all');
  const [taskClientFilter, setTaskClientFilter] = useState('all');
  const [taskLimit, setTaskLimit] = useState(10);

  // Read the logged-in user after hydration so we can admin-gate the button.
  useEffect(() => {
    if (!USE_MOCK) {
      setCurrentUser(getUser());
    } else {
      setCurrentUser({ id: 'u1', fullName: 'Mock Staff', role: 'staff', teamName: 'Content Production' });
    }
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
    mutationFn: ({ id: taskId, proofLink, proofDescription }: { id: string; proofLink?: string; proofDescription?: string }) =>
      apiFetch(`/api/tasks/${taskId}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ proofLink, proofDescription }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
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
      setCompleteTaskId(taskId);
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
    queryKey: ['steps', id],
    queryFn: () => apiFetch(`/api/steps?clientId=${id}`),
    enabled: !USE_MOCK && !!id,
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

  const addStepMutation = useMutation({
    mutationFn: (data: typeof addStepForm) =>
      apiFetch('/api/steps', { method: 'POST', body: JSON.stringify({ ...data, clientId: id }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', id] });
      qc.invalidateQueries({ queryKey: ['client', id] });
      setShowAddStep(false);
      setAddStepForm({ name: '', owningTeamName: '', slaDays: '3', description: '', stepNumber: '' });
      setAddStepError('');
    },
    onError: (err: any) => {
      setAddStepError(err.message || 'Failed to add step');
    }
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      apiFetch(`/api/steps/${stepId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', id] });
      qc.invalidateQueries({ queryKey: ['client', id] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete step');
    }
  });

  const editStepMutation = useMutation({
    mutationFn: (data: typeof editStepForm) =>
      apiFetch(`/api/steps/${editingStep.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', id] });
      qc.invalidateQueries({ queryKey: ['client', id] });
      setEditingStep(null);
      setEditStepForm({ name: '', owningTeamName: '', slaDays: '3', description: '' });
      setEditStepError('');
    },
    onError: (err: any) => {
      setEditStepError(err.message || 'Failed to update step');
    }
  });

  // Resolve mock vs live
  const mockClient = USE_MOCK
    ? (id === 'c1' ? MOCK_CLIENT_DETAIL : MOCK_CLIENTS.find((c) => c.id === id) ?? MOCK_CLIENT_DETAIL)
    : null;
  const client: any = USE_MOCK ? mockClient : liveClient;
  const steps: any[] = USE_MOCK ? MOCK_STEPS : liveSteps;
  const isLoading = USE_MOCK ? false : liveLoading;

  const currentTasks: any[] = client?.currentTasks || client?.tasks || [];
  const filteredTasks = useMemo(() => {
    if (!client) return [];
    return currentTasks;
  }, [client, currentTasks]);

  // Process tasks to compute their display condition and statuses
  const processedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return filteredTasks.map((t: any) => {
      const done = t.status === 'complete' || checkedTasks.has(t.id);
      const isBlocked = t.status === 'blocked';
      const due = startOfDay(new Date(t.dueDate || new Date()));
      const diff = differenceInCalendarDays(due, today);
      const isOverdue = !done && !isBlocked && diff < 0;
      const isDueToday = !done && !isBlocked && diff === 0;

      let condition = 'pending';
      if (done) condition = 'complete';
      else if (isBlocked) condition = 'blocked';
      else if (t.status === 'in_progress') condition = 'in_progress';
      else if (isOverdue) condition = 'overdue';
      else if (isDueToday) condition = 'due_today';

      const assigneeName = t.assignedTo?.fullName
        ? `${t.assignedTo.fullName}${t.assignedTo.teamName ? ` (${t.assignedTo.teamName})` : ''}`
        : typeof t.assignedTo === 'string'
        ? t.assignedTo
        : '—';

      const teamName = t.assignedTo?.teamName || (typeof t.assignedTo === 'string' && t.assignedTo.includes('(') ? t.assignedTo.split('(')[1].replace(')', '').trim() : '');
      
      const clientName = client?.brandName || client?.fullName || '';

      return {
        ...t,
        _condition: condition,
        _isDone: done,
        _isBlocked: isBlocked,
        _isOverdue: isOverdue,
        _isDueToday: isDueToday,
        _daysLate: diff < 0 ? Math.abs(diff) : 0,
        _daysAhead: diff >= 0 ? diff : 0,
        _assigneeName: assigneeName,
        _teamName: teamName,
        _clientName: clientName,
      };
    });
  }, [filteredTasks, checkedTasks, client]);

  // Apply filters on computed tasks
  const filteredAndSearchedTasks = useMemo(() => {
    return processedTasks.filter((t: any) => {
      if (t.isPinned || t.isAlerted) return true;

      if (!isAdmin && currentUser) {
        const uTeam = currentUser.teamName || '';
        const tTeam = t._teamName || '';
        const isSameTeam = uTeam && tTeam && uTeam.toLowerCase() === tTeam.toLowerCase();
        const isAssignedToMe = t.assignedToId === currentUser.id || t.assignedTo?.id === currentUser.id;
        const isLead = currentUser.role === 'team_leader';

        if (isLead) {
          if (!isSameTeam) return false;
        } else {
          if (!isAssignedToMe) return false;
        }
      }
      const matchesSearch = t.title.toLowerCase().includes(taskSearch.toLowerCase());
      const matchesStatus = taskStatusFilter === 'all' || t._condition === taskStatusFilter;
      const matchesTeam = taskTeamFilter === 'all' || t._teamName.toLowerCase().includes(taskTeamFilter.toLowerCase());
      const matchesClient = taskClientFilter === 'all' || t._clientName === taskClientFilter;

      return matchesSearch && matchesStatus && matchesTeam && matchesClient;
    });
  }, [processedTasks, taskSearch, taskStatusFilter, taskTeamFilter, taskClientFilter, isAdmin, currentUser]);

  // Reset limit when filters change
  useEffect(() => {
    setTaskLimit(10);
  }, [taskSearch, taskStatusFilter, taskTeamFilter, taskClientFilter]);

  // Scroll slice for tasks
  const scrollableTasks = useMemo(() => {
    return filteredAndSearchedTasks.slice(0, taskLimit);
  }, [filteredAndSearchedTasks, taskLimit]);

  const handleTaskScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setTaskLimit(prev => Math.min(prev + 10, filteredAndSearchedTasks.length));
    }
  };

  // Extract unique teams for filter dropdown
  const uniqueTeams = useMemo(() => {
    const teams = new Set<string>();
    processedTasks.forEach((t: any) => {
      if (t._teamName) teams.add(t._teamName);
    });
    return Array.from(teams);
  }, [processedTasks]);

  // Extract unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    if (!client) return [];
    return [client.brandName || client.fullName];
  }, [client]);

  const history: any[] = useMemo(() => {
    if (!client) return [];
    const rawHistory = client.pipelineHistory ||
      (client.stepHistory || []).map((h: any) => ({
        date: new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        title: h.fromStep
          ? `Moved: ${h.fromStep.name} → ${h.toStep?.name}`
          : `Entered Step ${h.toStep?.stepNumber} — ${h.toStep?.name}`,
        desc: `${h.triggeredBy === 'system' ? 'Auto-advanced' : `Manual by ${h.triggeredByUser?.fullName || 'Admin'}`}${h.reasonNote ? ` · ${h.reasonNote}` : ''}`,
        toTeam: h.toStep?.owningTeamName,
        fromTeam: h.fromStep?.owningTeamName,
      }));
    if (isAdmin) return rawHistory;
    return rawHistory.filter((item: any) => {
      return item.toTeam === currentUser?.teamName || item.fromTeam === currentUser?.teamName;
    });
  }, [client, currentUser, isAdmin]);

  const currentStepNum = client?.currentStep?.stepNumber || 1;
  const daysInStep = client?.daysInStep || 0;
  const sla = client?.currentStep?.slaDays || 0;
  const isOverSLA = daysInStep > sla;
  const initials = (client?.brandName || client?.fullName || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2);

  // Compute how long it takes to complete each step
  const durations = useMemo(() => {
    if (!client || !steps || steps.length === 0) return {};
    const historyList = [...(client.stepHistory || [])].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    const totals: Record<string, number> = {};
    
    // Find step 1 ID or first step
    const firstStep = steps.find((s: any) => s.stepNumber === 1);
    let activeStepId = firstStep?.id || client.currentStepId;
    let enteredAt = new Date(client.dateJoined || client.createdAt).getTime();
    
    for (const h of historyList) {
      const transitionTime = new Date(h.createdAt).getTime();
      if (activeStepId) {
        totals[activeStepId] = (totals[activeStepId] || 0) + (transitionTime - enteredAt);
      }
      activeStepId = h.toStepId;
      enteredAt = transitionTime;
    }
    
    // Add current active step duration
    if (activeStepId) {
      const endTime = client.status === 'completed'
        ? (historyList[historyList.length - 1] ? new Date(historyList[historyList.length - 1].createdAt).getTime() : new Date().getTime())
        : Date.now();
      totals[activeStepId] = (totals[activeStepId] || 0) + (endTime - enteredAt);
    }
    
    const formatted: Record<string, string> = {};
    steps.forEach((s: any) => {
      const ms = totals[s.id] || 0;
      if (ms <= 0) {
        formatted[s.id] = s.stepNumber < currentStepNum ? '< 1h' : '';
        return;
      }
      const mins = ms / (1000 * 60);
      const hours = mins / 60;
      const days = hours / 24;
      
      if (days >= 1) {
        formatted[s.id] = `${days.toFixed(1)}d`;
      } else if (hours >= 1) {
        formatted[s.id] = `${hours.toFixed(1)}h`;
      } else {
        formatted[s.id] = `${Math.round(mins)}m`;
      }
    });
    
    return formatted;
  }, [client, steps, currentStepNum]);

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

  // Status badge helper
  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: `${Math.max(0, daysInStep - sla)} day${Math.max(0, daysInStep - sla) !== 1 ? 's' : ''} late` },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };
  const sc = statusConfig[client.computedStatus] || statusConfig.on_track;

  return (
    <AppLayout>
      <Topbar
        title="Client Detail"
        subtitle={`${client.brandName || client.fullName} · Step ${currentStepNum}`}
        renderActions={() => isAdmin && (
          <button
            onClick={() => {
              setExportType('tasks');
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
            <Download size={14} /> Export Client Data
          </button>
        )}
      />
      <div style={{ padding: '16px 20px', flex: 1 }}>

        {/* Back */}
        <Link href="/clients" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
          padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
          transition: 'all 0.15s',
          textDecoration: 'none',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
          <ArrowLeft size={13} /> Back to Pipeline
        </Link>

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
            {isAdmin && (
              <>
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
              </>
            )}
            {isAdmin && (
              <button onClick={() => setShowAddTask(true)}
                style={{ padding: '7px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--olive)', cursor: 'pointer', color: '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-dark)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--olive)'; }}>
                Add task
              </button>
            )}
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
                Step {currentStepNum} of {steps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{client.currentStep?.name}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>Days in current step</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: isOverSLA ? 'var(--red)' : 'var(--olive)' }}>
                {daysInStep} / {sla} SLA
              </div>
            </div>
          </div>

          {/* Dynamic pipeline track */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length || 1}, 1fr)`, gap: 0, position: 'relative' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: 18, left: '5%', right: '5%', height: 2, background: 'var(--border)', zIndex: 0 }} />

            {steps.map((step, i) => {
              const stepNum = step.stepNumber;
              const completed = stepNum < currentStepNum;
              const current = stepNum === currentStepNum;
              const future = stepNum > currentStepNum;

              return (
                <div key={step.id}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, cursor: isAdmin ? 'pointer' : 'default', padding: '4px 2px' }}>
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
                    {step.name}
                    {durations[step.id] && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic', fontWeight: 400 }}>
                        ⏱️ {durations[step.id]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DETAIL GRID ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1.6fr 1fr' : '1fr', gap: 20 }}>

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

            {/* Filter controls row */}
            <div style={{
              display: 'flex',
              gap: 12,
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 32px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: 12.5,
                    outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--olive)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              {/* Status Filter */}
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All Statuses</option>
                <option value="complete">Completed</option>
                <option value="blocked">Blocked</option>
                <option value="overdue">Overdue</option>
                <option value="due_today">Due Today</option>
                <option value="pending">Pending</option>
              </select>

              {/* Team Filter */}
              <select
                value={taskTeamFilter}
                onChange={(e) => setTaskTeamFilter(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All Teams</option>
                {uniqueTeams.map(team => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>

              {/* Client Filter */}
              <select
                value={taskClientFilter}
                onChange={(e) => setTaskClientFilter(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All Clients</option>
                {uniqueClients.map(cName => (
                  <option key={cName} value={cName}>{cName}</option>
                ))}
              </select>
            </div>

            {/* Table layout */}
            <div
              onScroll={handleTaskScroll}
              style={{
                maxHeight: 400,
                overflowY: 'auto',
                overflowX: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                margin: '16px 20px 20px',
                background: 'var(--surface-2)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 500 }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={thStyle}>Task Title</th>
                    <th style={thStyle}>Assignee</th>
                    <th style={thStyle}>Due / Completed</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scrollableTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        No tasks match the active filters.
                      </td>
                    </tr>
                  ) : (
                    scrollableTasks.map((task: any) => {
                      const done = task._isDone;
                      const isBlocked = task._isBlocked;
                      const stripe = done ? 'var(--green)' : isBlocked ? '#6B3FA0' : task._isOverdue ? 'var(--red)' : 'var(--olive)';
                      
                      const dueFormatted = format(new Date(task.dueDate), 'EEE d MMM');
                      const completedAt = task.completedAt ? format(new Date(task.completedAt), "d MMM, h:mma") : null;
                      const whenLabel = done && completedAt ? completedAt : dueFormatted;

                      return (
                        <tr
                          key={task.id}
                          style={{
                            borderBottom: '1px solid var(--surface-2)',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 3, height: 16, background: stripe, borderRadius: 2, flexShrink: 0 }} />
                              <div style={{
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: 'var(--ink)',
                                textDecoration: done ? 'line-through' : 'none'
                              }}>
                                {task.title}
                              </div>
                            </div>
                            {task.blockerNote && (
                              <div style={{ fontSize: 11.5, color: '#6B3FA0', marginTop: 4, fontStyle: 'italic', paddingLeft: 13 }}>
                                "Client Blocked: {task.blockerNote}"
                              </div>
                            )}

                            {blockerTaskId === task.id && (
                              <div style={{ marginTop: 10, display: 'flex', gap: 8, paddingLeft: 13 }}>
                                <input
                                  autoFocus
                                  value={blockerNote}
                                  onChange={e => setBlockerNote(e.target.value)}
                                  placeholder="Describe the blocker..."
                                  style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, outline: 'none' }}
                                />
                                <button
                                  onClick={() => blockerMut.mutate({ taskId: task.id, note: blockerNote })}
                                  disabled={!blockerNote || blockerMut.isPending}
                                  style={{ padding: '7px 12px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                                >
                                  {blockerMut.isPending ? '...' : 'Raise'}
                                </button>
                                <button
                                  onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }}
                                  style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink-2)' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500 }}>
                              {task._assigneeName}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                              {done ? 'Completed' : 'Due'}: {whenLabel}
                            </span>
                            {done && task.completedAt && task.createdAt && (
                              <span style={{ color: 'var(--olive-dark)', display: 'block', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                                {(() => {
                                  const ms = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
                                  const days = ms / (1000 * 60 * 60 * 24);
                                  if (days >= 1) return `Took ${days.toFixed(1)}d`;
                                  const hours = ms / (1000 * 60 * 60);
                                  if (hours >= 1) return `Took ${hours.toFixed(1)}h`;
                                  const mins = ms / (1000 * 60);
                                  return `Took ${Math.round(mins)}m`;
                                })()}
                              </span>
                            )}
                            {task.priority === 'high' && !done && (
                              <span style={{ color: 'var(--red)', display: 'block', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                                High priority
                              </span>
                            )}
                          </td>
                          <td style={tdStyle}>
                            {done ? (
                              <span style={chipStyle('var(--green-bg)', 'var(--green)')}>DONE</span>
                            ) : isBlocked ? (
                              <span style={chipStyle('#F0E8FA', '#6B3FA0')}>BLOCKED</span>
                            ) : task.status === 'in_progress' ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <span style={chipStyle('var(--olive-50)', 'var(--olive-dark)')}>IN PROGRESS</span>
                                <TaskTimer
                                  isTimerRunning={task.isTimerRunning}
                                  timerStartedAt={task.timerStartedAt}
                                  timeSpentSeconds={task.timeSpentSeconds}
                                />
                              </div>
                            ) : task._daysLate > 0 ? (
                              <span style={chipStyle('var(--red-bg)', 'var(--red)')}>+{task._daysLate}d</span>
                            ) : task._isDueToday ? (
                              <span style={chipStyle('var(--amber-bg)', 'var(--amber)')}>TODAY</span>
                            ) : (
                              <span style={chipStyle('var(--olive-50)', 'var(--olive-dark)')}>in {task._daysAhead}d</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {!done && blockerTaskId !== task.id && (
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <SmallTaskButton
                                  label="Complete"
                                  icon={<Check size={11} />}
                                  color="var(--green)"
                                  onClick={(e) => { e.stopPropagation(); handleCheck(task.id, task.status); }}
                                />
                                <SmallTaskButton
                                  label="Blocker"
                                  icon={<TriangleAlert size={11} />}
                                  color="#6B3FA0"
                                  onClick={(e) => { e.stopPropagation(); setBlockerTaskId(task.id); }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>


          {/* Step History timeline */}
          {isAdmin && (
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
          )}
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
        {completeTaskId && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={(e) => { if (e.target === e.currentTarget) setCompleteTaskId(null); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Complete Task</div>
                <button onClick={() => setCompleteTaskId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Please provide proof of work details (optional but recommended) to upload to the Vault.</p>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Proof Link (e.g. Drive, Loom, Figma)</label>
                  <input type="url" value={proofLink} onChange={e => setProofLink(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Comment / Description</label>
                  <textarea value={proofDescription} onChange={e => setProofDescription(e.target.value)} placeholder="Any additional details or comments..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
                <button onClick={() => { setCompleteTaskId(null); setProofLink(''); setProofDescription(''); }} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
                <button
                  onClick={() => {
                    completeMut.mutate({ id: completeTaskId, proofLink, proofDescription });
                    setCompleteTaskId(null);
                    setProofLink('');
                    setProofDescription('');
                  }}
                  style={{ padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--green)', color: '#fff', cursor: 'pointer' }}
                >
                  Submit & Complete
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── EXPORT MODAL ── */}
        {showExportModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
              
              {/* Modal header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Export Client Data: {client.brandName || client.fullName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Filter and download reports for this specific client in CSV or PDF.</div>
                </div>
                <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
                
                {/* Select export type */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Select Export Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {[
                      { type: 'client_full', label: 'Client Full Report', desc: 'Active & completed task progress summary' },
                      { type: 'tasks', label: 'Tasks List', desc: 'Raw tasks, assignees & status information' }
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => setExportType(item.type)}
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
                </div>

                {/* Filters Section */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Filter Options</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Start Date (Due Date)</label>
                      <input type="date" value={expStartDate} onChange={e => setExpStartDate(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>End Date (Due Date)</label>
                      <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
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

                    {/* Status Filter */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Task Status</label>
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
                  </div>
                </div>
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
                  params.set('clientId', client.id);
                  if (expStartDate) params.set('startDate', expStartDate);
                  if (expEndDate) params.set('endDate', expEndDate);
                  if (expStepId) params.set('stepId', expStepId);
                  if (expStatus) params.set('status', expStatus);
                  if (expTeam) params.set('team', expTeam);
                  if (expAssignedToId) params.set('assignedToId', expAssignedToId);
                  if (expPriority) params.set('priority', expPriority);
                  if (expCompleted !== 'all') params.set('completed', expCompleted);
                  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                  if (token) params.set('token', token);
                  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${exportType}_client_${client.id}_export_${Date.now()}.csv`;
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
                  params.set('clientId', client.id);
                  if (expStartDate) params.set('startDate', expStartDate);
                  if (expEndDate) params.set('endDate', expEndDate);
                  if (expStepId) params.set('stepId', expStepId);
                  if (expStatus) params.set('status', expStatus);
                  if (expTeam) params.set('team', expTeam);
                  if (expAssignedToId) params.set('assignedToId', expAssignedToId);
                  if (expPriority) params.set('priority', expPriority);
                  if (expCompleted !== 'all') params.set('completed', expCompleted);
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
      </div>
    </AppLayout>
  );
}

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

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--ink-2)',
  fontSize: 12.5,
  fontWeight: 500,
  outline: 'none',
  cursor: 'pointer',
  minWidth: 120,
};

const thStyle: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 11.5,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  color: 'var(--muted)',
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 18px',
  verticalAlign: 'middle',
};

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
