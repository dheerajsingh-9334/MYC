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
  Search, XCircle, RotateCcw, ChevronLeft, ChevronRight,
  ArrowUpDown, CircleCheck, Clock, TriangleAlert, Eye,
  Check, X, FolderOpen, Link2, Upload, FileText, Plus, ExternalLink, AlertCircle,
} from 'lucide-react';

const AUTO_REFRESH_MS = 30_000;
const PAGE_SIZE = 15;

// Chip filter kinds — virtual filters that don't map 1:1 to a status enum
type ChipKind = '' | 'overdue' | 'today' | 'rejected' | 'complete' | 'extension_requested';

export default function TasksPage() {
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  const [showCSVModal, setShowCSVModal] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [chipFilter, setChipFilter] = useState<ChipKind>('');

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

  const filtered = useMemo(() => {
    let list = tasks;
    if (teamFilter) list = list.filter((t) => t.step?.owningTeamName === teamFilter || t.assignedTo?.teamName === teamFilter);
    if (clientFilter) list = list.filter((t) => t.client?.id === clientFilter);

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
  }, [tasks, search, chipFilter, teamFilter, clientFilter, sortKey, sortDir]);

  const scrollableTasks = useMemo(() => {
    return filtered.slice(0, taskLimit);
  }, [filtered, taskLimit]);

  useEffect(() => { setTaskLimit(15); }, [search, chipFilter, teamFilter, clientFilter, sortKey, sortDir]);

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
    };
  }, [tasks]);

  const chips: { key: ChipKind; label: string; count: number; color?: string }[] = [
    { key: '',          label: 'All',        count: counts.total },
    { key: 'overdue',   label: 'Overdue',    count: counts.overdue, color: 'var(--red)' },
    { key: 'today',     label: 'Due Today',  count: counts.today,   color: 'var(--amber)' },
    { key: 'extension_requested', label: 'Extension Requested', count: counts.extension_requested, color: 'var(--blue)' },
    { key: 'rejected',  label: 'Rejected',   count: counts.rejected, color: '#B0436A' },
    { key: 'complete',  label: 'Completed',  count: counts.complete, color: 'var(--green)' },
  ];

  return (
    <AppLayout>
      <Topbar
        title={isAdmin ? 'All Tasks' : 'My Tasks'}
        subtitle={isAdmin ? `Org-wide · ${counts.total} tasks` : `${user?.fullName || 'Team Member'} · ${user?.teamName || ''}`}
        renderActions={() => isAdmin && (
          <button
            onClick={() => setShowCSVModal(true)}
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
            Upload CSV
          </button>
        )}
      />
      <div style={{ padding: '16px 20px', flex: 1 }}>

        {/* Status chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {chips.map((c) => {
            const active = chipFilter === c.key;
            return (
              <button key={c.label} onClick={() => setChipFilter(c.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 13px', borderRadius: 999,
                  border: `1px solid ${active ? (c.color || 'var(--olive)') : 'var(--border)'}`,
                  background: active ? (c.color || 'var(--olive)') : 'var(--surface)',
                  color: active ? '#fff' : 'var(--ink-2)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                {c.label}
                <span style={{
                  background: active ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                  color: active ? '#fff' : (c.color || 'var(--muted)'),
                  fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                }}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search task, client, or assignee…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
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
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
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
  task: t, isAdmin, onComplete, onReject, onReopen, reopenPending, onOpenVault, onBlock, onExtend,
}: {
  task: any; isAdmin: boolean;
  onComplete: () => void;
  onReject: () => void;
  onReopen: () => void;
  reopenPending: boolean;
  onOpenVault: () => void;
  onBlock?: () => void;
  onExtend?: () => void;
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
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: whenColor, fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap' }}>
        {done && <CircleCheck size={11} style={{ display: 'inline', marginRight: 4 }} />}
        {!done && !rej && (overdue ? <TriangleAlert size={11} style={{ display: 'inline', marginRight: 4 }} /> : today ? <Clock size={11} style={{ display: 'inline', marginRight: 4 }} /> : null)}
        {whenLabel}
      </td>
      <td style={{ padding: '10px 18px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {!isAdmin && !done && (
            <>
              <IconBtn title="Mark complete" onClick={onComplete}><Check size={11} /></IconBtn>
              {t.status !== 'blocked' && onBlock && (
                <IconBtn title="Raise blocker" onClick={onBlock}><TriangleAlert size={11} style={{ color: '#6B3FA0' }} /></IconBtn>
              )}
              {t.status !== 'extension_requested' && onExtend && (
                <IconBtn title="Request extension" onClick={onExtend}><Clock size={11} style={{ color: 'var(--amber)' }} /></IconBtn>
              )}
            </>
          )}
          {isAdmin && !done && (
            <IconBtn title="Reject" onClick={onReject}><XCircle size={11} /></IconBtn>
          )}
          {rej && isAdmin && (
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