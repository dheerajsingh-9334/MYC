'use client';
import { useState, useEffect, useMemo } from 'react';
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
import { USE_MOCK, MOCK_TASKS } from '@/lib/mockData';
import {
  Search, XCircle, RotateCcw, ChevronLeft, ChevronRight, ChevronDown,
  ArrowUpDown, CircleCheck, Clock, TriangleAlert, Eye,
  Check, X, FolderOpen, Link2, Upload, FileText, Plus, ExternalLink, AlertCircle,
  Play, Pause, Pin, Ban,
} from 'lucide-react';

const AUTO_REFRESH_MS = 30_000;
const PAGE_SIZE = 15;

// Chip filter kinds — virtual filters that don't map 1:1 to a status enum
type ChipKind = '' | 'overdue' | 'today' | 'rejected' | 'complete' | 'extension_requested' | 'in_progress';

export default function TasksPage() {
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  const [showCSVModal, setShowCSVModal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [chipFilter, setChipFilter] = useState<ChipKind>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

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

  useEffect(() => {
    if (!USE_MOCK) setUser(getUser());
  }, []);

  const isAdmin = user?.role === 'admin';

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
    enabled: !USE_MOCK && showAddTask && isAdmin,
    retry: false,
  });

  const { data: liveUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK && showAddTask && isAdmin,
    retry: false,
  });

  const { data: addTaskClientSteps = [] } = useQuery({
    queryKey: ['steps', addTaskForm.clientId],
    queryFn: () => apiFetch(`/api/steps?clientId=${addTaskForm.clientId}`),
    enabled: !USE_MOCK && !!addTaskForm.clientId && showAddTask && isAdmin,
    retry: false,
  });

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
    },
    onError: (e: any) => setAddTaskError(e.message || 'Failed to create task'),
  });

  const addTaskTeamOptions = useMemo(() => {
    const set = new Set<string>();
    (liveUsers as any[]).forEach((u) => { if (u.teamName && u.isActive !== false) set.add(u.teamName); });
    return Array.from(set).sort();
  }, [liveUsers]);

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
  }, [tasks, search, chipFilter, teamFilter, clientFilter, priorityFilter, assigneeFilter, sortKey, sortDir]);

  const scrollableTasks = useMemo(() => {
    return filtered.slice(0, taskLimit);
  }, [filtered, taskLimit]);

  useEffect(() => { setTaskLimit(15); }, [search, chipFilter, teamFilter, clientFilter, priorityFilter, assigneeFilter, sortKey, sortDir]);

  const handleTaskScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setTaskLimit(prev => Math.min(prev + 10, filtered.length));
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

  // Status counts — derived from the full task list, ignoring current filters
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

  return (
    <AppLayout>
      <Topbar
        title={isAdmin ? 'All Tasks' : 'My Tasks'}
        subtitle={isAdmin ? `Org-wide · ${counts.total} tasks` : `${user?.fullName || 'Team Member'} · ${user?.teamName || ''}`}
        search={search}
        setSearch={setSearch}
      />
      <div style={{ padding: 'var(--page-pad)', flex: 1 }}>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Custom Status Dropdown Menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              style={{
                ...selectStyle,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                minWidth: 155,
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {chips.find(c => c.key === chipFilter)?.color && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: chips.find(c => c.key === chipFilter)?.color, display: 'inline-block'
                  }} />
                )}
                {chips.find(c => c.key === chipFilter)?.label || 'All'}
              </span>
              <ChevronDown size={13} style={{ opacity: 0.7 }} />
            </button>
            
            {isStatusDropdownOpen && (
              <>
                <div
                  onClick={() => setIsStatusDropdownOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 998,
                  }}
                />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  width: 220,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 999,
                  padding: '4px 0',
                }}>
                  {chips.map((c) => {
                    const isSelected = c.key === chipFilter;
                    return (
                      <button
                        key={c.label}
                        onClick={() => {
                          setChipFilter(c.key);
                          setIsStatusDropdownOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: isSelected ? 'var(--olive-50)' : 'transparent',
                          color: isSelected ? 'var(--olive-dark)' : 'var(--ink)',
                          border: 'none',
                          fontSize: 12.5,
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {c.color ? (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: c.color, display: 'inline-block'
                            }} />
                          ) : (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: 'var(--muted)', display: 'inline-block'
                            }} />
                          )}
                          {c.label}
                        </span>
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: isSelected ? 'var(--olive)' : 'var(--muted)',
                          background: isSelected ? 'rgba(0,0,0,0.04)' : 'var(--surface-2)',
                          padding: '1px 6px',
                          borderRadius: 999,
                        }}>
                          {c.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {isAdmin && (
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={selectStyle}>
              <option value="">All teams</option>
              {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <ClientCombobox
            value={clientFilter}
            onChange={setClientFilter}
            options={clientOptions}
            placeholder="All clients"
          />
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={selectStyle}>
            <option value="">All assignees</option>
            {assigneeOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
            <option value="">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* <button
                onClick={() => setShowCSVModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
              >
                Upload CSV
              </button> */}
              <button
                onClick={() => setShowAddTask(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--olive)', color: '#fff', border: 'none',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          )}
        </div>

        <SectionCard padding={0}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading tasks…</div>
          ) : (
            <>
              <div
                onScroll={handleTaskScroll}
                style={{
                  maxHeight: 'calc(100vh - 200px)',
                  minHeight: 500,
                  overflowY: 'auto',
                  overflowX: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  margin: '16px 20px 20px',
                  background: 'var(--surface-2)',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10 }}>
                      <Th onClick={() => toggleSort('title')} active={sortKey === 'title'} dir={sortDir}>Task</Th>
                      <Th onClick={() => toggleSort('client')} active={sortKey === 'client'} dir={sortDir}>Client</Th>
                      <Th onClick={() => toggleSort('team')} active={sortKey === 'team'} dir={sortDir}>Team</Th>
                      <Th onClick={() => toggleSort('status')} active={sortKey === 'status'} dir={sortDir}>Status</Th>
                      <Th onClick={() => toggleSort('dueDate')} active={sortKey === 'dueDate'} dir={sortDir}>When (due)</Th>
                      <Th>Actions</Th>
                      <Th>Vault</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrollableTasks.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tasks match your filters.</td></tr>
                    ) : scrollableTasks.map((t) => (
                      <StaffTaskRow
                        key={t.id}
                        task={t}
                        isAdmin={isAdmin}
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
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Task Vault Modal ─────────────────────────────────────── */}
      {vaultTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeVaultModal(); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#4285F4,#34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderOpen size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {vaultTask.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
                  {vaultTask.client?.brandName || vaultTask.client?.fullName} · Step {vaultTask.step?.stepNumber} — {vaultTask.step?.name}
                </div>
              </div>
              <button onClick={closeVaultModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Add link form */}
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Add Drive link</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input placeholder="https://drive.google.com/…" value={vaultLinkUrl}
                    onChange={(e) => setVaultLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitVaultLink()}
                    style={{ padding: '7px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                </div>
                <div style={{ width: 160 }}>
                  <input placeholder="Title (optional)" value={vaultLinkTitle}
                    onChange={(e) => setVaultLinkTitle(e.target.value)}
                    style={{ padding: '7px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <button onClick={submitVaultLink} disabled={addVaultLink.isPending}
                  style={{ padding: '7px 14px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 22px', borderBottom: '1px solid var(--surface-2)' }}
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
            <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={closeVaultModal} style={{ padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal (admin only) */}
      {rejectTaskId && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setRejectTaskId(null); setRejectionNote(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--ink)' }}>Reject task</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Tell the assignee what needs to change.</div>
              </div>
              <button onClick={() => { setRejectTaskId(null); setRejectionNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)' }}><X size={18} /></button>
            </div>
            <textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} autoFocus rows={4}
              placeholder="e.g. Wrong client attached — this should be for Priya, not Vikram."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setRejectTaskId(null); setRejectionNote(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => rejectMut.mutate({ id: rejectTaskId, note: rejectionNote })}
                disabled={!rejectionNote || rejectMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: '#B0436A', color: '#fff', cursor: !rejectionNote ? 'not-allowed' : 'pointer', opacity: !rejectionNote ? 0.5 : 1 }}>
                {rejectMut.isPending ? 'Sending…' : 'Send back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocker modal (staff or leader) */}
      {blockerTaskId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setBlockerTaskId(null); setBlockerNote(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--ink)' }}>Raise Blocker</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Why is this task blocked?</div>
              </div>
              <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)' }}><X size={18} /></button>
            </div>
            <textarea value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} autoFocus rows={4}
              placeholder="e.g. Waiting on client response for branding assets."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setBlockerTaskId(null); setBlockerNote(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => blockMut.mutate({ id: blockerTaskId, note: blockerNote })}
                disabled={!blockerNote || blockMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: !blockerNote ? 'not-allowed' : 'pointer', opacity: !blockerNote ? 0.5 : 1 }}>
                {blockMut.isPending ? 'Submitting…' : 'Submit Blocker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal (staff or leader) */}
      {extendTaskId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, padding: '24px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--ink)' }}>Request Extension</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Request a new deadline for this task.</div>
              </div>
              <button onClick={() => { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)' }}><X size={18} /></button>
            </div>
            
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>New Requested Date</label>
              <input type="date" value={extensionDate} onChange={(e) => setExtensionDate(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Reason for Extension</label>
              <textarea value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} rows={3}
                placeholder="e.g. Client requested revisions that delayed completion."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setExtendTaskId(null); setExtensionDate(''); setExtensionReason(''); }}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => extendMut.mutate({ id: extendTaskId, date: extensionDate, reason: extensionReason })}
                disabled={!extensionDate || !extensionReason || extendMut.isPending}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: (!extensionDate || !extensionReason) ? 'not-allowed' : 'pointer', opacity: (!extensionDate || !extensionReason) ? 0.5 : 1 }}>
                {extendMut.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddTask && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddTask(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Create & Assign Task</div>
              <button onClick={() => setShowAddTask(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Project / Client *</label>
                <select value={addTaskForm.clientId} onChange={(e) => setAddTaskForm(f => ({ ...f, clientId: e.target.value, stepId: '' }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                  <option value="">Select project / client...</option>
                  {liveClients.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.brandName || c.fullName}</option>
                  ))}
                </select>
              </div>

              {addTaskForm.clientId && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Pipeline Step (optional, defaults to current step)</label>
                  <select value={addTaskForm.stepId} onChange={(e) => setAddTaskForm(f => ({ ...f, stepId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Use current step...</option>
                    {addTaskClientSteps.map((s: any) => (
                      <option key={s.id} value={s.id}>Step {s.stepNumber} — {s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Task Title *</label>
                <input value={addTaskForm.title} onChange={(e) => setAddTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Write Facebook Ad Copy" style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Team *</label>
                  <select value={addTaskForm.teamName} onChange={(e) => setAddTaskForm(f => ({ ...f, teamName: e.target.value, assignedToId: '' }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Select team...</option>
                    {addTaskTeamOptions.map((t: string) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Assignee *</label>
                  <select value={addTaskForm.assignedToId} onChange={(e) => setAddTaskForm(f => ({ ...f, assignedToId: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Select assignee...</option>
                    {addTaskAssignees.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
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
                  <input type="date" value={addTaskForm.dueDate} onChange={(e) => setAddTaskForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
                <textarea value={addTaskForm.description} onChange={(e) => setAddTaskForm(f => ({ ...f, description: e.target.value }))} placeholder="Briefly outline requirements..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }} />
              </div>

              {addTaskError && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}>{addTaskError}</div>}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
              <button onClick={() => setShowAddTask(false)} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
              <button onClick={() => { setAddTaskError(''); addTaskMut.mutate(); }} disabled={addTaskMut.isPending || !addTaskForm.clientId || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: 'pointer', opacity: (addTaskMut.isPending || !addTaskForm.clientId || !addTaskForm.title.trim() || !addTaskForm.dueDate || !addTaskForm.assignedToId) ? 0.6 : 1 }}>
                {addTaskMut.isPending ? 'Adding…' : 'Add Task'}
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
    </AppLayout>
  );
}

// ── Staff / admin task row ────────────────────────────────────────────────

function StaffTaskRow({
  task: t, isAdmin, onComplete, onReject, onReopen, reopenPending, onOpenVault, onBlock, onExtend, onStartTimer, onStopTimer, onStatusChange,
}: {
  task: any; isAdmin: boolean;
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
}) {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
      setPinned(current.includes(t.id));
    } catch (e) {}
  }, [t.id]);

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
      let updated;
      if (current.includes(t.id)) {
        updated = current.filter((x: string) => x !== t.id);
        setPinned(false);
      } else {
        updated = [...current, t.id];
        setPinned(true);
      }
      localStorage.setItem('pinned_tasks', JSON.stringify(updated));
      window.dispatchEvent(new Event('pinned-updated'));
    } catch (err) {}
  };

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

  const statusColor: Record<string, string> = {
    pending: 'var(--muted)', in_progress: 'var(--olive)', complete: 'var(--green)',
    blocked: '#6B3FA0', extension_requested: 'var(--amber)', rejected: '#B0436A', cancelled: 'var(--muted)',
  };
  const statusLabel: Record<string, string> = {
    pending: 'Pending', in_progress: 'In Progress', complete: 'Complete',
    blocked: 'Blocked', extension_requested: 'Extension', rejected: 'Rejected', cancelled: 'Cancelled',
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--surface-2)', background: rej ? '#FBEEF105' : 'transparent' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rej ? '#FBEEF105' : 'transparent'; }}>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', minWidth: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={togglePin}
            style={{
              border: 'none',
              background: 'none',
              padding: 4,
              cursor: 'pointer',
              color: pinned ? 'var(--olive)' : 'var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            title={pinned ? "Unpin task" : "Pin task"}
          >
            <Pin size={13} style={{ fill: pinned ? 'var(--olive)' : 'none', transform: 'rotate(45deg)' }} />
          </button>
          {t.priority === 'high' && <span style={{ width: 4, height: 22, borderRadius: 2, background: 'var(--red)' }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title}
            </div>
            {t.step && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Step {String(t.step.stepNumber).padStart(2, '0')} · {t.step.name}</div>
            )}
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)' }}>
        {t.client?.brandName || t.client?.fullName || '—'}
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)' }} />
          {t.step?.owningTeamName || t.assignedTo?.teamName || '—'}
        </span>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
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
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: whenColor, fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap' }}>
        {done && <CircleCheck size={11} style={{ display: 'inline', marginRight: 4 }} />}
        {!done && !rej && (overdue ? <TriangleAlert size={11} style={{ display: 'inline', marginRight: 4 }} /> : today ? <Clock size={11} style={{ display: 'inline', marginRight: 4 }} /> : null)}
        {whenLabel}
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {!isAdmin && !done && (
            <select
              value={t.status}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'in_progress') {
                  onStartTimer?.();
                } else if (val === 'pending') {
                  onStatusChange?.(t.id, 'pending');
                } else if (val === 'complete') {
                  onComplete();
                } else if (val === 'blocked') {
                  onBlock?.();
                } else if (val === 'extension_requested') {
                  onExtend?.();
                }
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink-2)',
                fontSize: 12,
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete...</option>
              <option value="extension_requested">Request Extension...</option>
            </select>
          )}
          {isAdmin && !done && t.status !== 'blocked' && (
            <IconBtn title="Block Task" onClick={() => onBlock?.()}><Ban size={11} /></IconBtn>
          )}
          {isAdmin && !done && t.status === 'extension_requested' && (
            <IconBtn title="Reject" onClick={onReject}><XCircle size={11} /></IconBtn>
          )}
          {isAdmin && t.status === 'blocked' && (
            <IconBtn title="Reopen" onClick={onReopen}><RotateCcw size={11} /></IconBtn>
          )}
          <IconBtn title="Open client" onClick={() => window.location.assign(`/clients/${t.client?.id}`)}><Eye size={11} /></IconBtn>
        </div>
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
        <IconBtn title="Documents" onClick={onOpenVault}>
          <FolderOpen size={11} />
        </IconBtn>
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

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick?: () => void; active?: boolean; dir?: 'asc' | 'desc' }) {
  return (
    <th onClick={onClick}
      style={{
        textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase',
        color: active ? 'var(--olive)' : 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap',
      }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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