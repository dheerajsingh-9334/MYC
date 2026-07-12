'use client';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { deriveSparkline } from '@/lib/sparkline';
import { ArrowRight, ArrowUpDown, Search, UserPlus, CircleCheck, Clock, TriangleAlert, Sparkles, Users, Download, X, Pin, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { USE_MOCK, MOCK_CLIENTS, MOCK_STATS } from '@/lib/mockData';
import AddClientModal from '@/components/pipeline/AddClientModal';
import CSVImportModal from '@/components/ui/CSVImportModal';

export default function ClientsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const isAdmin = mounted && user?.role === 'admin';

  useEffect(() => {
    if (mounted && user && user.role && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [mounted, user, router]);

  if (mounted && user?.role && user.role !== 'admin') {
    return (
      <AppLayout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Redirecting...</div>
      </AppLayout>
    );
  }
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const qc = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('clients');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');
  const [expStepId, setExpStepId] = useState('');
  const [expStatus, setExpStatus] = useState('');
  const [expIncludeArchived, setExpIncludeArchived] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

  const { data: stepsList = [] } = useQuery<any[]>({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    retry: false,
    enabled: !!user,
  });

  const [pinnedClientIds, setPinnedClientIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      setPinnedClientIds(JSON.parse(localStorage.getItem('pinned_clients') || '[]'));
    } catch (e) {}
  }, []);

  const togglePinClient = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const current = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      let updated;
      if (current.includes(id)) {
        updated = current.filter((x: string) => x !== id);
      } else {
        updated = [...current, id];
      }
      localStorage.setItem('pinned_clients', JSON.stringify(updated));
      setPinnedClientIds(updated);
      window.dispatchEvent(new Event('pinned-updated'));
    } catch (err) {}
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const f = params.get('filter');
      if (f) {
        setFilter(f);
      }
    }
  }, []);

  const { data: liveStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiFetch('/api/dashboard/stats'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const { data: liveClients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const { data: liveTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK,
    retry: false,
  });

  const stats = USE_MOCK ? MOCK_STATS : liveStats;
  const allClients: any[] = USE_MOCK ? MOCK_CLIENTS : liveClients;
  const allTasks: any[] = USE_MOCK ? [] : liveTasks;

  const getHumanReadableTiming = (client: any) => {
    const daysInStep = client.daysInStep ?? 0;
    const slaDays = client.currentStep?.slaDays ?? 1;
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
    const slaDays = client.currentStep?.slaDays ?? 1;
    const daysLate = daysInStep - slaDays;

    if (client.computedStatus === 'overdue') {
      if (daysLate > 3) {
        return {
          bg: 'var(--red-bg)',
          color: 'var(--red)',
          dot: 'var(--red)',
          label: 'Late',
        };
      } else {
        return {
          bg: 'var(--amber-bg)',
          color: 'var(--amber)',
          dot: 'var(--amber)',
          label: 'Slight delay',
        };
      }
    } else if (client.computedStatus === 'blocked') {
      return {
        bg: 'var(--amber-bg)',
        color: 'var(--amber)',
        dot: 'var(--amber)',
        label: 'Blocked',
      };
    } else if (client.computedStatus === 'due_today') {
      return {
        bg: 'var(--amber-bg)',
        color: 'var(--amber)',
        dot: 'var(--amber)',
        label: 'Due today',
      };
    } else {
      return {
        bg: 'var(--green-bg)',
        color: 'var(--green)',
        dot: 'var(--green)',
        label: 'On track',
      };
    }
  };

  const filtered = allClients
    .filter((c: any) => {
      if (filter === 'active') return c.status === 'active';
      if (filter === 'completed') return c.status === 'completed';
      if (filter === 'overdue') return c.computedStatus === 'overdue';
      if (filter === 'due_today') return c.computedStatus === 'due_today';
      if (filter === 'on_track') return c.computedStatus === 'on_track';
      if (filter === 'blocked') return c.computedStatus === 'blocked';
      return true;
    })
    .filter((c: any) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.fullName?.toLowerCase().includes(q) ||
        c.brandName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { overdue: 0, blocked: 1, due_today: 2, on_track: 3 };
      const statusDiff = (order[a.computedStatus] ?? 4) - (order[b.computedStatus] ?? 4);
      if (statusDiff !== 0) return statusDiff;

      // if both are overdue, sort by most overdue first
      if (a.computedStatus === 'overdue' && b.computedStatus === 'overdue') {
        const aLate = (a.daysInStep ?? 0) - (a.currentStep?.slaDays ?? 0);
        const bLate = (b.daysInStep ?? 0) - (b.currentStep?.slaDays ?? 0);
        return bLate - aLate;
      }
      return 0;
    });

  const [clientLimit, setClientLimit] = useState(15);
  const scrollableClients = useMemo(() => {
    return filtered.slice(0, clientLimit);
  }, [filtered, clientLimit]);

  const handleClientScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setClientLimit((prev) => Math.min(prev + 15, filtered.length));
    }
  };

  // Reset limit when filter/search changes
  useEffect(() => {
    setClientLimit(15);
  }, [filter, search]);

  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: 'Overdue' },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };

  const chips = [
    { key: 'all',       label: 'All',       count: allClients.length },
    { key: 'active',    label: 'Active',    count: allClients.filter((c: any) => c.status === 'active').length },
    { key: 'completed', label: 'Completed', count: allClients.filter((c: any) => c.status === 'completed').length },
    { key: 'overdue',   label: 'Overdue',   count: allClients.filter((c: any) => c.computedStatus === 'overdue').length },
    { key: 'blocked',   label: 'Blocked',   count: allClients.filter((c: any) => c.computedStatus === 'blocked').length },
    { key: 'due_today', label: 'Due Today', count: allClients.filter((c: any) => c.computedStatus === 'due_today').length },
    { key: 'on_track',  label: 'On Track',  count: allClients.filter((c: any) => c.computedStatus === 'on_track').length },
  ];

  const thStyleBase: React.CSSProperties = { textAlign: 'left', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)' };
  const colStyles = {
    client: { width: '25%', minWidth: '180px' } as React.CSSProperties,
    step: { width: '18%', minWidth: '130px' } as React.CSSProperties,
    team: { width: '15%', minWidth: '110px' } as React.CSSProperties,
    status: { width: '12%', minWidth: '90px' } as React.CSSProperties,
    daysInStep: { width: '12%', minWidth: '90px' } as React.CSSProperties,
    duration: { width: '12%', minWidth: '90px' } as React.CSSProperties,
    actions: { width: '6%', minWidth: '70px', textAlign: 'right' } as React.CSSProperties,
  };

  return (
    <AppLayout>
      <Topbar
        title="Clients"
        subtitle={`${allClients.filter((c: any) => c.status === 'active').length} active clients · ${allClients.length} total`}
        search={search}
        setSearch={setSearch}
      />
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

       

        {/* Table card */}
        <SectionCard
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Client Pipeline
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowUpDown size={11} /> Sorted by status
              </span>
            </span>
          }
          action={
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setExportType('clients');
                      setShowExportModal(true);
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
                  >
                    Export Clients
                  </button>
                  <button
                    onClick={() => setShowCSVModal(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
                  >
                    Upload CSV
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--olive)', color: '#fff', border: 'none',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
                  >
                    <Plus size={13} /> Add Client
                  </button>
                </div>
              )}

              {/* View toggle */}
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)' }}>
                <button
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: viewMode === 'table' ? 'var(--olive)' : 'transparent',
                    color: viewMode === 'table' ? '#fff' : 'var(--ink-2)',
                    transition: 'all 0.15s',
                  }}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: viewMode === 'grid' ? 'var(--olive)' : 'transparent',
                    color: viewMode === 'grid' ? '#fff' : 'var(--ink-2)',
                    transition: 'all 0.15s',
                  }}
                >
                  Cards
                </button>
              </div>
            </div>
          }
          padding={0}
        >
          {/* Filter chips */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {chips.map((chip) => (
              <button key={chip.key} onClick={() => setFilter(chip.key)}
                style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer', transition: 'background 0.12s, color 0.12s, border-color 0.12s', borderColor: filter === chip.key ? 'var(--olive)' : 'var(--border)', background: filter === chip.key ? 'var(--olive)' : 'var(--surface)', color: filter === chip.key ? '#fff' : 'var(--ink-2)' }}>
                {chip.label}
                <span style={{ background: filter === chip.key ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)', padding: '1px 6px', borderRadius: 10, fontSize: 10.5, marginLeft: 4 }}>{chip.count}</span>
              </button>
            ))}
          </div>

          {viewMode === 'grid' ? (
            <div 
              onScroll={handleClientScroll}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, padding: 20, background: 'var(--surface-2)', minHeight: 'calc(100vh - 240px)', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}
            >
              {scrollableClients.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={28} style={{ color: 'var(--olive)' }} />
                    <div>{search ? 'No clients match your search.' : 'No clients found.'}</div>
                  </div>
                </div>
              ) : (
                scrollableClients.map((client: any) => {
                  const sc = getClientStatusStyles(client);
                  const initials = (client.brandName || client.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const stepNum = client.currentStep?.stepNumber;
                  const stepNumPad = String(stepNum || 0).padStart(2, '0');
                  const daysInStep = client.daysInStep ?? 0;
                  const slaDays = client.currentStep?.slaDays ?? 1;
                  const progressPct = Math.min(100, Math.round((daysInStep / slaDays) * 100));
                  const isLate = client.computedStatus === 'overdue';
                  const isBlocked = client.computedStatus === 'blocked';

                  return (
                    <div
                      key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        transition: 'all 0.15s ease',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--olive)';
                        e.currentTarget.style.boxShadow = 'var(--shadow)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                       {/* Header: Avatar + Title/Status */}
                      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>                          {isAdmin && (
                            <button
                              onClick={(e) => togglePinClient(client.id, e)}
                              style={{
                                border: 'none',
                                background: 'none',
                                padding: 4,
                                cursor: 'pointer',
                                color: pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'var(--muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--olive)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'var(--muted)')}
                              title={pinnedClientIds.includes(client.id) ? "Unpin client" : "Pin client"}
                            >
                              <Pin size={16} style={{ fill: pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'none', transform: 'rotate(45deg)' }} />
                            </button>
                          )}
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--olive), var(--olive-light))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {client.brandName || client.fullName}
                            </h3>
                            <div style={{ fontSize: 11.5, color: 'var(--soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {client.fullName}
                            </div>
                          </div>
                        </div>

                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }} />
                          {sc.label}
                        </span>
                      </div>

                      {/* Step progress details */}
                      <div style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                          <span>CURRENT STEP</span>
                          <span>{progressPct}% SLA</span>
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ background: 'var(--olive)', color: '#fff', padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                            {stepNumPad}
                          </span>
                          {client.currentStep?.name || 'Unassigned'}
                        </div>

                        {/* Progress bar */}
                        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                          <div style={{
                            height: '100%',
                            width: `${progressPct}%`,
                            background: sc.color,
                            borderRadius: 3,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>

                        {/* Duration Info */}
                        <div style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} style={{ color: 'var(--soft)' }} />
                          <span>
                            {client.status === 'completed'
                              ? `Completed in ${client.completionDurationDays ?? Math.max(1, Math.round((Date.now() - new Date(client.dateJoined).getTime()) / (1000 * 60 * 60 * 24)))} days`
                              : `${client.completionDurationDays ?? Math.max(1, Math.round((Date.now() - new Date(client.dateJoined).getTime()) / (1000 * 60 * 60 * 24)))} days elapsed`}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Details Row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--olive-light)' }} />
                          {client.currentStep?.owningTeamName || 'Unassigned'}
                        </span>
                        <span>
                          {getHumanReadableTiming(client)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Table */
            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div 
                onScroll={handleClientScroll}
                style={{
                  maxHeight: 'calc(100vh - 280px)',
                  minHeight: 'calc(100vh - 280px)',
                  overflowY: 'auto',
                  overflowX: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--surface)',
                }}
              >                 <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10 }}>
                      <th style={{ ...thStyleBase, ...colStyles.client }}>Client</th>
                      <th style={{ ...thStyleBase, ...colStyles.step }}>Step</th>
                      <th style={{ ...thStyleBase, ...colStyles.team }}>Team</th>
                      <th style={{ ...thStyleBase, ...colStyles.status }}>Status</th>
                      <th style={{ ...thStyleBase, ...colStyles.daysInStep }}>Days in Step</th>
                      <th style={{ ...thStyleBase, ...colStyles.duration }}>Total Duration</th>
                      <th style={{ ...thStyleBase, ...colStyles.actions }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(USE_MOCK ? false : isLoading) ? (
                      <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading clients…</td></tr>
                    ) : scrollableClients.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <Sparkles size={28} style={{ color: 'var(--olive)' }} />
                          <div>{search ? 'No clients match your search.' : 'No clients found.'}</div>
                        </div>
                      </td></tr>
                    ) : scrollableClients.map((client: any) => {
                      const sc = getClientStatusStyles(client);
                      const initials = (client.brandName || client.fullName).split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                      const stepNum = client.currentStep?.stepNumber;
                      const stepNumPad = String(stepNum || 0).padStart(2, '0');
                      const daysInStep = client.daysInStep ?? 0;
                      const slaDays = client.currentStep?.slaDays ?? 1;
                      const isOverdue = client.computedStatus === 'overdue';
                      const dayLabel = getHumanReadableTiming(client);

                      const durationDays = client.completionDurationDays ?? Math.max(1, Math.round((Date.now() - new Date(client.dateJoined).getTime()) / (1000 * 60 * 60 * 24)));

                      return (
                        <tr key={client.id}
                          onClick={() => router.push(`/clients/${client.id}`)}
                          className={`standup-row ${client.isPinned ? 'highlighted' : ''}`}
                          style={{ position: 'relative', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                          <td style={{ position: 'relative', padding: '10px 18px', verticalAlign: 'middle', ...colStyles.client }}>
                            <span style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--olive)', transform: 'scaleY(0)', transformOrigin: 'top', transition: 'transform 0.1s' }} className="row-stripe" />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {isAdmin && (
                                <button
                                  onClick={(e) => togglePinClient(client.id, e)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    padding: 4,
                                    cursor: 'pointer',
                                    color: pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'var(--muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.15s',
                                    flexShrink: 0,
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--olive)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'var(--muted)')}
                                  title={pinnedClientIds.includes(client.id) ? "Unpin client" : "Pin client"}
                                >
                                  <Pin size={16} style={{ fill: pinnedClientIds.includes(client.id) ? 'var(--olive)' : 'none', transform: 'rotate(45deg)' }} />
                                </button>
                              )}
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--olive), var(--olive-light))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{initials}</div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13.5, whiteSpace: 'normal', wordBreak: 'break-word' }}>{client.brandName || client.fullName}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--soft)', whiteSpace: 'normal', wordBreak: 'break-word' }}>{client.fullName} · joined {new Date(client.dateJoined).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.step }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--olive-dark)' }}>
                              <span style={{ background: 'var(--olive)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{stepNumPad}</span>
                              {client.currentStep?.name}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.team }}>
                            <span style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)', flexShrink: 0 }} />
                              {client.currentStep?.owningTeamName}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.status }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: 600, background: sc.bg, color: sc.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.daysInStep }}>
                            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: sc.color, fontWeight: isOverdue ? 600 : 400 }}>
                              {dayLabel}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.duration }}>
                            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} style={{ color: 'var(--muted)' }} />
                              {client.status === 'completed'
                                ? `${durationDays} days (Completed)`
                                : `${durationDays} days (Ongoing)`}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...colStyles.actions }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/clients/${client.id}`); }}
                              style={{ padding: '5px 11px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'background 0.12s, border-color 0.12s, color 0.12s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; (e.currentTarget as HTMLElement).style.color = 'var(--olive)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; }}
                            >
                              View <ArrowRight size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Global Add Client Modal */}
      <AddClientModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['clients'] });
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
      />

      {/* Global CSV Import Modal */}
      <CSVImportModal
        open={showCSVModal}
        onClose={() => setShowCSVModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['clients'] });
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
        endpoint="/api/clients/import"
        title="Import Clients from CSV"
        templateLabel="Clients"
        templateColumns={['client_name', 'current_step_number', 'email', 'whatsapp', 'date_joined']}
      />

      {/* Global Export Modal */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Export Clients Report</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Filter and download detailed reports for clients in CSV or PDF.</div>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
              
              {/* Select export type */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Select Export Format</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {[
                    { type: 'clients', label: 'Clients List', desc: 'Summary list of onboarding details' },
                    { type: 'projects', label: 'Projects Portfolio', desc: 'Status, priority, manager, and completion rates' },
                    { type: 'tasks', label: 'Tasks List', desc: 'Detailed task assignments, due dates, and statuses' },
                    { type: 'client_full', label: 'Client Full Report', desc: 'Task counts & active steps' }
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Onboarded After</label>
                    <input type="date" value={expStartDate} onChange={e => setExpStartDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Onboarded Before</label>
                    <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                  </div>

                  {/* Step Filter */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Current Step</label>
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Client Status</label>
                    <select value={expStatus} onChange={e => setExpStatus(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                      <option value="">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="churned">Churned / Archived</option>
                    </select>
                  </div>

                  {/* Include Archived checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22, gridColumn: 'span 2' }}>
                    <input type="checkbox" id="expIncludeArchived" checked={expIncludeArchived} onChange={e => setExpIncludeArchived(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--olive)' }} />
                    <label htmlFor="expIncludeArchived" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>Include Archived / Churned Clients</label>
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
                if (expStartDate) params.set('startDate', expStartDate);
                if (expEndDate) params.set('endDate', expEndDate);
                if (expStepId) params.set('stepId', expStepId);
                if (expStatus) params.set('status', expStatus);
                if (expIncludeArchived) params.set('includeArchived', 'true');
                const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                if (token) params.set('token', token);
                const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                const link = document.createElement('a');
                link.href = url;
                link.download = `${exportType}_export_${Date.now()}.csv`;
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
                if (expStartDate) params.set('startDate', expStartDate);
                if (expEndDate) params.set('endDate', expEndDate);
                if (expStepId) params.set('stepId', expStepId);
                if (expStatus) params.set('status', expStatus);
                if (expIncludeArchived) params.set('includeArchived', 'true');
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


      <style>{`tr:hover .row-stripe { transform: scaleY(1) !important; }`}</style>
    </AppLayout>
  );
}