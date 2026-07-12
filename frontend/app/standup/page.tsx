'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
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
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import React, { useState, useMemo, useEffect } from 'react';
import { USE_MOCK } from '@/lib/mockData';

const TEAMS = ['Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 'Account Manager', 'Content Team'];
const AUTO_REFRESH_MS = 30_000;

const TYPE_STYLES: Record<string, { color: string; bg: string; Icon: any; label: string; tag: (i: any) => string }> = {
  overdue: {
    color: 'var(--red)', bg: 'var(--red-bg)', Icon: TriangleAlert, label: 'OVERDUE',
    tag: (i) => `${i.daysLate} day${i.daysLate !== 1 ? 's' : ''} late`,
  },
  blocked: {
    color: '#6B3FA0', bg: '#F0E8FA', Icon: Ban, label: 'BLOCKER',
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

export default function StandupPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  
  const [localHighlighted, setLocalHighlighted] = useState<Record<string, boolean>>({});
  const [localClientPinned, setLocalClientPinned] = useState<Record<string, boolean>>({});
  const [ignoredItems, setIgnoredItems] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
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
    refetchOnWindowFocus: true,
    retry: false,
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

  const filteredItems = useMemo(() => {
    return items.filter((item: any) => {
      const searchMatch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.clientName.toLowerCase().includes(search.toLowerCase()) ||
        (item.stepLabel && item.stepLabel.toLowerCase().includes(search.toLowerCase())) ||
        item.detailText.toLowerCase().includes(search.toLowerCase());

      const alertTypeMatch = !alertTypeFilter || item.alertType === alertTypeFilter;
      const teamMatch = !teamFilter || item.assigneeTeam === teamFilter;
      const clientMatch = !clientFilter || item.clientName === clientFilter;
      const notIgnored = !ignoredItems.has(item.id);

      return searchMatch && alertTypeMatch && teamMatch && clientMatch && notIgnored;
    });
  }, [items, search, alertTypeFilter, teamFilter, clientFilter, ignoredItems]);

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
      await highlightMut.mutateAsync(id);
    } catch (err) {
      // Revert if error
      setLocalHighlighted(prev => ({
        ...prev,
        [id]: currentStatus
      }));
    }
  };

  const handlePinClient = async (clientId: string, currentPinStatus: boolean) => {
    const nextStatus = !currentPinStatus;
    setLocalClientPinned(prev => ({
      ...prev,
      [clientId]: nextStatus
    }));
    try {
      await apiFetch(`/api/clients/${clientId}/${nextStatus ? 'pin' : 'unpin'}`, {
        method: 'PATCH'
      });
      qc.invalidateQueries({ queryKey: ['standup'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      window.dispatchEvent(new Event('pinned-updated'));
    } catch (err) {
      setLocalClientPinned(prev => ({
        ...prev,
        [clientId]: currentPinStatus
      }));
    }
  };

  const handleIgnore = (id: string) => {
    const next = new Set(ignoredItems);
    next.add(id);
    setIgnoredItems(next);
    localStorage.setItem('standup_ignored', JSON.stringify(Array.from(next)));
  };

  // Stats for summary bar
  const stats = useMemo(() => {
    const total = filteredItems.length;
    const overdue = filteredItems.filter((i: any) => i.alertType === 'overdue').length;
    const blocked = filteredItems.filter((i: any) => i.alertType === 'blocked').length;
    const dueToday = filteredItems.filter((i: any) => i.alertType === 'due_today').length;
    return { total, overdue, blocked, dueToday };
  }, [filteredItems]);

  const isLoading = liveLoading && items.length === 0;

  return (
    <AppLayout>
      <Topbar title="Standup Brief" subtitle="Daily team alignment and risk evaluation" />
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Overhead Summary Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          
          <div 
            onClick={() => setAlertTypeFilter('')}
            onMouseEnter={e => {
              e.currentTarget.style.borderTopColor = 'var(--olive)';
              e.currentTarget.style.borderRightColor = 'var(--olive)';
              e.currentTarget.style.borderBottomColor = 'var(--olive)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderTopColor = 'var(--border)';
              e.currentTarget.style.borderRightColor = 'var(--border)';
              e.currentTarget.style.borderBottomColor = 'var(--border)';
              e.currentTarget.style.transform = alertTypeFilter === '' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === '' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--olive)', alertTypeFilter === ''), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ ...statCardHeaderStyle, color: 'var(--olive)' }}>
                <Users size={14} style={{ color: 'var(--olive)' }} />
                <span style={{ fontWeight: 800 }}>Total Alerts</span>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{stats.total}</span>
                <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>Active alerts</span>
              </div>
            </div>
          </div>

          <div 
            onClick={() => setAlertTypeFilter('overdue')}
            onMouseEnter={e => {
              e.currentTarget.style.borderTopColor = 'var(--red)';
              e.currentTarget.style.borderRightColor = 'var(--red)';
              e.currentTarget.style.borderBottomColor = 'var(--red)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderTopColor = 'var(--border)';
              e.currentTarget.style.borderRightColor = 'var(--border)';
              e.currentTarget.style.borderBottomColor = 'var(--border)';
              e.currentTarget.style.transform = alertTypeFilter === 'overdue' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'overdue' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--red)', alertTypeFilter === 'overdue'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ ...statCardHeaderStyle, color: 'var(--red)' }}>
                <TriangleAlert size={14} style={{ color: 'var(--red)' }} />
                <span style={{ fontWeight: 800 }}>Overdue Tasks</span>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{stats.overdue}</span>
                <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>Past due date</span>
              </div>
            </div>
          </div>

          <div 
            onClick={() => setAlertTypeFilter('blocked')}
            onMouseEnter={e => {
              e.currentTarget.style.borderTopColor = '#6B3FA0';
              e.currentTarget.style.borderRightColor = '#6B3FA0';
              e.currentTarget.style.borderBottomColor = '#6B3FA0';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderTopColor = 'var(--border)';
              e.currentTarget.style.borderRightColor = 'var(--border)';
              e.currentTarget.style.borderBottomColor = 'var(--border)';
              e.currentTarget.style.transform = alertTypeFilter === 'blocked' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'blocked' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('#6B3FA0', alertTypeFilter === 'blocked'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ ...statCardHeaderStyle, color: '#6B3FA0' }}>
                <Ban size={14} style={{ color: '#6B3FA0' }} />
                <span style={{ fontWeight: 800 }}>Blocked Tasks</span>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{stats.blocked}</span>
                <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>Awaiting resolution</span>
              </div>
            </div>
          </div>

          <div 
            onClick={() => setAlertTypeFilter('due_today')}
            onMouseEnter={e => {
              e.currentTarget.style.borderTopColor = 'var(--amber)';
              e.currentTarget.style.borderRightColor = 'var(--amber)';
              e.currentTarget.style.borderBottomColor = 'var(--amber)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderTopColor = 'var(--border)';
              e.currentTarget.style.borderRightColor = 'var(--border)';
              e.currentTarget.style.borderBottomColor = 'var(--border)';
              e.currentTarget.style.transform = alertTypeFilter === 'due_today' ? 'translateY(-2px)' : 'translateY(0)';
              e.currentTarget.style.boxShadow = alertTypeFilter === 'due_today' ? 'var(--shadow-md)' : 'var(--shadow-sm)';
            }}
            style={{ ...statCardStyle('var(--amber)', alertTypeFilter === 'due_today'), cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ ...statCardHeaderStyle, color: 'var(--amber)' }}>
                <Clock size={14} style={{ color: 'var(--amber)' }} />
                <span style={{ fontWeight: 800 }}>Due Today</span>
              </div>
              <div style={statCardValueContainerStyle}>
                <span style={{ ...statCardValueStyle, color: 'var(--ink)' }}>{stats.dueToday}</span>
                <span style={{ ...statCardSubtitleStyle, color: 'var(--muted)' }}>Due within 24h</span>
              </div>
            </div>
          </div>

        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '12px 16px'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 2, minWidth: 350 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input
              type="text"
              placeholder="Search standup items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 34px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--ink)',
                outline: 'none', transition: 'all 0.15s'
              }}
            />
          </div>

          {/* Alert Type */}
          <select
            value={alertTypeFilter}
            onChange={(e) => setAlertTypeFilter(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', cursor: 'pointer',
              width: 130
            }}
          >
            <option value="">All Alerts</option>
            <option value="overdue">Overdue</option>
            <option value="blocked">Blocked</option>
            <option value="due_today">Due Today</option>
          </select>

          {/* Team Filter */}
          {user?.role !== 'team_leader' ? (
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={{
                padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                fontSize: 13, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', cursor: 'pointer',
                width: 140
              }}
            >
              <option value="">All Teams</option>
              {TEAMS.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
              Team: <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.teamName}</span>
            </div>
          )}

          {/* Client Filter */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', cursor: 'pointer',
              width: 140
            }}
          >
            <option value="">All Clients</option>
            {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Grouped Alert Table */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading standup brief…</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: 'var(--olive)', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>No items match standup criteria!</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>All clear or try adjusting your filters.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Actions bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <button 
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  Object.keys(groupedItems).forEach(k => { next[k] = true; });
                  setExpandedGroups(next);
                }} 
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer'
                }}
              >
                Expand all
              </button>
              <button 
                onClick={() => {
                  setExpandedGroups({});
                }} 
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer'
                }}
              >
                Collapse all
              </button>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '35%' }}>TASK & DETAILS</th>
                      <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '20%' }}>
                        {isPerClient ? 'ASSIGNEE' : 'CLIENT NAME'}
                      </th>
                      <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '25%' }}>CURRENT STEP & TIMING</th>
                      <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '10%' }}>ALERT TYPE</th>
                      <th style={{ padding: '10px 18px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center', width: '10%' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedItems).map(([groupKey, groupItems]) => {
                      const firstItem = groupItems[0];
                      const clientId = firstItem?.clientId;
                      const clientPinned = firstItem?.clientPinned;
                      const isOpen = !!expandedGroups[groupKey];
                      return (
                        <React.Fragment key={groupKey}>
                          {/* Group Header Row */}
                          <tr
                            onClick={() => setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                            style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', userSelect: 'none' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                          >
                            <td colSpan={5} style={{ padding: '12px 18px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <span style={{ 
                                    display: 'inline-block',
                                    fontSize: 9, 
                                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                                    transition: 'transform 0.2s',
                                    color: 'var(--muted)',
                                    flexShrink: 0 
                                  }}>▶</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                                    {isPerClient ? 'Client' : 'Assignee'}: {groupKey}
                                  </span>
                                </div>
                                <span style={{ 
                                  padding: '2px 8px', 
                                  borderRadius: 12, 
                                  background: 'rgba(30, 64, 175, 0.1)', 
                                  color: '#1e40af', 
                                  fontSize: 10.5, 
                                  fontWeight: 700 
                                }}>
                                  {groupItems.length} Alert{groupItems.length !== 1 ? 's' : ''}
                                </span>

                                {isPerClient && clientId && (() => {
                                  const isClientPinned = localClientPinned[clientId] !== undefined ? localClientPinned[clientId] : !!clientPinned;
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePinClient(clientId, isClientPinned);
                                      }}
                                      style={{
                                        marginLeft: 'auto',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        background: 'var(--surface)',
                                        color: 'var(--ink-2)',
                                        border: '1px solid var(--border)',
                                        transition: 'all 0.2s',
                                      }}
                                    >
                                      <Pin size={11} style={{ transform: isClientPinned ? 'rotate(45deg)' : 'none', color: isClientPinned ? 'var(--olive)' : 'inherit', flexShrink: 0 }} />
                                      {isClientPinned ? 'UNPIN CLIENT' : 'PIN CLIENT'}
                                    </button>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>

                          {/* Member Rows */}
                          {isOpen && groupItems.map((item: any) => {
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
                                  borderBottom: '1px solid var(--surface-2)',
                                }}
                              >
                                <td style={{ padding: '10px 18px', verticalAlign: 'top', width: '35%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: s.color }} />
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
                                  <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: s.color }}>
                                    {s.tag(item)}
                                  </div>
                                </td>
                                <td style={{ padding: '10px 18px', verticalAlign: 'middle', textAlign: 'center', width: '10%' }}>
                                  <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'center', width: '100%' }} onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleHighlight(item.id)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        background: isHighlighted 
                                          ? 'linear-gradient(135deg, var(--red), #dc2626)' 
                                          : 'var(--surface)',
                                        color: isHighlighted ? '#fff' : 'var(--ink-2)',
                                        border: `1px solid ${isHighlighted ? '#dc2626' : 'var(--border)'}`,
                                        boxShadow: isHighlighted ? '0 2px 4px rgba(220,38,38,0.2)' : 'none',
                                        transition: 'all 0.2s',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                      }}
                                      onMouseEnter={e => {
                                        if (!isHighlighted) {
                                          e.currentTarget.style.background = 'rgba(220, 38, 38, 0.05)';
                                          e.currentTarget.style.borderColor = 'var(--red)';
                                          e.currentTarget.style.color = 'var(--red)';
                                        }
                                      }}
                                      onMouseLeave={e => {
                                        if (!isHighlighted) {
                                          e.currentTarget.style.background = 'var(--surface)';
                                          e.currentTarget.style.borderColor = 'var(--border)';
                                          e.currentTarget.style.color = 'var(--ink-2)';
                                        }
                                      }}
                                    >
                                      <AlertCircle size={11} />
                                      {isHighlighted ? 'ALERTED' : 'ALERT'}
                                    </button>
                                    <button
                                      onClick={() => handleIgnore(item.id)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '6px 12px',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: 'var(--ink-2)',
                                        background: 'var(--surface)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                      }}
                                      onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
                                        e.currentTarget.style.borderColor = 'var(--red)';
                                        e.currentTarget.style.color = 'var(--red)';
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.background = 'var(--surface)';
                                        e.currentTarget.style.color = 'var(--ink-2)';
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                      }}
                                    >
                                      <Trash2 size={11} />
                                      DISMISS
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ── Inline Styles ────────────────────────────────────────────────────────

const statCardStyle = (accent: string, isActive: boolean): React.CSSProperties => ({
  position: 'relative',
  background: isActive ? 'var(--surface-2)' : 'var(--surface)',
  borderTop: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
  borderBottom: '1px solid var(--border)',
  borderLeft: `4px solid ${accent}`,
  borderRadius: 'var(--radius)',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 110,
  overflow: 'hidden',
  boxShadow: isActive ? 'var(--shadow-md)' : 'var(--shadow-sm)',
  transition: 'all 0.15s ease',
  transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
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

const badgeStyle = (bg: string, color: string, label: string): React.CSSProperties => ({
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 4,
  background: bg,
  color: color,
  textAlign: 'center',
});