'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X, Check, TriangleAlert, CircleCheck, Clock, Search, ChevronLeft, ChevronRight, Download, TrendingUp, PieChart, Pencil, FileText, Move, Activity, Settings, Plus, Edit2, Trash2 } from 'lucide-react';
import { USE_MOCK, MOCK_CLIENTS, MOCK_STEPS, MOCK_CLIENT_DETAIL } from '@/lib/mockData';
import { useFormDraft } from '@/lib/useFormDraft';
import { format, addDays, differenceInCalendarDays, startOfDay, isPast, isToday } from 'date-fns';
import { ManageStepsPanel } from '@/app/settings/steps/page';
import ActionDropdown from '@/components/ui/ActionDropdown';
import UpdateClientModal from '@/components/pipeline/UpdateClientModal';
import UpdateTaskModal from '@/components/pipeline/UpdateTaskModal';

// Short step labels for the pipeline track
const STEP_LABELS = [
  'Onboarding', 'Strategy', 'Brand Setup', 'Funnel Build',
  'Ad Creative', 'Ad Launch', 'Automation', 'Event Prep', 'Event Launch',
];

interface ClientDetailPaneProps {
  id?: string | null;
  onClearSelection?: () => void;
  embedded?: boolean;
}

export default function ClientDetailPane({
  id: propId,
  onClearSelection,
  embedded = false,
}: ClientDetailPaneProps) {
  const { id: paramId } = useParams();
  const id = propId ?? (paramId ? String(paramId) : null);
  const router = useRouter();
  const qc = useQueryClient();
  const [showMoveStep, setShowMoveStep] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [showStepConfig, setShowStepConfig] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [showUpdateClient, setShowUpdateClient] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
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
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);

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

  const declineExtensionMut = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/tasks/${taskId}/approve-extension`, {
        method: 'PATCH',
        body: JSON.stringify({ approved: false }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const deleteClientMut = useMutation({
    mutationFn: () => apiFetch(`/api/clients/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      router.push('/clients');
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete client');
    }
  });

  const deleteTaskMut = useMutation({
    mutationFn: (taskId: string) => apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete task');
    }
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

  const currentTasks: any[] = client?.tasks || [];
  const filteredTasks = useMemo(() => {
    if (!client) return [];
    return [...currentTasks].sort((a: any, b: any) => {
      const aDone = a.status === 'complete';
      const bDone = b.status === 'complete';
      if (aDone !== bDone) {
        return aDone ? 1 : -1;
      }
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aTime - bTime;
    });
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
      // Team-scope enforcement: team leaders only see their team's tasks
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

  const teamsListNames = useMemo(() => (teamsList || []).map((t: any) => t.name || String(t)), [teamsList]);

  // Step changes over time line chart data
  const stepTransitions = useMemo(() => {
    if (!client || !steps || steps.length === 0) return [];
    
    const historyList = [...(client.stepHistory || [])].sort(
      (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    const points: { date: Date; stepNumber: number; label: string }[] = [];
    
    const joinedDate = new Date(client.dateJoined || client.createdAt || new Date());
    points.push({
      date: joinedDate,
      stepNumber: 1,
      label: 'Joined',
    });
    
    historyList.forEach((h: any) => {
      const d = new Date(h.createdAt);
      const stepNum = h.toStep?.stepNumber || steps.find((s: any) => s.id === h.toStepId)?.stepNumber || 1;
      points.push({
        date: d,
        stepNumber: stepNum,
        label: h.toStep?.name || `Step ${stepNum}`,
      });
    });
    
    const now = new Date();
    const currentStepNum = client.currentStep?.stepNumber || steps.find((s: any) => s.id === client.currentStepId)?.stepNumber || 1;
    
    const entered = client.stepEnteredAt ? new Date(client.stepEnteredAt) : null;
    if (entered && entered.getTime() > points[points.length - 1].date.getTime()) {
      points.push({
        date: entered,
        stepNumber: currentStepNum,
        label: client.currentStep?.name || `Step ${currentStepNum}`,
      });
    }
    
    if (now.getTime() > points[points.length - 1].date.getTime()) {
      points.push({
        date: now,
        stepNumber: currentStepNum,
        label: client.currentStep?.name || `Step ${currentStepNum}`,
      });
    } else if (points.length === 1) {
      points.push({
        date: new Date(now.getTime() + 1000),
        stepNumber: currentStepNum,
        label: client.currentStep?.name || `Step ${currentStepNum}`,
      });
    }
    
    return points;
  }, [client, steps]);

  const lineChartData = useMemo(() => {
    const width = 500;
    const height = 180;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    if (stepTransitions.length === 0) {
      return {
        points: [],
        pathD: '',
        areaD: '',
        tMin: 0,
        tMax: 0,
        tRange: 1,
        width,
        height,
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
        chartWidth,
        chartHeight
      };
    }
    
    const tMin = stepTransitions[0].date.getTime();
    const tMax = stepTransitions[stepTransitions.length - 1].date.getTime();
    const tRange = Math.max(1, tMax - tMin);
    
    const maxStep = steps.length || 9;
    
    const points = stepTransitions.map(pt => {
      const x = paddingLeft + ((pt.date.getTime() - tMin) / tRange) * chartWidth;
      const y = paddingTop + chartHeight - ((pt.stepNumber - 1) / Math.max(1, maxStep - 1)) * chartHeight;
      return { x, y, ...pt };
    });
    
    const pathD = points.length > 0 
      ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : '';
      
    const areaD = points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
      : '';
      
    return { points, pathD, areaD, tMin, tMax, tRange, width, height, paddingLeft, paddingRight, paddingTop, paddingBottom, chartWidth, chartHeight };
  }, [stepTransitions, steps]);

  // Task status counts for pie chart
  const taskStatusCounts = useMemo(() => {
    const counts = {
      complete: 0,
      blocked: 0,
      in_progress: 0,
      overdue: 0,
      due_today: 0,
      pending: 0,
    };
    
    processedTasks.forEach((t: any) => {
      const cond = t._condition as keyof typeof counts;
      if (counts[cond] !== undefined) {
        counts[cond]++;
      } else {
        counts['pending']++;
      }
    });
    
    return counts;
  }, [processedTasks]);

  const pieSlices = useMemo(() => {
    const total = processedTasks.length;
    if (total === 0) return [];
    
    const data = [
      { label: 'Completed', count: taskStatusCounts.complete, color: 'var(--green)' },
      { label: 'Blocked', count: taskStatusCounts.blocked, color: 'var(--blocked)' },
      { label: 'Overdue', count: taskStatusCounts.overdue, color: 'var(--red)' },
      { label: 'Due Today', count: taskStatusCounts.due_today, color: 'var(--amber)' },
      { label: 'In Progress', count: taskStatusCounts.in_progress, color: 'var(--olive)' },
      { label: 'Pending', count: taskStatusCounts.pending, color: 'var(--muted)' },
    ].filter(d => d.count > 0);
    
    let currentPercent = 0;
    return data.map(d => {
      const percent = d.count / total;
      const startP = currentPercent;
      currentPercent += percent;
      const endP = currentPercent;
      
      const x1 = Math.cos(2 * Math.PI * startP);
      const y1 = Math.sin(2 * Math.PI * startP);
      const x2 = Math.cos(2 * Math.PI * endP);
      const y2 = Math.sin(2 * Math.PI * endP);
      
      const largeArcFlag = percent > 0.5 ? 1 : 0;
      const r = 40;
      
      const pathD = percent >= 0.999
        ? ''
        : `M 0 0 L ${x1 * r} ${y1 * r} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2 * r} ${y2 * r} Z`;
        
      return {
        ...d,
        percent,
        pathD,
        isFull: percent >= 0.999,
      };
    });
  }, [taskStatusCounts, processedTasks]);

  if (isLoading) {
    if (embedded) {
      return (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Instrument Serif, serif', fontSize: 20 }}>Loading client…</div>
      );
    }
    return (
      <AppLayout>
        <Topbar title="Client Detail" />
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Instrument Serif, serif', fontSize: 20 }}>Loading client…</div>
      </AppLayout>
    );
  }

  if (!client) {
    if (embedded) {
      return (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--red)', fontSize: 15 }}>Client not found.</div>
      );
    }
    return (
      <AppLayout>
        <Topbar title="Client Detail" />
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--red)', fontSize: 15 }}>Client not found.</div>
      </AppLayout>
    );
  }

  // Status badge helper
  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: `${Math.max(0, daysInStep - sla)} day${Math.max(0, daysInStep - sla) !== 1 ? 's' : ''} late` },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };
  const sc = statusConfig[client.computedStatus] || statusConfig.on_track;



  const clientActions = [
    // Vault link: admin-only
    ...(isAdmin ? [
      {
        label: 'View vault',
        icon: <FileText size={13} />,
        onClick: () => {
          router.push(`/vault?search=${encodeURIComponent(client.brandName || client.fullName)}`);
        },
      },
    ] : []),
    ...(isAdmin ? [
      {
        label: 'Move step',
        icon: <Move size={13} />,
        onClick: () => setShowMoveStep(true),
      },
      {
        label: 'Change status',
        icon: <Activity size={13} />,
        onClick: () => setShowChangeStatus(true),
      },
      {
        label: 'Step config',
        icon: <Settings size={13} />,
        onClick: () => setShowStepConfig(true),
      },
      {
        label: 'Add task',
        icon: <Plus size={13} />,
        onClick: () => setShowAddTask(true),
      },
      {
        label: 'Update',
        icon: <Edit2 size={13} />,
        onClick: () => setShowUpdateClient(true),
      },
      {
        label: 'Delete',
        icon: <Trash2 size={13} />,
        onClick: () => {
          if (confirm(`Are you sure you want to delete client "${client.brandName || client.fullName}"? This will delete all associated steps, tasks, documents, and history. This action cannot be undone.`)) {
            deleteClientMut.mutate();
          }
        },
        danger: true,
      }
    ] : []),
  ];

  const content = (
    <div style={{ padding: '16px 20px', flex: 1 }}>
      {(deleteClientMut.isPending || deleteTaskMut.isPending) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20,25,12,0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid #E5E4DC',
            borderTop: '3px solid var(--olive)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ marginTop: 16, color: '#fff', fontSize: 14, fontWeight: 500 }}>Processing request...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Back / Close button */}
      {!embedded ? (
        <Link href="/clients" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
          padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
          transition: 'all 0.15s',
          textDecoration: 'none',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}>
          <ArrowLeft size={13} /> Back to ClientLists
        </Link>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={onClearSelection} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            <X size={13} /> Close details
          </button>
        </div>
      )}

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
            <ActionDropdown align="right" actions={clientActions} />
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

        {/* ── CLIENT ANALYTICS (CHARTS) ────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          
          {/* Step Changes Over Time */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} style={{ color: 'var(--olive)' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Step Progress Over Time</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Client's journey and transitions through pipeline steps</div>
              </div>
            </div>
            
            <div style={{ width: '100%', height: 180, position: 'relative' }}>
              {(() => {
                const { points, pathD, areaD, width, height, paddingTop, paddingBottom, chartHeight } = lineChartData;
                const maxStep = steps.length || 9;
                
                if (points.length === 0) {
                  return (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
                      No step history available.
                    </div>
                  );
                }
                
                return (
                  <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="stepChartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--olive)" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="var(--olive)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    
                    {/* Grid lines for each step */}
                    {steps.map((s: any) => {
                      const y = paddingTop + chartHeight - ((s.stepNumber - 1) / Math.max(1, maxStep - 1)) * chartHeight;
                      return (
                        <g key={s.id}>
                          <line x1={40} y1={y} x2={width - 20} y2={y} stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3 3" />
                          <text x={32} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--muted)" fontWeight="600">S{s.stepNumber}</text>
                        </g>
                      );
                    })}
                    
                    {/* Area path */}
                    {areaD && <path d={areaD} fill="url(#stepChartGrad)" />}
                    
                    {/* Line path */}
                    {pathD && <path d={pathD} fill="none" stroke="var(--olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                    
                    {/* Points on chart */}
                    {points.map((p, idx) => (
                      <g key={idx} style={{ cursor: 'pointer' }}>
                        <circle cx={p.x} cy={p.y} r="4.5" fill="var(--surface)" stroke="var(--olive)" strokeWidth="2.5" />
                        <title>{`${p.label}\nDate: ${format(p.date, 'd MMM, yyyy')}`}</title>
                      </g>
                    ))}
                    
                    {/* X-axis date labels */}
                    {(() => {
                      const labelsToRender = [];
                      if (points.length > 0) {
                        labelsToRender.push(points[0]);
                        if (points.length > 2) {
                          labelsToRender.push(points[Math.floor(points.length / 2)]);
                        }
                        if (points.length > 1) {
                          labelsToRender.push(points[points.length - 1]);
                        }
                      }
                      return labelsToRender.map((p, idx) => (
                        <text key={idx} x={p.x} y={height - 10} textAnchor={idx === 0 ? 'start' : idx === labelsToRender.length - 1 ? 'end' : 'middle'} fontSize="9.5" fill="var(--muted)" fontWeight="600">
                          {format(p.date, 'd MMM')}
                        </text>
                      ));
                    })()}
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* Task Status Distribution */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PieChart size={16} style={{ color: 'var(--olive)' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Task Status Distribution</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Breakdown of all task states for this client</div>
              </div>
            </div>
            
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 24, minHeight: 180 }}>
              {/* Donut chart */}
              <div style={{ width: 180, height: 180, flexShrink: 0, position: 'relative' }}>
                <svg viewBox="-45 -45 90 90" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', overflow: 'visible' }}>
                  {pieSlices.length === 0 ? (
                    <circle cx="0" cy="0" r="40" fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1" />
                  ) : (
                    pieSlices.map((slice, idx) => {
                      if (slice.isFull) {
                        return (
                          <circle
                            key={idx}
                            cx="0"
                            cy="0"
                            r="40"
                            fill={slice.color}
                            style={{
                              transform: hoveredSlice === idx ? 'scale(1.06)' : 'scale(1)',
                              transformOrigin: '0px 0px',
                              transition: 'all 0.2s',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={() => setHoveredSlice(idx)}
                            onMouseLeave={() => setHoveredSlice(null)}
                          />
                        );
                      }
                      return (
                        <path
                          key={idx}
                          d={slice.pathD}
                          fill={slice.color}
                          stroke="var(--surface)"
                          strokeWidth="1.2"
                          style={{
                            transform: hoveredSlice === idx ? 'scale(1.06)' : 'scale(1)',
                            transformOrigin: '0px 0px',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={() => setHoveredSlice(idx)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      );
                    })
                  )}
                  {/* Inner cutout for donut chart */}
                  <circle cx="0" cy="0" r="28" fill="var(--surface)" />
                  {hoveredSlice !== null && pieSlices[hoveredSlice] ? (
                    <>
                      <text x="0" y="-8" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="var(--muted)" transform="rotate(90)" style={{ letterSpacing: '0.5px' }}>
                        {pieSlices[hoveredSlice].label.toUpperCase()}
                      </text>
                      <text x="0" y="5" textAnchor="middle" fontSize="11" fontWeight="800" fill={pieSlices[hoveredSlice].color} transform="rotate(90)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {pieSlices[hoveredSlice].count}
                      </text>
                      <text x="0" y="15" textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--muted)" transform="rotate(90)">
                        {Math.round(pieSlices[hoveredSlice].percent * 100)}%
                      </text>
                    </>
                  ) : (
                    <>
                      <text x="0" y="-6" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="var(--muted)" transform="rotate(90)" style={{ letterSpacing: '0.5px' }}>
                        TOTAL TASKS
                      </text>
                      <text x="0" y="8" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink)" transform="rotate(90)" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {processedTasks.length}
                      </text>
                    </>
                  )}
                </svg>
              </div>
              
              {/* Legend with percentages */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                {(() => {
                  const items = [
                    { label: 'Completed', count: taskStatusCounts.complete, color: 'var(--green)' },
                    { label: 'Blocked', count: taskStatusCounts.blocked, color: 'var(--blocked)' },
                    { label: 'Overdue', count: taskStatusCounts.overdue, color: 'var(--red)' },
                    { label: 'Due Today', count: taskStatusCounts.due_today, color: 'var(--amber)' },
                    { label: 'In Progress', count: taskStatusCounts.in_progress, color: 'var(--olive)' },
                    { label: 'Pending', count: taskStatusCounts.pending, color: 'var(--muted)' },
                  ];
                  const total = processedTasks.length || 1;
                  return items.map((item, idx) => {
                    if (item.count === 0) return null;
                    const pct = Math.round((item.count / total) * 100);
                    const sliceIdx = pieSlices.findIndex(s => s.label === item.label);
                    
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: hoveredSlice === sliceIdx ? 'var(--surface-2)' : 'transparent',
                          transition: 'all 0.15s',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={() => { if (sliceIdx !== -1) setHoveredSlice(sliceIdx); }}
                        onMouseLeave={() => setHoveredSlice(null)}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                            {item.count} task{item.count !== 1 ? 's' : ''} ({pct}%)
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                {processedTasks.length === 0 && (
                  <div style={{ gridColumn: 'span 2', color: 'var(--muted)', fontSize: 12.5 }}>
                    No tasks assigned to this client.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── DETAIL GRID ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '78fr 22fr' : '1fr', gap: 20 }}>

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
                maxHeight: 500,
                overflowY: 'auto',
                overflowX: 'hidden',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                margin: '16px 20px 20px',
                background: 'var(--surface-2)',
                position: 'relative',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ ...thStyle, width: '35%' }}>TASK & DETAILS</th>
                    <th style={{ ...thStyle, width: '20%' }}>ASSIGNEE</th>
                    <th style={{ ...thStyle, width: '25%' }}>CURRENT STEP & TIMING</th>
                    <th style={{ ...thStyle, width: '10%' }}>ALERT TYPE</th>
                    <th style={{ ...thStyle, width: '20%', textAlign: 'center' }}>ACTIONS</th>
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
                          <td style={{ ...tdStyle, verticalAlign: 'top', width: '35%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 3, height: 16, background: stripe, borderRadius: 2, flexShrink: 0 }} />
                              <div style={{
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: 'var(--ink)',
                                textDecoration: done ? 'line-through' : 'none',
                                wordBreak: 'break-word',
                              }}>
                                {task.title}
                              </div>
                            </div>
                            {task.description && (
                              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, paddingLeft: 13, wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.4 }}>
                                {task.description}
                              </div>
                            )}
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
                          <td style={{ ...tdStyle, verticalAlign: 'top', width: '20%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{task._assigneeName}</div>
                              {task._teamName && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{task._teamName}</div>}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, verticalAlign: 'top', width: '25%', fontSize: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div>
                                <strong style={{ color: 'var(--muted)' }}>Step:</strong>{' '}
                                <span style={{ color: 'var(--ink)' }}>
                                  {steps.find((s: any) => s.id === task.stepId)?.name || '—'}
                                </span>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--muted)' }}>Due:</strong>{' '}
                                <span style={{ color: 'var(--ink)' }}>{whenLabel}</span>
                              </div>
                              {done && task.completedAt && task.createdAt && (
                                <div style={{ color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>
                                  {(() => {
                                    const ms = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
                                    const days = ms / (1000 * 60 * 60 * 24);
                                    if (days >= 1) return `Took ${days.toFixed(1)}d`;
                                    const hours = ms / (1000 * 60 * 60);
                                    if (hours >= 1) return `Took ${hours.toFixed(1)}h`;
                                    const mins = ms / (1000 * 60);
                                    return `Took ${Math.round(mins)}m`;
                                  })()}
                                </div>
                              )}
                              {task.priority === 'high' && !done && (
                                <div style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>
                                  High priority
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ ...tdStyle, verticalAlign: 'top', width: '10%' }}>
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
                              <span style={chipStyle('var(--red-bg)', 'var(--red)')}>OVERDUE</span>
                            ) : task._isDueToday ? (
                              <span style={chipStyle('var(--amber-bg)', 'var(--amber)')}>DUE TODAY</span>
                            ) : (
                              <span style={chipStyle('var(--border)', 'var(--muted)')}>PENDING</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, verticalAlign: 'middle', textAlign: 'center', width: '20%' }}>
                            {(() => {
                              const dropdownActions = [];

                              if (!done) {
                                dropdownActions.push({
                                  label: 'Complete Task',
                                  icon: <Check size={13} />,
                                  onClick: () => handleCheck(task.id, task.status),
                                });

                                if (task.status === 'extension_requested') {
                                  dropdownActions.push({
                                    label: 'Cancel Extension',
                                    icon: <X size={13} />,
                                    onClick: () => {
                                      if (confirm("Cancel this extension request?")) {
                                        declineExtensionMut.mutate(task.id);
                                      }
                                    },
                                    danger: true,
                                  });
                                }

                                if (task.status !== 'blocked' && task.status !== 'extension_requested') {
                                  dropdownActions.push({
                                    label: 'Raise Blocker',
                                    icon: <TriangleAlert size={13} />,
                                    onClick: () => setBlockerTaskId(task.id),
                                    danger: true,
                                  });
                                }
                              }

                              if (isAdmin) {
                                dropdownActions.push({
                                  label: 'Update',
                                  icon: <Edit2 size={13} />,
                                  onClick: () => setEditingTask(task),
                                });
                                dropdownActions.push({
                                  label: 'Delete',
                                  icon: <Trash2 size={13} />,
                                  onClick: () => {
                                    if (confirm(`Are you sure you want to delete task "${task.title}"?`)) {
                                      deleteTaskMut.mutate(task.id);
                                    }
                                  },
                                  danger: true,
                                });
                              }

                              return (
                                <ActionDropdown align="right" actions={dropdownActions} />
                              );
                            })()}
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowMoveStep(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Move to a different step</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Incomplete tasks in the current step will be cancelled.</div>
                </div>
                <button onClick={() => setShowMoveStep(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>
              <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Target Step</label>
                  <select value={moveToStepId} onChange={e => moveDraft.setData(p => ({ ...p, moveToStepId: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}>
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
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowChangeStatus(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Change client status</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    Current: <strong>{client.status}</strong>. All teams in the org will be notified.
                  </div>
                </div>
                <button onClick={() => setShowChangeStatus(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>
              <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>New status</label>
                  <select value={newStatus} onChange={e => statusDraft.setData(p => ({ ...p, newStatus: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">Select a status...</option>
                    {(['active', 'paused', 'completed', 'churned'] as const).map(s => (
                      <option key={s} value={s} disabled={s === client.status}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Reason (required)</label>
                  <textarea value={statusReason} onChange={e => statusDraft.setData(p => ({ ...p, reasonNote: e.target.value }))} placeholder="Why is this status changing?"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowAddTask(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add Task</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    For {client?.brandName || client?.fullName} · {client?.currentStep?.name ? `Step ${client.currentStep.stepNumber} — ${client.currentStep.name}` : 'this client'}
                  </div>
                </div>
                <button onClick={() => setShowAddTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>

              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                {/* Team (dropdown) — drives assignee filter */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Team *</label>
                  <select
                    value={addTaskForm.teamName}
                    onChange={e => setAddTaskForm(f => ({ ...f, teamName: e.target.value, assignedToId: '' }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}
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
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}
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
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
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
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', opacity: !addTaskForm.teamName ? 0.6 : 1, boxSizing: 'border-box' }}
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
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}
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
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {addTaskError && (
                  <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                    {addTaskError}
                  </div>
                )}
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={(e) => { if (e.target === e.currentTarget) setCompleteTaskId(null); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Complete Task</div>
                <button onClick={() => setCompleteTaskId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
              </div>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Please provide proof of work details (optional but recommended) to upload to the Vault.</p>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Proof Link (e.g. Drive, Loom, Figma)</label>
                  <input type="url" value={proofLink} onChange={e => setProofLink(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Comment / Description</label>
                  <textarea value={proofDescription} onChange={e => setProofDescription(e.target.value)} placeholder="Any additional details or comments..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
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
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Export Client Data: {client.brandName || client.fullName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Filter and download reports for this specific client in CSV or PDF.</div>
                </div>
                <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }} className="custom-scrollbar">
                
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>End Date (Due Date)</label>
                      <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }} />
                    </div>

                    {/* Step Filter */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Step</label>
                      <select value={expStepId} onChange={e => setExpStepId(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}>
                        <option value="all">All States</option>
                        <option value="true">Completed Only</option>
                        <option value="false">Pending Only</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, flexShrink: 0, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
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

        {/* ── STEP CONFIGURATION MODAL ─────────────────────────────────── */}
        {showStepConfig && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setShowStepConfig(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexShrink: 0 }}>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Step Configuration — {client.brandName || client.fullName}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Configure steps and tasks for this client onboarding pipeline.</div>
                </div>
                <button onClick={() => setShowStepConfig(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-2)' }}>
                <ManageStepsPanel
                  clientId={id!}
                  clientName={client.brandName || client.fullName}
                  teamsList={teamsListNames}
                  onClearSelection={() => setShowStepConfig(false)}
                />
              </div>
            </div>
          </div>
        )}

        {showUpdateClient && isAdmin && (
          <UpdateClientModal
            open={showUpdateClient}
            onClose={() => setShowUpdateClient(false)}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['client', id] })}
            client={client}
          />
        )}
        {editingTask && isAdmin && (
          <UpdateTaskModal
            open={!!editingTask}
            onClose={() => setEditingTask(null)}
            onSuccess={() => qc.invalidateQueries({ queryKey: ['client', id] })}
            task={editingTask}
            users={usersList}
          />
        )}
      </div>
  );

  if (embedded) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: 'var(--surface-2)' }}>
        {content}
      </div>
    );
  }

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
      {content}
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
  position: 'sticky',
  top: 0,
  zIndex: 10,
  background: 'var(--surface)',
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
