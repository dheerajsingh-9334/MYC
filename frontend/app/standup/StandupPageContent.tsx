'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import {
  Sparkles,
  TriangleAlert,
  Ban,
  Clock,
  ArrowRight,
  Search,
  CheckCircle,
  Users,
  GitBranch,
  AlertCircle,
  Pin,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Edit2,
  Filter,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { USE_MOCK } from '@/lib/mockData';
import ActionDropdown from '@/components/ui/ActionDropdown';
import { ClientCombobox } from '@/components/ui/ClientCombobox';
import UpdateTaskModal from '@/components/pipeline/UpdateTaskModal';

const TEAMS = ['Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 'Account Manager', 'Content Team'];
const AUTO_REFRESH_MS = 30_000;

const TYPE_STYLES: Record<string, { color: string; bg: string; Icon: any; label: string; tag: (i: any) => string }> = {
  overdue: {
    color: 'var(--red)', bg: 'var(--red-bg)', Icon: TriangleAlert, label: 'OVERDUE',
    tag: (i) => `${i.daysLate} day${i.daysLate !== 1 ? 's' : ''} late`,
  },
  blocked: {
    color: 'var(--blocked)', bg: 'var(--blocked-bg)', Icon: Ban, label: 'BLOCKER',
    tag: () => 'Blocked',
  },
  due_today: {
    color: 'var(--amber)', bg: 'var(--amber-bg)', Icon: Clock, label: 'DUE TODAY',
    tag: () => 'Today',
  },
  highlighted: {
    color: 'var(--olive)', bg: 'var(--olive-50)', Icon: Pin, label: 'HIGHLIGHTED',
    tag: () => 'Highlighted',
  },
};

export default function StandupPageContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const [localHighlighted, setLocalHighlighted] = useState<Record<string, boolean>>({});
  const [localClientPinned, setLocalClientPinned] = useState<Record<string, boolean>>({});
  const [ignoredItems, setIgnoredItems] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});


  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && user && user.role && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [mounted, user, router]);

  // Load persistence from localStorage and user role
  useEffect(() => {
    const savedIgnored = localStorage.getItem('standup_ignored');
    if (savedIgnored) {
      setIgnoredItems(new Set(JSON.parse(savedIgnored)));
    }

    const currUser = getUser();
    if (currUser) {
      setUser(currUser);
      if (currUser.role === 'team_leader' && currUser.teamName) {
        setTeamFilter(currUser.teamName);
      }
    }

    if (!USE_MOCK) {
      apiFetch('/api/auth/me').then(freshUser => {
        localStorage.setItem('user', JSON.stringify(freshUser));
        setUser(freshUser);
        if (freshUser.role === 'team_leader' && freshUser.teamName) {
          setTeamFilter(freshUser.teamName);
        }
      }).catch(err => console.error('Failed to refresh user in standup page:', err));
    }
  }, []);

  if (mounted && user?.role && user.role !== 'admin') {
    return (
      <AppLayout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Redirecting...</div>
      </AppLayout>
    );
  }

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['standup'],
    queryFn: () => apiFetch('/api/standup'),
    refetchInterval: AUTO_REFRESH_MS,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: liveUsers = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    staleTime: 300_000,
    enabled: !USE_MOCK,
  });

  const highlightMut = useMutation({
    mutationFn: (taskId: string) => apiFetch('/api/standup/highlight', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      window.dispatchEvent(new Event('pinned-updated'));
    }
  });

  const items = useMemo(() => {
    return (liveData?.items || []).map((it: any) => {
      const isOverdue = it.alertType === 'overdue';
      const isBlocked = it.alertType === 'blocked';
      const daysLate = it.daysLate || 0;
      const assignee = it.task?.assignedTo?.fullName;
      const assigneeTeam = it.task?.assignedTo?.teamName || it.step?.owningTeamName;
      const clientName = it.client?.brandName || it.client?.fullName || '—';
      const stepLabel = it.step ? `Step ${String(it.step.stepNumber).padStart(2, '0')} — ${it.step.name}` : '';
      const title = it.task?.title || '—';
      let detailText = '';
      let detail: React.ReactNode = null;
      if (isBlocked && it.task?.blockerNote) {
        detailText = `Blocker raised by ${assignee || 'team member'}: "${it.task.blockerNote}"`;
        detail = (
          <>
            Blocker raised by <strong>{assignee || 'team member'}</strong>: <em>"{it.task.blockerNote}"</em>
          </>
        );
      } else if (assignee) {
        detailText = `Assigned to ${assignee}${assigneeTeam ? ` (${assigneeTeam})` : ''}.${it.task?.dueDate ? ` Due ${format(new Date(it.task.dueDate), 'd MMM')}.` : ''}`;
        detail = (
          <>
            Assigned to <strong>{assignee}{assigneeTeam ? ` (${assigneeTeam})` : ''}</strong>.{it.task?.dueDate ? ` Due ${format(new Date(it.task.dueDate), 'd MMM')}.` : ''}
          </>
        );
      } else {
        detailText = 'Unassigned';
        detail = 'Unassigned';
      }
      return {
        id: it.task?.id || `${it.client?.id}-${it.task?.id || ''}`,
        clientId: it.client?.id,
        alertType: it.alertType,
        clientName, stepLabel, title, detail, detailText, daysLate,
        assignee: assignee || 'Unassigned',
        assigneeTeam,
        dueDate: it.task?.dueDate,
        createdAt: it.task?.createdAt,
        isAlerted: it.task?.isAlerted,
        isPinned: it.task?.isPinned,
        clientPinned: it.client?.isPinned,
      };
    });
  }, [liveData]);

  const baseFilteredItems = useMemo(() => {
    return items.filter((item: any) => {
      const searchMatch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.clientName.toLowerCase().includes(search.toLowerCase()) ||
        (item.stepLabel && item.stepLabel.toLowerCase().includes(search.toLowerCase())) ||
        item.detailText.toLowerCase().includes(search.toLowerCase());

      const teamMatch = !teamFilter || item.assigneeTeam === teamFilter;
      const clientMatch = !clientFilter || item.clientName === clientFilter;
      const notIgnored = !ignoredItems.has(item.id);

      return searchMatch && teamMatch && clientMatch && notIgnored;
    });
  }, [items, search, teamFilter, clientFilter, ignoredItems]);

  const filteredItems = useMemo(() => {
    return baseFilteredItems.filter((item: any) => {
      return !alertTypeFilter || item.alertType === alertTypeFilter;
    });
  }, [baseFilteredItems, alertTypeFilter]);

  const isPerClient = user?.role === 'admin';

  // Group standup items (by client for admin, by assignee for team leader/others)
  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredItems.forEach((item: any) => {
      const key = isPerClient ? item.clientName : item.assignee;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems, isPerClient]);

  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it: any) => {
      if (it.clientName && it.clientName !== '—') set.add(it.clientName);
    });
    return Array.from(set).sort();
  }, [items]);

  const clientOptions = useMemo(() => {
    return uniqueClients.map(c => ({ id: c, label: c }));
  }, [uniqueClients]);

  const handleHighlight = async (id: string) => {
    const currentItem = items.find((it: any) => it.id === id);
    const currentStatus = localHighlighted[id] !== undefined
      ? localHighlighted[id]
      : (currentItem?.isAlerted || currentItem?.isPinned || false);

    const nextStatus = !currentStatus;
    setLocalHighlighted(prev => ({
      ...prev,
      [id]: nextStatus
    }));

    try {
      const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
      let updated;
      if (nextStatus) {
        updated = Array.from(new Set([...current, id]));
      } else {
        updated = current.filter((x: string) => x !== id);
      }
      localStorage.setItem('pinned_tasks', JSON.stringify(updated));
      window.dispatchEvent(new Event('pinned-updated'));

      await highlightMut.mutateAsync(id);
    } catch (err) {
      // Revert if error
      setLocalHighlighted(prev => ({
        ...prev,
        [id]: currentStatus
      }));
      try {
        const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
        let updated;
        if (currentStatus) {
          updated = Array.from(new Set([...current, id]));
        } else {
          updated = current.filter((x: string) => x !== id);
        }
        localStorage.setItem('pinned_tasks', JSON.stringify(updated));
        window.dispatchEvent(new Event('pinned-updated'));
      } catch (e) { }
    }
  };

  const handlePinClient = async (clientId: string, currentPinStatus: boolean) => {
    const nextStatus = !currentPinStatus;
    setLocalClientPinned(prev => ({
      ...prev,
      [clientId]: nextStatus
    }));
    try {
      const current = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      let updated;
      if (nextStatus) {
        updated = Array.from(new Set([...current, clientId]));
      } else {
        updated = current.filter((x: string) => x !== clientId);
      }
      localStorage.setItem('pinned_clients', JSON.stringify(updated));
      window.dispatchEvent(new Event('pinned-updated'));

      await apiFetch(`/api/clients/${clientId}/${nextStatus ? 'pin' : 'unpin'}`, {
        method: 'PATCH'
      });
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (err) {
      setLocalClientPinned(prev => ({
        ...prev,
        [clientId]: currentPinStatus
      }));
      try {
        const current = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
        let updated;
        if (currentPinStatus) {
          updated = Array.from(new Set([...current, clientId]));
        } else {
          updated = current.filter((x: string) => x !== clientId);
        }
        localStorage.setItem('pinned_clients', JSON.stringify(updated));
        window.dispatchEvent(new Event('pinned-updated'));
      } catch (e) { }
    }
  };

  const handleIgnore = (id: string) => {
    const next = new Set(ignoredItems);
    next.add(id);
    setIgnoredItems(next);
    localStorage.setItem('standup_ignored', JSON.stringify(Array.from(next)));
  };

  // Stats for summary bar — derived from base filtered items, ignoring alertTypeFilter
  const stats = useMemo(() => {
    const total = baseFilteredItems.length;
    const overdue = baseFilteredItems.filter((i: any) => i.alertType === 'overdue').length;
    const blocked = baseFilteredItems.filter((i: any) => i.alertType === 'blocked').length;
    const dueToday = baseFilteredItems.filter((i: any) => i.alertType === 'due_today').length;
    return { total, overdue, blocked, dueToday };
  }, [baseFilteredItems]);

  const isLoading = liveLoading && items.length === 0;

  const allExpanded = useMemo(() => {
    const keys = Object.keys(groupedItems);
    return keys.length > 0 && keys.every(k => (expandedGroups[k] ?? false) === true);
  }, [groupedItems, expandedGroups]);

  const toggleAllGroups = () => {
    if (allExpanded) {
      const next: Record<string, boolean> = {};
      Object.keys(groupedItems).forEach(k => {
        next[k] = false;
      });
      setExpandedGroups(next);
    } else {
      const next: Record<string, boolean> = {};
      Object.keys(groupedItems).forEach(k => {
        next[k] = true;
      });
      setExpandedGroups(next);
    }
  };

  return (
    <AppLayout>
      <Topbar title="Standup Brief"
      />
      <div className="dashboard-mobile-scroll" style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, boxSizing: 'border-box' }}>

        {/* Overhead Summary Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>

          <div
            onClick={() => setAlertTypeFilter('')}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = alertTypeFilter === '' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === '' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--olive)', 'var(--olive-50)', alertTypeFilter === ''), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={statCardHeaderStyle}>
                <span style={{ fontWeight: 800, color: 'var(--muted)' }}>Total Alerts</span>
                <div style={{ ...iconContainerStyle, background: 'var(--olive-50)' }}>
                  <Users size={14} style={{ color: 'var(--olive)' }} />
                </div>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={statCardValueStyle}>{stats.total}</span>
                <span style={statCardSubtitleStyle}>Active alerts</span>
              </div>
            </div>
          </div>

          <div
            onClick={() => setAlertTypeFilter('overdue')}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = alertTypeFilter === 'overdue' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'overdue' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--orange)', 'var(--orange-bg)', alertTypeFilter === 'overdue'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={statCardHeaderStyle}>
                <span style={{ fontWeight: 800, color: 'var(--muted)' }}>Overdue Tasks</span>
                <div style={{ ...iconContainerStyle, background: 'var(--orange-bg)' }}>
                  <TriangleAlert size={14} style={{ color: 'var(--orange)' }} />
                </div>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={statCardValueStyle}>{stats.overdue}</span>
                <span style={statCardSubtitleStyle}>Past due date</span>
              </div>
            </div>
          </div>

          <div
            onClick={() => setAlertTypeFilter('blocked')}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = alertTypeFilter === 'blocked' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'blocked' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--blocked)', 'var(--blocked-bg)', alertTypeFilter === 'blocked'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={statCardHeaderStyle}>
                <span style={{ fontWeight: 800, color: 'var(--muted)' }}>Blocked Tasks</span>
                <div style={{ ...iconContainerStyle, background: 'var(--blocked-bg)' }}>
                  <Ban size={14} style={{ color: 'var(--blocked)' }} />
                </div>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={statCardValueStyle}>{stats.blocked}</span>
                <span style={statCardSubtitleStyle}>Awaiting resolution</span>
              </div>
            </div>
          </div>

          <div
            onClick={() => setAlertTypeFilter('due_today')}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = alertTypeFilter === 'due_today' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'due_today' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--amber)', 'var(--amber-bg)', alertTypeFilter === 'due_today'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={statCardHeaderStyle}>
                <span style={{ fontWeight: 800, color: 'var(--muted)' }}>Due Today</span>
                <div style={{ ...iconContainerStyle, background: 'var(--amber-bg)' }}>
                  <Clock size={14} style={{ color: 'var(--amber)' }} />
                </div>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={statCardValueStyle}>{stats.dueToday}</span>
                <span style={statCardSubtitleStyle}>Due within 24h</span>
              </div>
            </div>
          </div>

        </div>

        {/* Grouped Alert Table */}
        {isLoading ? (
          <TableSkeleton columnsCount={5} rowsCount={10} hasBulkActions={false} />
        ) : filteredItems.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: 'var(--olive)', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>No items match standup criteria!</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>All clear or try adjusting your filters.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
            {/* Toolbar — active filter pills on left, controls on right */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              padding: '8px 14px', boxSizing: 'border-box', overflowX: 'auto',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'nowrap'
            }} className="custom-scrollbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'nowrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '0 0 50%', minWidth: 200 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                  <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px 6px 28px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ flex: 1, minWidth: 110 }}>
                  <ClientCombobox
                    value={alertTypeFilter}
                    onChange={setAlertTypeFilter}
                    placeholder="Alert Type"
                    options={[
                      { id: 'overdue', label: 'Overdue' },
                      { id: 'blocked', label: 'Blocked' },
                      { id: 'due_today', label: 'Due Today' },
                    ]}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  {user?.role !== 'team_leader' ? (
                    <ClientCombobox
                      value={teamFilter}
                      onChange={setTeamFilter}
                      placeholder="Team"
                      options={TEAMS.map(team => ({ id: team, label: team }))}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '7px 10px', borderRadius: 'var(--radius-sm)' }}>{user.teamName}</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <ClientCombobox value={clientFilter} onChange={setClientFilter} options={clientOptions} placeholder="Client" />
                </div>

                {(alertTypeFilter || teamFilter || clientFilter || search) && (
                  <button onClick={() => { setAlertTypeFilter(''); setTeamFilter(''); setClientFilter(''); setSearch(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Clear all</button>
                )}
              </div>

              {/* Right: Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  title={allExpanded ? 'Collapse all' : 'Expand all'}
                  onClick={toggleAllGroups}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.color = 'var(--olive)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)'; }}
                >
                  {allExpanded ? <ChevronsUp size={13} /> : <ChevronsDown size={13} />}
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              </div>
            </div>

            <SectionCard style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} padding={0}>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '16px 20px 20px', background: 'var(--surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '35%' }}>TASK & DETAILS</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '20%' }}>
                        {isPerClient ? 'ASSIGNEE' : 'CLIENT NAME'}
                      </th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '25%' }}>CURRENT STEP & TIMING</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '10%' }}>ALERT TYPE</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center', width: '10%' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  {Object.entries(groupedItems).map(([groupKey, groupItems]) => {
                    const firstItem = groupItems[0];
                    const clientId = firstItem?.clientId;
                    const clientPinned = firstItem?.clientPinned;
                    const isOpen = expandedGroups[groupKey] ?? false;
                    return (
                      <tbody key={groupKey}>
                        {/* Folder-style Group Header — matches /team page style */}
                        <tr
                          onClick={() => setExpandedGroups(prev => ({ ...prev, [groupKey]: !(prev[groupKey] ?? false) }))}
                          style={{
                            background: 'var(--surface-2)',
                            cursor: 'pointer', userSelect: 'none',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-100)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        >
                          <td colSpan={5} style={{ position: 'sticky', top: 36, zIndex: 9, background: 'inherit', padding: '10px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 0 var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{
                                display: 'inline-block', fontSize: 9,
                                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s', color: 'var(--muted)', flexShrink: 0,
                              }}>▶</span>
                              {/* Pin icon */}
                              {isPerClient && clientId && (() => {
                                const isClientPinned = localClientPinned[clientId] !== undefined ? localClientPinned[clientId] : !!clientPinned;
                                return (
                                  <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePinClient(clientId, isClientPinned); }}
                                    style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', color: isClientPinned ? 'var(--olive)' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s', flexShrink: 0 }}
                                    title={isClientPinned ? 'Unpin client' : 'Pin client'}
                                  >
                                    <Pin size={14} style={{ fill: isClientPinned ? 'var(--olive)' : 'none', transform: 'rotate(45deg)' }} />
                                  </button>
                                );
                              })()}
                              <span style={{
                                fontSize: 13.5, fontWeight: 700, color: 'var(--olive-dark)',
                                background: 'var(--olive-50)', padding: '3px 10px', borderRadius: 6,
                                border: '1px solid var(--olive-100)', letterSpacing: '0.2px',
                              }}>
                                {groupKey}
                              </span>
                              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                                · {groupItems.length} {groupItems.length !== 1 ? 'alerts' : 'alert'}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Task Rows — indented like /team page */}
                        {isOpen && groupItems.map((item: any, itemIdx: number) => {
                          const s = TYPE_STYLES[item.alertType] || TYPE_STYLES.due_today;
                          const { Icon } = s;
                          const isHighlighted = localHighlighted[item.id] !== undefined ? localHighlighted[item.id] : (item.isAlerted || item.isPinned || false);
                          return (
                            <tr
                              key={item.id}
                              onClick={() => item.clientId && router.push(`/clients/${item.clientId}`)}
                              className={`standup-row ${isHighlighted ? 'highlighted' : ''}`}
                              style={{
                                cursor: 'pointer',
                                borderBottom: itemIdx === groupItems.length - 1 ? '2px solid var(--border)' : '1px solid var(--surface-2)',
                                background: isHighlighted ? 'rgba(107,63,160,0.04)' : 'var(--surface)',
                              }}
                            >
                              <td style={{ padding: '10px 18px 10px 40px', verticalAlign: 'top', width: '35%', position: 'relative' }}>
                                {/* Tree connector line */}
                                <div style={{
                                  position: 'absolute',
                                  left: 20,
                                  top: 0,
                                  bottom: itemIdx === groupItems.length - 1 ? '50%' : 0,
                                  width: 1,
                                  background: 'var(--border)',
                                }} />
                                <div style={{
                                  position: 'absolute',
                                  left: 20,
                                  top: '50%',
                                  width: 12,
                                  height: 1,
                                  background: 'var(--border)',
                                }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>{item.detail}</div>
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'top', width: '20%' }}>
                                {isPerClient ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{item.assignee}</div>
                                    {item.assigneeTeam && (
                                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{item.assigneeTeam}</div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{item.clientName}</div>
                                )}
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'top', fontSize: 12, width: '25%' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <div><strong style={{ color: 'var(--muted)' }}>Step:</strong> <span style={{ color: 'var(--ink)' }}>{item.stepLabel || '—'}</span></div>
                                  <div><strong style={{ color: 'var(--muted)' }}>Assigned:</strong> <span style={{ color: 'var(--ink)' }}>{item.createdAt ? format(new Date(item.createdAt), 'd MMM yyyy') : '—'}</span></div>
                                  <div><strong style={{ color: 'var(--muted)' }}>Due Date:</strong> <span style={{ color: 'var(--ink)' }}>{item.dueDate ? format(new Date(item.dueDate), 'd MMM yyyy') : '—'}</span></div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'top', width: '10%' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 4, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                                  <Icon size={10} /> {s.label}
                                </div>
                                <div style={{ marginTop: 4, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 11, fontWeight: 700, color: s.color }}>
                                  {s.tag(item)}
                                </div>
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', width: '10%' }}>
                                <div onClick={e => e.stopPropagation()}>
                                  <ActionDropdown
                                    align="right"
                                    actions={[
                                      {
                                        label: isHighlighted ? 'Remove Alert' : 'Alert',
                                        icon: <AlertCircle size={13} />,
                                        onClick: () => handleHighlight(item.id),
                                      },
                                      {
                                        label: 'Update',
                                        icon: <Edit2 size={13} />,
                                        onClick: () => setEditingTask(item),
                                      },
                                      {
                                        label: 'Dismiss',
                                        icon: <Trash2 size={13} />,
                                        onClick: () => handleIgnore(item.id),
                                        danger: true,
                                      }
                                    ]}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {editingTask && isAdmin && (
          <UpdateTaskModal
            open={!!editingTask}
            onClose={() => setEditingTask(null)}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['standup'] });
              qc.invalidateQueries({ queryKey: ['tasks'] });
            }}
            task={editingTask}
            users={liveUsers || []}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ── Inline Styles ────────────────────────────────────────────────────────

const statCardStyle = (accent: string, bg: string, isActive: boolean): React.CSSProperties => ({
  position: 'relative',
  background: bg,
  borderTop: `2px solid ${accent}`,
  borderRight: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  borderLeft: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 110,
  overflow: 'hidden',
  boxShadow: isActive ? 'var(--shadow-md)' : 'var(--shadow-sm)',
  transition: 'all 0.15s ease',
  transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
});

const statCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 11.5,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const iconContainerStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const statCardValueContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 'auto',
};

const statCardValueStyle: React.CSSProperties = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.1,
  color: 'var(--ink)',
};

const statCardSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted)',
};

const badgeStyle = (bg: string, color: string, label: string): React.CSSProperties => ({
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 4,
  background: bg,
  color: color,
  textAlign: 'center',
});