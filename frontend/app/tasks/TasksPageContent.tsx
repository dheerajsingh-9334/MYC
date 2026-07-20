'use client';
import React, { useState, useEffect, useMemo, Fragment, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import CSVImportModal from '@/components/ui/CSVImportModal';
import SectionCard from '@/components/ui/SectionCard';
import { ClientCombobox, ClientOption } from '@/components/ui/ClientCombobox';
import {
  isPast, isToday, format, addDays, differenceInDays,
} from 'date-fns';
import { USE_MOCK, MOCK_TASKS, MOCK_CLIENTS } from '@/lib/mockData';
import {
  Search, XCircle, RotateCcw, ChevronLeft, ChevronRight, ChevronDown,
  ArrowUpDown, CircleCheck, Clock, TriangleAlert, Eye,
  Check, X, FolderOpen, Link2, Upload, FileText, Plus, ExternalLink, AlertCircle,
  Play, Pause, Pin, Ban, Filter, Edit2, Trash2, ChevronsDown, ChevronsUp, Hand
} from 'lucide-react';
import ActionDropdown from '@/components/ui/ActionDropdown';
import UpdateTaskModal from '@/components/pipeline/UpdateTaskModal';
import RaiseHandModal from '@/components/ui/RaiseHandModal';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import { LoadingSpinner, BtnSpinner } from '@/components/ui/LoadingSpinner';

const AUTO_REFRESH_MS = 30_000;
const PAGE_SIZE = 15;

// Chip filter kinds — virtual filters that don't map 1:1 to a status enum Are you sure you want to delete
type ChipKind = '' | 'overdue' | 'today' | 'rejected' | 'complete' | 'extension_requested' | 'in_progress';

export default function TasksPage() {
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [showRaiseHandModal, setShowRaiseHandModal] = useState(false);
  const [selectedTaskForProblem, setSelectedTaskForProblem] = useState<any | null>(null);

  // Filters alert
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [chipFilter, setChipFilter] = useState<ChipKind>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [tasksScope, setTasksScope] = useState<'all' | 'mine'>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = params.get('filter');
      const s = params.get('search');
      if (f) {
        setChipFilter(f as ChipKind);
      }
      if (s) {
        setSearch(s);
      }
    }
  }, []);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [sortKey, setSortKey] = useState<'dueDate' | 'title' | 'status' | 'client' | 'team'>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [taskLimit, setTaskLimit] = useState(15);

  // Reject modal
  const [rejectTaskId, setRejectTaskId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');

  // Vault modal
  const [vaultTask, setVaultTask] = useState<any>(null);
  const [vaultLinkUrl, setVaultLinkUrl] = useState('');
  const [vaultLinkTitle, setVaultLinkTitle] = useState('');
  const [vaultLinkNotes, setVaultLinkNotes] = useState('');
  const [vaultLinkErr, setVaultLinkErr] = useState('');

  // Blocker modal
  const [blockerTaskId, setBlockerTaskId] = useState<string | null>(null);
  const [blockerNote, setBlockerNote] = useState('');

  // Extend modal
  const [extendTaskId, setExtendTaskId] = useState<string | null>(null);
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');

  // Complete proof modal
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [proofLink, setProofLink] = useState('');
  const [proofDescription, setProofDescription] = useState('');

  // Add Task Modal State
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskForm, setAddTaskForm] = useState({
    clientId: '',
    stepId: '',
    teamName: '',
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    assignedToId: '',
  });
  const [addTaskError, setAddTaskError] = useState('');
  const [addTaskFieldErrors, setAddTaskFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!USE_MOCK) setUser(getUser());
  }, []);

  const isAdmin = user?.role === 'admin';
  const isLeader = user?.role === 'team_leader';
  const isStaff = user?.role === 'team_member';

  // Staff always see only their own tasks (locked); team leaders see their team's tasks (backend-filtered)
  useEffect(() => {
    if (isStaff) setTasksScope('mine');
  }, [isStaff]);

  const { data: liveTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK,
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: liveClients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK && (showRaiseHandModal || (showAddTask && isAdmin)),
    retry: false,
  });

  const { data: liveUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK && ((showAddTask && isAdmin) || (!!editingTask && isAdmin)),
    retry: false,
  });

  const { data: addTaskClientSteps = [] } = useQuery({
    queryKey: ['steps', addTaskForm.clientId],
    queryFn: () => apiFetch(`/api/steps?clientId=${addTaskForm.clientId}`),
    enabled: !USE_MOCK && !!addTaskForm.clientId && showAddTask && isAdmin,
    retry: false,
  });

  const isClientTeamValid = useMemo(() => {
    if (!addTaskForm.clientId || !addTaskForm.teamName) return true;
    return (addTaskClientSteps as any[]).some(
      (s) => s.owningTeamName.toLowerCase() === addTaskForm.teamName.toLowerCase()
    );
  }, [addTaskForm.clientId, addTaskForm.teamName, addTaskClientSteps]);

  const addTaskMut = useMutation({
    mutationFn: () => apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        clientId: addTaskForm.clientId,
        stepId: addTaskForm.stepId || undefined,
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
      setAddTaskForm({ clientId: '', stepId: '', teamName: '', title: '', description: '', priority: 'normal', dueDate: '', assignedToId: '' });
      setAddTaskError('');
      setAddTaskFieldErrors({});
    },
    onError: (e: any) => setAddTaskError(e.message || 'Failed to create task'),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete task');
    }
  });

  const addTaskTeamOptions = useMemo(() => {
    // If a client is selected, restrict to teams that own steps in their pipeline
    if (addTaskForm.clientId && (addTaskClientSteps as any[]).length > 0) {
      const pipelineTeams = new Set<string>();
      (addTaskClientSteps as any[]).forEach((s) => { if (s.owningTeamName) pipelineTeams.add(s.owningTeamName); });
      return Array.from(pipelineTeams).sort();
    }
    // Fallback: all active teams from users
    const set = new Set<string>();
    (liveUsers as any[]).forEach((u) => { if (u.teamName && u.isActive !== false) set.add(u.teamName); });
    return Array.from(set).sort();
  }, [liveUsers, addTaskForm.clientId, addTaskClientSteps]);

  const addTaskAssignees = useMemo(() => {
    if (!addTaskForm.teamName) return liveUsers as any[];
    return (liveUsers as any[]).filter((u) => u.teamName === addTaskForm.teamName && u.isActive !== false);
  }, [liveUsers, addTaskForm.teamName]);

  const tasks: any[] = USE_MOCK ? MOCK_TASKS : liveTasks;

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.step?.owningTeamName) set.add(t.step.owningTeamName);
      if (t.assignedTo?.teamName) set.add(t.assignedTo.teamName);
    });
    return Array.from(set).sort();
  }, [tasks]);

  const clientOptions: ClientOption[] = useMemo(() => {
    const map = new Map<string, ClientOption>();
    tasks.forEach((t) => {
      if (!t.client?.id) return;
      const id = t.client.id;
      if (map.has(id)) return;
      map.set(id, {
        id,
        label: t.client.brandName || t.client.fullName || '—',
        subLabel: t.client.fullName && t.client.brandName ? t.client.fullName : undefined,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t) => {
      if (t.assignedTo?.id && t.assignedTo?.fullName) {
        map.set(t.assignedTo.id, t.assignedTo.fullName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (tasksScope === 'mine') {
      list = list.filter((t) => (t.assignedToId || t.assignedTo?.id) === user?.id);
    }
    if (teamFilter) list = list.filter((t) => t.step?.owningTeamName === teamFilter || t.assignedTo?.teamName === teamFilter);
    if (clientFilter) list = list.filter((t) => t.client?.id === clientFilter);
    if (priorityFilter) list = list.filter((t) => t.priority === priorityFilter);
    if (assigneeFilter) list = list.filter((t) => (t.assignedToId || t.assignedTo?.id) === assigneeFilter);

    // Chip filter — virtual predicates on top of status + due date
    if (chipFilter === 'overdue') {
      list = list.filter((t) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
    } else if (chipFilter === 'today') {
      list = list.filter((t) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && isToday(new Date(t.dueDate)));
    } else if (chipFilter === 'rejected') {
      list = list.filter((t) => t.status === 'rejected' || t.status === 'cancelled');
        } else if (chipFilter === 'complete') {
      list = list.filter((t) => t.status === 'complete');
    } else if (chipFilter === 'extension_requested') {
      list = list.filter((t) => t.status === 'extension_requested');
    } else if (chipFilter === 'in_progress') {
      list = list.filter((t) => t.status === 'in_progress');
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.title?.toLowerCase().includes(q) ||
        t.client?.brandName?.toLowerCase().includes(q) ||
        t.assignedTo?.fullName?.toLowerCase().includes(q)
      );
    }
    const cmp = (a: any, b: any) => {
      let av: any, bv: any;
      if (sortKey === 'dueDate') { av = new Date(a.dueDate).getTime(); bv = new Date(b.dueDate).getTime(); }
      else if (sortKey === 'title') { av = a.title || ''; bv = b.title || ''; }
      else if (sortKey === 'status') { av = a.status || ''; bv = b.status || ''; }
      else if (sortKey === 'client') { av = a.client?.brandName || a.client?.fullName || ''; bv = b.client?.brandName || b.client?.fullName || ''; }
      else { av = a.step?.owningTeamName || ''; bv = b.step?.owningTeamName || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    return [...list].sort(cmp);
  }, [tasks, search, chipFilter, teamFilter, clientFilter, priorityFilter, assigneeFilter, sortKey, sortDir, tasksScope, user, isAdmin, isLeader]);

  const [visibleGroupsLimit, setVisibleGroupsLimit] = useState(15);

  const groupedByClient = useMemo(() => {
    const groups: Record<string, { client: any; tasks: any[] }> = {};
    filtered.forEach((t) => {
      const clientId = t.client?.id || 'unassigned';
      if (!groups[clientId]) {
        groups[clientId] = {
          client: t.client || { id: 'unassigned', brandName: 'No Client', fullName: 'No Client' },
          tasks: [],
        };
      }
      groups[clientId].tasks.push(t);
    });
    return Object.values(groups).sort((a, b) => {
      const nameA = a.client.brandName || a.client.fullName || '';
      const nameB = b.client.brandName || b.client.fullName || '';
      return nameA.localeCompare(nameB);
    });
  }, [filtered]);

  const scrollableGroups = useMemo(() => {
    return groupedByClient.slice(0, visibleGroupsLimit);
  }, [groupedByClient, visibleGroupsLimit]);

  useEffect(() => { setVisibleGroupsLimit(15); }, [search, chipFilter, teamFilter, clientFilter, priorityFilter, assigneeFilter, sortKey, sortDir]);

  const handleTaskScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setVisibleGroupsLimit(prev => Math.min(prev + 10, groupedByClient.length));
    }
  };

  const toggleSort = (k: typeof sortKey) => {
    if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  // ── Mutations ─────────────────────────────────────────────────────────
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/api/tasks/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ rejectionNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setRejectTaskId(null); setRejectionNote(''); },
  });
  const reopenMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/reopen`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const pinMut = useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: boolean }) =>
      apiFetch(`/api/tasks/${id}/${pin ? 'pin' : 'unpin'}`, { method: 'PATCH' }),
    onSuccess: (data, variables) => {
      try {
        const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
        let updated;
        if (variables.pin) {
          updated = Array.from(new Set([...current, variables.id]));
        } else {
          updated = current.filter((x: string) => x !== variables.id);
        }
        localStorage.setItem('pinned_tasks', JSON.stringify(updated));
      } catch (err) {}
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      window.dispatchEvent(new Event('pinned-updated'));
    },
  });
  const alertMut = useMutation({
    mutationFn: ({ id, alert }: { id: string; alert: boolean }) =>
      apiFetch(`/api/tasks/${id}/${alert ? 'alert' : 'unalert'}`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      window.dispatchEvent(new Event('pinned-updated'));
    },
  });
  const completeMut = useMutation({
    mutationFn: ({ id: taskId, proofLink, proofDescription }: { id: string; proofLink?: string; proofDescription?: string }) =>
      apiFetch(`/api/tasks/${taskId}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ proofLink, proofDescription })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const blockMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/api/tasks/${id}/blocker`, { method: 'PATCH', body: JSON.stringify({ blockerNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setBlockerTaskId(null); setBlockerNote(''); },
  });

  const extendMut = useMutation({
    mutationFn: ({ id, date, reason }: { id: string; date: string; reason: string }) =>
      apiFetch(`/api/tasks/${id}/extension`, { method: 'PATCH', body: JSON.stringify({ extensionRequestedDate: date, extensionReason: reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); },
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

  // Vault mutations
  const vaultDocsQuery = useQuery({
    queryKey: ['vault-task', vaultTask?.id],
    queryFn: () => apiFetch(`/api/vault/task/${vaultTask.id}`),
    enabled: !!vaultTask,
  });

  const addVaultLink = useMutation({
    mutationFn: (body: object) => apiFetch('/api/vault/link', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vault-task', vaultTask.id] });
      qc.invalidateQueries({ queryKey: ['vault'] });
      setVaultLinkUrl('');
      setVaultLinkTitle('');
      setVaultLinkNotes('');
      setVaultLinkErr('');
    },
    onError: (e: unknown) => setVaultLinkErr(e instanceof Error ? e.message : 'Failed to save link'),
  });

  const submitVaultLink = () => {
    if (!vaultLinkUrl.trim()) { setVaultLinkErr('URL is required.'); return; }
    try { new URL(vaultLinkUrl); } catch { setVaultLinkErr('Enter a valid URL.'); return; }
    setVaultLinkErr('');
    addVaultLink.mutate({
      clientId: vaultTask.client.id,
      stepId: vaultTask.stepId,
      taskId: vaultTask.id,
      title: vaultLinkTitle || 'Drive Link',
      driveUrl: vaultLinkUrl.trim(),
      notes: vaultLinkNotes,
    });
  }; 

  const closeVaultModal = () => {
    setVaultTask(null);
    setVaultLinkUrl('');
    setVaultLinkTitle('');
    setVaultLinkNotes('');
    setVaultLinkErr('');
  };

  // Status counts — derived from the full task list, ignoring current filters items
  const counts = useMemo(() => {
    return {
      total: tasks.length,
      overdue: tasks.filter((t: any) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate))).length,
      today: tasks.filter((t: any) => t.status !== 'complete' && t.status !== 'rejected' && t.status !== 'cancelled' && isToday(new Date(t.dueDate))).length,
      rejected: tasks.filter((t: any) => t.status === 'rejected' || t.status === 'cancelled').length,
      complete: tasks.filter((t: any) => t.status === 'complete').length,
      extension_requested: tasks.filter((t: any) => t.status === 'extension_requested').length,
      in_progress: tasks.filter((t: any) => t.status === 'in_progress').length,
    };
  }, [tasks]);

  const chips: { key: ChipKind; label: string; count: number; color?: string }[] = [
    { key: '',          label: 'All',        count: counts.total },
    { key: 'overdue',   label: 'Overdue',    count: counts.overdue, color: 'var(--red)' },
    { key: 'today',     label: 'Due Today',  count: counts.today,   color: 'var(--amber)' },
    { key: 'in_progress', label: 'In Progress', count: counts.in_progress, color: 'var(--olive)' },
    { key: 'extension_requested', label: 'Extension Requested', count: counts.extension_requested, color: 'var(--blue)' },
    { key: 'rejected',  label: 'Rejected',   count: counts.rejected, color: '#B0436A' },
    { key: 'complete',  label: 'Completed',  count: counts.complete, color: 'var(--green)' },
  ];
  if (!user || isLoading) {
    return (
      <AppLayout>
        <Topbar title="Task Management" subtitle="Manage, resolve, and audit task checklists across pipelines" />
        <div style={{ padding: 'var(--page-pad)' }}>
          <TableSkeleton columnsCount={5} rowsCount={8} hasBulkActions={false} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {(deleteTaskMut.isPending || completeMut.isPending || rejectMut.isPending || blockMut.isPending || extendMut.isPending || reopenMut.isPending) && (
        <LoadingSpinner
          fullPage
          size={40}
          color="#fff"
          label={
            deleteTaskMut.isPending ? 'Deleting task...' :
            completeMut.isPending ? 'Completing task...' :
            rejectMut.isPending ? 'Rejecting task...' :
            blockMut.isPending ? 'Blocking task...' :
            extendMut.isPending ? 'Requesting extension...' :
            reopenMut.isPending ? 'Reopening task...' :
            'Processing...'
          }
        />
      )}
      <Topbar
        title={isStaff ? 'My Tasks' : isLeader ? 'Team Tasks' : tasksScope === 'all' ? 'All Tasks' : 'My Tasks'}
        subtitle={
          isStaff
            ? `${user?.fullName || 'Team Member'} · ${user?.teamName || ''}`
            : isLeader
            ? `${user?.teamName || 'Team'} · ${counts.total} tasks`
            : tasksScope === 'all'
            ? `Org-wide · ${counts.total} tasks`
            : `${user?.fullName || 'Team Member'} · ${user?.teamName || ''}`
        }
        search={search}
        setSearch={setSearch}
      />
      <div style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100vh - 56px)', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Toolbar — filter pills left, controls right */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '8px 14px', marginBottom: 14, boxSizing: 'border-box',
        }}>
          {/* Left: task count + active filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            {/* <span style={{ fontSize: 25, fontWeight: 700, color: 'var(--ink)', background: 'var(--surface-2)', padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
              {scrollableTasks.length} {scrollableTasks.length === 1 ? 'task' : 'tasks'}
            </span> */}
            {chipFilter && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>{chips.find(c => c.key === chipFilter)?.label}<X size={10} style={{ cursor: 'pointer' }} onClick={() => setChipFilter('')} /></span>)}
            {teamFilter && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>{teamFilter}<X size={10} style={{ cursor: 'pointer' }} onClick={() => setTeamFilter('')} /></span>)}
            {clientFilter && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>{clientOptions.find(c => c.id === clientFilter)?.label}<X size={10} style={{ cursor: 'pointer' }} onClick={() => setClientFilter('')} /></span>)}
            {assigneeFilter && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>{assigneeOptions.find(a => a.id === assigneeFilter)?.name}<X size={10} style={{ cursor: 'pointer' }} onClick={() => setAssigneeFilter('')} /></span>)}
            {priorityFilter && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>{priorityFilter}<X size={10} style={{ cursor: 'pointer' }} onClick={() => setPriorityFilter('')} /></span>)}
             {tasksScope === 'mine' && (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>My Tasks<X size={10} style={{ cursor: 'pointer' }} onClick={() => setTasksScope('all')} /></span>)}
             {(chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter || tasksScope === 'mine') && (
               <button onClick={() => { setChipFilter(''); setTeamFilter(''); setClientFilter(''); setAssigneeFilter(''); setPriorityFilter(''); setTasksScope('all'); }}
                 style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
             )}
          </div>

          {/* Right: Search | Expand | Collapse | Filters | Add Task */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
              <input type="text" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '5px 10px 5px 28px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            {(() => {
              const allExpanded = groupedByClient.length > 0 && groupedByClient.every(g => expandedClients[g.client.id] === true);
              return (
                <button
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    groupedByClient.forEach(g => { next[g.client.id] = !allExpanded; });
                    setExpandedClients(next);
                  }}
                  title={allExpanded ? 'Collapse all' : 'Expand all'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.color = 'var(--olive)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
                >
                  {allExpanded ? <ChevronsUp size={13} /> : <ChevronsDown size={13} />}
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              ); 
            })()}
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowFilters(prev => !prev)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, fontWeight: 600, background: (chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter || showFilters) ? 'var(--olive-50)' : 'var(--surface)', color: (chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter || showFilters) ? 'var(--olive-dark)' : 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Filter size={13} /> Filters
                {(chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter) && (<span style={{ background: 'var(--olive)', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 700, padding: '1px 5px', marginLeft: 2 }}>{[chipFilter, teamFilter, clientFilter, assigneeFilter, priorityFilter].filter(Boolean).length}</span>)}
                <ChevronDown size={11} style={{ opacity: 0.6, transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {showFilters && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 260, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 999, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Task Visibility</label><div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}><button onClick={() => setTasksScope('all')} style={{ flex: 1, padding: '6px 0', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'all' ? 'var(--olive)' : 'transparent', color: tasksScope === 'all' ? '#fff' : 'var(--ink-2)' }}>All Tasks</button><button onClick={() => setTasksScope('mine')} style={{ flex: 1, padding: '6px 0', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'mine' ? 'var(--olive)' : 'transparent', color: tasksScope === 'mine' ? '#fff' : 'var(--ink-2)' }}>My Tasks</button></div></div>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Status</label><select value={chipFilter} onChange={(e) => setChipFilter(e.target.value as ChipKind)} style={{ ...selectStyle, width: '100%' }}>{chips.map(c => (<option key={c.key} value={c.key}>{c.label} ({c.count})</option>))}</select></div>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Team</label><select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ ...selectStyle, width: '100%' }}><option value="">All teams</option>{teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Client</label><ClientCombobox value={clientFilter} onChange={setClientFilter} options={clientOptions} placeholder="All clients" /></div>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Assignee</label><select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ ...selectStyle, width: '100%' }}><option value="">All assignees</option>{assigneeOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Priority</label><select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ ...selectStyle, width: '100%' }}><option value="">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select></div>
                </div>
              )}
            </div>
            {isAdmin && (
              <button onClick={() => setShowAddTask(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'var(--olive)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}>
                <Plus size={14} /> Add Task
              </button>
            )}
          </div>
        </div>


        <SectionCard style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} padding={0}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading tasks…</div>
          ) : (
            <>
              <div
                onScroll={handleTaskScroll}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '16px 20px 20px', background: 'var(--surface)' }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10 }}>
                      <Th onClick={() => toggleSort('title')} active={sortKey === 'title'} dir={sortDir} width="40%">Task</Th>
                      <Th onClick={() => toggleSort('team')} active={sortKey === 'team'} dir={sortDir} width="15%">Team</Th>
                      <Th onClick={() => toggleSort('status')} active={sortKey === 'status'} dir={sortDir} width="15%">Status</Th>
                      <Th onClick={() => toggleSort('dueDate')} active={sortKey === 'dueDate'} dir={sortDir} width="15%">When (due)</Th>
                      <Th align="center" width="15%">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tasks match your filters.</td></tr>
                    ) : scrollableGroups.map((group) => {
                      const client = group.client;
                      const clientTasks = group.tasks;
                      const isExpanded = expandedClients[client.id] ?? false;

                      const statusCounts = {
                        pending: clientTasks.filter(t => t.status === 'pending').length,
                        in_progress: clientTasks.filter(t => t.status === 'in_progress').length,
                        complete: clientTasks.filter(t => t.status === 'complete').length,
                        blocked: clientTasks.filter(t => t.status === 'blocked').length,
                        extension_requested: clientTasks.filter(t => t.status === 'extension_requested').length,
                        rejected: clientTasks.filter(t => t.status === 'rejected').length,
                        cancelled: clientTasks.filter(t => t.status === 'cancelled').length,
                      };

                      const toggleClientExpand = (clientId: string) => {
                        setExpandedClients((prev) => ({
                          ...prev,
                          [clientId]: !(prev[clientId] ?? false),
                        }));
                      };

                      return (
                        <Fragment key={client.id}>
                          <tr
                            onClick={() => toggleClientExpand(client.id)}
                            style={{
                              background: 'var(--surface-2)',
                              borderBottom: '1px solid var(--border)',
                              cursor: 'pointer',
                              userSelect: 'none',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                          >
                            <td colSpan={5} style={{ padding: '10px 18px', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ 
                                  display: 'inline-block',
                                  fontSize: 9, 
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                                  transition: 'transform 0.2s',
                                  color: 'var(--muted)',
                                  flexShrink: 0 
                                }}>▶</span>
                                <span style={{
                                  fontSize: 13.5, fontWeight: 700, color: 'var(--olive-dark)',
                                  background: 'var(--olive-50)', padding: '3px 10px', borderRadius: 6,
                                  border: '1px solid var(--olive-100)', letterSpacing: '0.2px',
                                }}>
                                  {client.brandName || client.fullName || 'No Client'}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                                  {clientTasks.length} {clientTasks.length === 1 ? 'task' : 'tasks'}
                                </span>
                                <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
                                {statusCounts.pending > 0 && (
                                  <span style={statusBadgeStyle('pending')}>{statusCounts.pending} Pending</span>
                                )}
                                {statusCounts.in_progress > 0 && (
                                  <span style={statusBadgeStyle('in_progress')}>{statusCounts.in_progress} In Progress</span>
                                )}
                                {statusCounts.complete > 0 && (
                                  <span style={statusBadgeStyle('complete')}>{statusCounts.complete} Complete</span>
                                )}
                                {statusCounts.blocked > 0 && (
                                  <span style={statusBadgeStyle('blocked')}>{statusCounts.blocked} Blocked</span>
                                )}
                                {statusCounts.extension_requested > 0 && (
                                  <span style={statusBadgeStyle('extension_requested')}>{statusCounts.extension_requested} Extension</span>
                                )}
                                {statusCounts.rejected > 0 && (
                                  <span style={statusBadgeStyle('rejected')}>{statusCounts.rejected} Rejected</span>
                                )}
                                {statusCounts.cancelled > 0 && (
                                  <span style={statusBadgeStyle('cancelled')}>{statusCounts.cancelled} Cancelled</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && clientTasks.map((t, taskIndex) => (
                            <StaffTaskRow
                              key={t.id}
                              task={t}
                              isAdmin={isAdmin}
                              isLeader={isLeader}
                              isNested={true}
                              taskIndex={taskIndex}
                              totalTasks={clientTasks.length}
                              onPinToggle={(id, pin) => pinMut.mutate({ id, pin })}
                              onAlertToggle={(id, alert) => alertMut.mutate({ id, alert })}
                              onComplete={() => setCompleteTaskId(t.id)}
                              onReject={() => setRejectTaskId(t.id)}
                              onReopen={() => reopenMut.mutate(t.id)}
                              reopenPending={reopenMut.isPending && reopenMut.variables === t.id}
                              onOpenVault={() => setVaultTask(t)}
                              onBlock={() => setBlockerTaskId(t.id)}
                              onExtend={() => setExtendTaskId(t.id)}
                              onStartTimer={() => startTimerMut.mutate(t.id)}
                              onStopTimer={() => stopTimerMut.mutate(t.id)}
                              onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                              onUpdateTask={(task) => setEditingTask(task)}
                              onDeleteTask={(id) => { const t = clientTasks.find(t => t.id === id); setDeleteConfirm({ id, title: t?.title || 'this task' }); }}
                              onRaiseHand={() => {
                                setSelectedTaskForProblem(t);
                                setShowRaiseHandModal(true);
                              }}
                            />
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Delete Confirm Modal ────────────────────────────────────── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', overflow: 'hidden' }}>
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={18} color="var(--red, #dc2626)" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Instrument Serif, serif' }}>Delete Task</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>This action cannot be undone</div>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}>Task to be deleted</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{deleteConfirm.title}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '0 24px 24px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                Cancel
              </button>
              <button
                onClick={() => { deleteTaskMut.mutate(deleteConfirm.id); setDeleteConfirm(null); }}
                disabled={deleteTaskMut.isPending}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: deleteTaskMut.isPending ? 0.7 : 1 }}>
                {deleteTaskMut.isPending ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Deleting…</span>
                ) : 'Delete Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Vault Modal ─────────────────────────────────────── */}

      {vaultTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeVaultModal(); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#4285F4,#34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FolderOpen size={17} color="#fff" />
                </div>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>{vaultTask.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    {vaultTask.client?.brandName || vaultTask.client?.fullName} · Step {vaultTask.step?.stepNumber} — {vaultTask.step?.name}
                  </div>
                </div>
              </div>
              <button onClick={closeVaultModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Add link form */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Add Drive link</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input placeholder="https://drive.google.com/…" value={vaultLinkUrl}
                    onChange={(e) => setVaultLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitVaultLink()}
                    style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                </div>
                <div style={{ width: 160 }}>
                  <input placeholder="Title (optional)" value={vaultLinkTitle}
                    onChange={(e) => setVaultLinkTitle(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button onClick={submitVaultLink} disabled={addVaultLink.isPending}
                  style={{ padding: '8px 14px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, height: 37 }}>
                  <Link2 size={12} /> {addVaultLink.isPending ? 'Saving…' : 'Add'}
                </button>
              </div>
              {vaultLinkErr && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={12} /> {vaultLinkErr}
                </div>
              )}
            </div>

            {/* Doc list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }} className="custom-scrollbar">
              {vaultDocsQuery.isLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
              ) : (vaultDocsQuery.data as any[])?.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  <FolderOpen size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div>No documents yet.</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Add a Google Drive link above to attach proof of work.</div>
                </div>
              ) : (vaultDocsQuery.data as {id: string; title: string; driveUrl?: string; notes?: string}[])?.map((doc) => (
                <div key={doc.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 24px', borderBottom: '1px solid var(--surface-2)' }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <span style={{ fontSize: 16 }}>{doc.driveUrl?.includes('spreadsheets') ? '📗' : doc.driveUrl?.includes('document') ? '📘' : '📁'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {doc.title}
                    </div>
                    {doc.notes && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.notes}
                      </div>
                    )}
                  </div>
                  {doc.driveUrl && (
                    <a href={doc.driveUrl} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#e8f0fe', color: '#1a73e8', borderRadius: 6, fontSize: 11.5, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                      <ExternalLink size={10} /> Open
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
              <button onClick={closeVaultModal} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal (admin only) */}
      {rejectTaskId && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setRejectTaskId(null); setRejectionNote(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Reject task</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Tell the assignee what needs to change.</div>
              </div>
              <button onClick={() => { setRejectTaskId(null); setRejectionNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            {/* Modal body */}
            <div style={{ padding: '20px 24px', flex: 1 }}>
              <textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} autoFocus rows={4}
                placeholder="e.g. Wrong client attached — this should be for Priya, not Vikram."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
              <button onClick={() => { setRejectTaskId(null); setRejectionNote(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => rejectMut.mutate({ id: rejectTaskId, note: rejectionNote })}
                disabled={!rejectionNote || rejectMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: '#B0436A', color: '#fff', cursor: !rejectionNote ? 'not-allowed' : 'pointer', opacity: !rejectionNote ? 0.5 : 1 }}>
                {rejectMut.isPending ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Sending…</span>
                ) : 'Send back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocker modal (staff or leader) */}
      {blockerTaskId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setBlockerTaskId(null); setBlockerNote(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Raise Blocker</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Why is this task blocked?</div>
              </div>
              <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            {/* Modal body */}
            <div style={{ padding: '20px 24px', flex: 1 }}>
              <textarea value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} autoFocus rows={4}
                placeholder="e.g. Waiting on client response for branding assets."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
              <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => blockMut.mutate({ id: blockerTaskId, note: blockerNote })}
                disabled={!blockerNote || blockMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: !blockerNote ? 'not-allowed' : 'pointer', opacity: !blockerNote ? 0.5 : 1 }}>
                {blockMut.isPending ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Submitting…</span>
                ) : 'Submit Blocker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal (staff or leader) */}
      {extendTaskId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Request Extension</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Request a new deadline for this task.</div>
              </div>
              <button onClick={() => { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            {/* Modal body */}
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>New Requested Date</label>
                <input type="date" value={extensionDate} onChange={(e) => setExtensionDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Reason for Extension</label>
                <textarea value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} rows={3}
                  placeholder="e.g. Client requested revisions that delayed completion."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px', flexShrink: 0 }}>
              <button onClick={() => { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
                Cancel
              </button>
              <button onClick={() => extendMut.mutate({ id: extendTaskId, date: extensionDate, reason: extensionReason })}
                disabled={!extensionDate || !extensionReason || extendMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: (!extensionDate || !extensionReason) ? 'not-allowed' : 'pointer', opacity: (!extensionDate || !extensionReason) ? 0.5 : 1 }}>
                {extendMut.isPending ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Submitting…</span>
                ) : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddTask && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddTask(false); setAddTaskFieldErrors({}); setAddTaskError(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Create & Assign Task</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Add a new task to a project or client onboarding pipeline.</div>
              </div>
              <button onClick={() => setShowAddTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            {/* Modal body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: addTaskFieldErrors.clientId ? 'var(--red)' : 'var(--ink-2)', marginBottom: 5 }}>Project / Client *</label>
                <select
                  value={addTaskForm.clientId}
                  onChange={(e) => {
                    setAddTaskForm(f => ({ ...f, clientId: e.target.value, stepId: '', teamName: '', assignedToId: '' }));
                    setAddTaskFieldErrors(fe => ({ ...fe, clientId: '' }));
                  }}
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${addTaskFieldErrors.clientId ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: addTaskFieldErrors.clientId ? 'var(--red-bg)' : 'var(--surface)', outline: 'none' }}
                >
                  <option value="">Select project / client...</option>
                  {liveClients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.brandName || c.fullName}</option>
                  ))}
                </select>
                {addTaskFieldErrors.clientId && <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>⚠ {addTaskFieldErrors.clientId}</span>}
              </div>

              {addTaskForm.clientId && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Pipeline Step (optional, defaults to current step)</label>
                  <select value={addTaskForm.stepId} onChange={(e) => {
                    const stepVal = e.target.value;
                    const matchedStep = (addTaskClientSteps as any[]).find(s => s.id === stepVal);
                    setAddTaskForm(f => ({
                      ...f,
                      stepId: stepVal,
                      teamName: matchedStep ? matchedStep.owningTeamName : f.teamName,
                      assignedToId: matchedStep && matchedStep.owningTeamName !== f.teamName ? '' : f.assignedToId
                    }));
                  }} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Use current step...</option>
                    {addTaskClientSteps.map((s: any) => (
                      <option key={s.id} value={s.id}>Step {s.stepNumber} — {s.name} ({s.owningTeamName})</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: addTaskFieldErrors.title ? 'var(--red)' : 'var(--ink-2)', marginBottom: 5 }}>Task Title *</label>
                <input
                  value={addTaskForm.title}
                  onChange={(e) => { setAddTaskForm(f => ({ ...f, title: e.target.value })); setAddTaskFieldErrors(fe => ({ ...fe, title: '' })); }}
                  placeholder="e.g. Write Facebook Ad Copy"
                  style={{ width: '100%', padding: '9px 12px', border: `1px solid ${addTaskFieldErrors.title ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: addTaskFieldErrors.title ? 'var(--red-bg)' : 'var(--surface)', outline: 'none' }}
                />
                {addTaskFieldErrors.title && <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>⚠ {addTaskFieldErrors.title}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: addTaskFieldErrors.teamName ? 'var(--red)' : 'var(--ink-2)', marginBottom: 5 }}>Team *</label>
                  <select
                    value={addTaskForm.teamName}
                    onChange={(e) => {
                      const teamVal = e.target.value;
                      const matchedStep = (addTaskClientSteps as any[]).find(
                        (s: any) => s.owningTeamName.toLowerCase() === teamVal.toLowerCase()
                      );
                      setAddTaskForm(f => ({ ...f, teamName: teamVal, assignedToId: '', stepId: matchedStep ? matchedStep.id : f.stepId }));
                      setAddTaskFieldErrors(fe => ({ ...fe, teamName: '' }));
                    }}
                    style={{ width: '100%', padding: '9px 12px', border: `1px solid ${addTaskFieldErrors.teamName ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: addTaskFieldErrors.teamName ? 'var(--red-bg)' : 'var(--surface)', outline: 'none' }}
                  >
                    <option value="">Select team...</option>
                    {addTaskTeamOptions.map((t: string) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {addTaskFieldErrors.teamName && <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>⚠ {addTaskFieldErrors.teamName}</span>}
                  {addTaskForm.clientId && addTaskForm.teamName && !isClientTeamValid && (
                    <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={13} style={{ flexShrink: 0 }} />
                      <span>Warning: This client does not have a pipeline step owned by {addTaskForm.teamName}.</span>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: addTaskFieldErrors.assignedToId ? 'var(--red)' : 'var(--ink-2)', marginBottom: 5 }}>Assignee *</label>
                  <select
                    value={addTaskForm.assignedToId}
                    onChange={(e) => { setAddTaskForm(f => ({ ...f, assignedToId: e.target.value })); setAddTaskFieldErrors(fe => ({ ...fe, assignedToId: '' })); }}
                    style={{ width: '100%', padding: '9px 12px', border: `1px solid ${addTaskFieldErrors.assignedToId ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: addTaskFieldErrors.assignedToId ? 'var(--red-bg)' : 'var(--surface)', outline: 'none' }}
                  >
                    <option value="">Select assignee...</option>
                    {addTaskAssignees.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                  {addTaskFieldErrors.assignedToId && <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>⚠ {addTaskFieldErrors.assignedToId}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Priority</label>
                  <select value={addTaskForm.priority} onChange={(e) => setAddTaskForm(f => ({ ...f, priority: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Due Date *</label>
                  <input
                    type="date"
                    value={addTaskForm.dueDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => { setAddTaskForm(f => ({ ...f, dueDate: e.target.value })); setAddTaskFieldErrors(fe => ({ ...fe, dueDate: '' })); }}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: `1px solid ${(addTaskFieldErrors.dueDate || (addTaskForm.dueDate && addTaskForm.dueDate < new Date().toISOString().split('T')[0])) ? 'var(--red)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)', fontSize: 13.5,
                      color: 'var(--ink)',
                      background: (addTaskFieldErrors.dueDate || (addTaskForm.dueDate && addTaskForm.dueDate < new Date().toISOString().split('T')[0])) ? 'var(--red-bg)' : 'var(--surface)',
                      outline: 'none',
                    }}
                  />
                  {(addTaskFieldErrors.dueDate || (addTaskForm.dueDate && addTaskForm.dueDate < new Date().toISOString().split('T')[0])) && (
                    <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                      ⚠ {addTaskFieldErrors.dueDate || 'Due date cannot be in the past'}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
                <textarea value={addTaskForm.description} onChange={(e) => setAddTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Briefly outline requirements..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }} />
              </div>

              {addTaskError && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}>{addTaskError}</div>}
            </div>
            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
              <button onClick={() => { setShowAddTask(false); setAddTaskFieldErrors({}); setAddTaskError(''); }} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
              <button onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                // Per-field validation
                const fieldErrs: Record<string, string> = {};
                if (!addTaskForm.clientId) fieldErrs.clientId = 'Please select a client / project';
                if (!addTaskForm.title.trim()) fieldErrs.title = 'Task title is required';
                if (!addTaskForm.teamName) fieldErrs.teamName = 'Please select a team';
                if (!addTaskForm.assignedToId) fieldErrs.assignedToId = 'Please select an assignee';
                if (!addTaskForm.dueDate) fieldErrs.dueDate = 'Due date is required';
                else if (addTaskForm.dueDate < today) fieldErrs.dueDate = 'Due date cannot be in the past';
                if (Object.keys(fieldErrs).length > 0) {
                  setAddTaskFieldErrors(fieldErrs);
                  setAddTaskError('Please fill in all required fields before submitting.');
                  return;
                }
                setAddTaskFieldErrors({});
                setAddTaskError('');
                addTaskMut.mutate();
              }} disabled={addTaskMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: addTaskMut.isPending ? 'not-allowed' : 'pointer', opacity: addTaskMut.isPending ? 0.7 : 1 }}>
                {addTaskMut.isPending ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Adding…</span>
                ) : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
      <CSVImportModal
        open={showCSVModal}
        onClose={() => setShowCSVModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
        }}
        endpoint="/api/tasks/import"
        title="Import Tasks from CSV"
        templateLabel="Tasks"
        templateColumns={['title', 'description', 'client_name', 'assignee_email', 'step_number', 'priority', 'due_date']}
      />

      {completeTaskId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setCompleteTaskId(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Complete Task</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Submit proof of work details to mark this task as complete.</div>
              </div>
              <button onClick={() => setCompleteTaskId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            {/* Modal body */}
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
            {/* Modal footer */}
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
      {editingTask && isAdmin && (
        <UpdateTaskModal
          open={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
          task={editingTask}
          users={liveUsers || []}
        />
      )}
      {showRaiseHandModal && (
        <RaiseHandModal
          open={showRaiseHandModal}
          onClose={() => {
            setShowRaiseHandModal(false);
            setSelectedTaskForProblem(null);
          }}
          clients={USE_MOCK ? MOCK_CLIENTS : liveClients}
          preselectedTask={selectedTaskForProblem}
        />
      )}
    </AppLayout>
  );
}

// ── Staff / admin task row ────────────────────────────────────────────────

function StaffTaskRow({
  task: t, isAdmin, isLeader, isNested, taskIndex, totalTasks, onPinToggle, onAlertToggle, onComplete, onReject, onReopen, reopenPending, onOpenVault, onBlock, onExtend, onStartTimer, onStopTimer, onStatusChange, onUpdateTask, onDeleteTask, onRaiseHand,
}: {
  task: any; isAdmin: boolean; isLeader?: boolean; isNested?: boolean;
  taskIndex?: number; totalTasks?: number;
  onPinToggle?: (id: string, pin: boolean) => void;
  onAlertToggle?: (id: string, alert: boolean) => void;
  onComplete: () => void;
  onReject: () => void;
  onReopen: () => void;
  reopenPending: boolean;
  onOpenVault: () => void;
  onBlock?: () => void;
  onExtend?: () => void;
  onStartTimer?: () => void;
  onStopTimer?: () => void;
  onStatusChange?: (id: string, status: string) => void;
  onUpdateTask?: (task: any) => void;
  onDeleteTask?: (id: string) => void;
  onRaiseHand?: () => void;
}) {
  const done = t.status === 'complete';
  const rej = t.status === 'rejected' || t.status === 'cancelled';
  const overdue = !done && !rej && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate));
  const today = !done && !rej && isToday(new Date(t.dueDate));
  const overdueDays = overdue ? differenceInDays(new Date(), new Date(t.dueDate)) : 0;
  const completedAt = t.completedAt ? format(new Date(t.completedAt), "d MMM, h:mma") : null;
  const whenLabel = done && completedAt
    ? `Done ${completedAt}`
    : overdue
    ? `Due ${format(new Date(t.dueDate), 'd MMM')} (${overdueDays}d late)`
    : `Due ${format(new Date(t.dueDate), 'd MMM')}`;
  const whenColor = done ? 'var(--green)' : rej ? '#B0436A' : overdue ? 'var(--red)' : today ? 'var(--amber)' : 'var(--muted)';

  const hidePin = t.status === 'complete' || t.status === 'blocked' || t.status === 'extension_requested' || t.status === 'rejected' || t.status === 'cancelled';

  const statusColor: Record<string, string> = {
    pending: 'var(--muted)', in_progress: 'var(--olive)', complete: 'var(--green)',
    blocked: '#6B3FA0', extension_requested: 'var(--amber)', rejected: '#B0436A', cancelled: 'var(--muted)',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Pending', in_progress: 'In Progress', complete: 'Complete',
    blocked: 'Blocked', extension_requested: 'Extension', rejected: 'Rejected', cancelled: 'Cancelled',
  };

  return (
    <tr className={`standup-row ${t.isAlerted || t.isPinned ? 'highlighted' : ''}`}
      style={{ borderBottom: taskIndex !== undefined && taskIndex === (totalTasks ?? 1) - 1 ? '2px solid var(--border)' : '1px solid var(--surface-2)' }}>
      <td style={{ padding: '10px 18px 10px 40px', verticalAlign: 'middle', minWidth: 240, width: '35%', position: 'relative' }}>
        {/* Tree connector lines */}
        {isNested && (
          <>
            <div style={{
              position: 'absolute', left: 20, top: 0,
              bottom: taskIndex !== undefined && taskIndex === (totalTasks ?? 1) - 1 ? '50%' : 0,
              width: 1, background: 'var(--border)',
            }} />
            <div style={{
              position: 'absolute', left: 20, top: '50%',
              width: 12, height: 1, background: 'var(--border)',
            }} />
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isAdmin && !hidePin ? (
            <button
              onClick={(e) => { e.stopPropagation(); onPinToggle?.(t.id, !t.isPinned); }}
              style={{
                border: 'none',
                background: 'none',
                padding: 4,
                cursor: 'pointer',
                color: t.isPinned ? 'var(--olive)' : 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--olive)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = t.isPinned ? 'var(--olive)' : 'var(--muted)')}
              title={t.isPinned ? "Unpin task" : "Pin task"}
            >
              <Pin size={15} style={{ fill: t.isPinned ? 'var(--olive)' : 'none', transform: 'rotate(45deg)' }} />
            </button>
          ) : (
            isAdmin && <div style={{ width: 23 }} />
          )}

          {(isAdmin || isLeader) && !hidePin ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAlertToggle?.(t.id, !t.isAlerted); }}
              style={{
                border: 'none',
                background: 'none',
                padding: 4,
                cursor: 'pointer',
                color: t.isAlerted ? 'var(--red)' : 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = t.isAlerted ? 'var(--red)' : 'var(--muted)')}
              title={t.isAlerted ? "Remove alert" : "Alert task"}
            >
              <AlertCircle size={15} style={{ fill: t.isAlerted ? 'var(--red-bg)' : 'none' }} />
            </button>
          ) : (
            (isAdmin || isLeader) && <div style={{ width: 23 }} />
          )}

          {!isAdmin && !isLeader && <div style={{ width: 12 }} />}
          {t.priority === 'high' && <span style={{ width: 4, height: 22, borderRadius: 2, background: 'var(--red)' }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </div>
            </div>
            {t.step && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Step {String(t.step.stepNumber).padStart(2, '0')} · {t.step.name}</div>
            )}
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', width: '15%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)' }} />
          {t.step?.owningTeamName || t.assignedTo?.teamName || '—'}
        </span>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', width: '15%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999,
            fontSize: 11.5, fontWeight: 600,
            background: t.status === 'complete' ? 'var(--green-bg)'
              : t.status === 'blocked' ? '#F0E8FA'
              : t.status === 'rejected' ? '#FBEEF1'
              : t.status === 'extension_requested' ? 'var(--amber-bg)'
              : t.status === 'in_progress' ? 'var(--olive-50)'
              : 'var(--surface-2)',
            color: statusColor[t.status],
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[t.status] }} />
            {statusLabel[t.status] || t.status}
          </span>
          {(t.status === 'in_progress' || t.timeSpentSeconds > 0) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TaskTimer
                isTimerRunning={t.isTimerRunning}
                timerStartedAt={t.timerStartedAt}
                timeSpentSeconds={t.timeSpentSeconds}
              />
              {!isAdmin && t.status === 'in_progress' && (
                t.isTimerRunning ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStopTimer?.(); }}
                    title="Pause timer"
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Pause size={12} style={{ color: 'var(--amber)' }} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStartTimer?.(); }}
                    title="Resume timer"
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Play size={12} style={{ color: 'var(--green)' }} />
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: whenColor, fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap', width: '15%' }}>
        {done && <CircleCheck size={11} style={{ display: 'inline', marginRight: 4 }} />}
        {!done && !rej && (overdue ? <TriangleAlert size={11} style={{ display: 'inline', marginRight: 4 }} /> : today ? <Clock size={11} style={{ display: 'inline', marginRight: 4 }} /> : null)}
        {whenLabel}
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', width: '15%' }}>
        {(() => {
          const dropdownActions = [];

          // Staff status actions
          if (!isAdmin && !done) {
            if (t.status !== 'pending') {
              dropdownActions.push({
                label: 'Mark Pending',
                icon: <Clock size={13} />,
                onClick: () => onStatusChange?.(t.id, 'pending'),
              });
            }
            if (t.status !== 'in_progress') {
              dropdownActions.push({
                label: 'Mark In Progress',
                icon: <Play size={13} />,
                onClick: () => onStartTimer?.(),
              });
            }
            dropdownActions.push({
              label: 'Complete Task',
              icon: <Check size={13} />,
              onClick: onComplete,
            });
            if (t.status !== 'extension_requested' && t.status !== 'blocked') {
              dropdownActions.push({
                label: 'Request Extension',
                icon: <Clock size={13} />,
                onClick: () => onExtend?.(),
              });
            }
            dropdownActions.push({
              label: 'Raise Hand',
              icon: <Hand size={13} />,
              onClick: onRaiseHand,
            });
          }

          // Admin actions
          if (isAdmin && !done && t.status !== 'blocked') {
            dropdownActions.push({
              label: 'Block Task',
              icon: <Ban size={13} />,
              onClick: () => onBlock?.(),
              danger: true,
            });
          }
          if (isAdmin && !done && t.status === 'extension_requested') {
            dropdownActions.push({
              label: 'Reject Extension',
              icon: <XCircle size={13} />,
              onClick: onReject,
              danger: true,
            });
          }
          if (isAdmin && t.status === 'blocked') {
            dropdownActions.push({
              label: 'Reopen Task',
              icon: <RotateCcw size={13} />,
              onClick: onReopen,
            });
          }

          // General actions
          dropdownActions.push({
            label: 'Open Client',
            icon: <Eye size={13} />,
            onClick: () => window.location.assign(`/clients/${t.client?.id}`),
          });
          if (isAdmin) {
            dropdownActions.push({
              label: 'Update',
              icon: <Edit2 size={13} />,
              onClick: () => onUpdateTask?.(t),
            });
            dropdownActions.push({
              label: 'Delete',
              icon: <Trash2 size={13} />,
              onClick: () => { onDeleteTask?.(t.id); },
              danger: true,
            });
          }

          // Vault / Documents
          dropdownActions.push({
            label: 'View Documents',
            icon: <FolderOpen size={13} />,
            onClick: onOpenVault,
          });

          return (
            <ActionDropdown align="right" actions={dropdownActions} />
          );
        })()}
      </td>
    </tr>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

function Th({ children, onClick, active, dir, align = 'left', width }: { children: React.ReactNode; onClick?: () => void; active?: boolean; dir?: 'asc' | 'desc'; align?: 'left' | 'center' | 'right'; width?: string }) {
  return (
    <th onClick={onClick}
      style={{
        position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)',
        textAlign: align, fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase',
        color: active ? 'var(--olive)' : 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
        width: width,
      }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: align === 'center' ? 'center' : 'flex-start', width: align === 'center' ? '100%' : 'auto' }}>
        {children}
        {active && <ArrowUpDown size={10} style={{ transform: dir === 'desc' ? 'rotate(180deg)' : 'none' }} />}
      </span>
    </th>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; (e.currentTarget as HTMLElement).style.color = 'var(--olive)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}>
      {children}
    </button>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', minWidth: 130,
};
const pageBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 5,
  fontSize: 12, fontWeight: 500, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer',
};

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'var(--pending-bg)', color: 'var(--pending)' },
    in_progress: { bg: 'var(--olive-50)', color: 'var(--olive)' },
    complete: { bg: 'var(--green-bg)', color: 'var(--green)' },
    blocked: { bg: 'var(--blocked-bg)', color: 'var(--blocked)' },
    extension_requested: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
    rejected: { bg: 'var(--rejected-bg)', color: 'var(--rejected)' },
    cancelled: { bg: 'var(--surface-2)', color: 'var(--muted)' },
  };
  const c = colors[status] || colors.pending;
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.color}20`,
    display: 'inline-flex',
    alignItems: 'center',
  };
};