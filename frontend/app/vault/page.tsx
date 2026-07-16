'use client';
import { useState, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder, FolderOpen, FileText, Search, Lock,
  Link2, X, ExternalLink, Eye, Trash2, Plus, AlertCircle, Edit2,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch, getUser, API_BASE } from '@/lib/api';
import ActionDropdown from '@/components/ui/ActionDropdown';
import UpdateDocumentModal from '@/components/pipeline/UpdateDocumentModal';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface DocNode {
  id: string; rawId?: string; name: string; fullName?: string;
  type: 'client' | 'step' | 'task' | 'doc';
  taskId?: string;
  childCount?: number; stepCount?: number;
  fileUrl?: string; mimeType?: string; fileSize?: number;
  driveUrl?: string; docType?: 'file' | 'drive_link'; notes?: string; description?: string;
  createdAt?: string; children?: DocNode[];
}

interface StepOption { id: string; name: string; stepNumber: number; }
interface ClientOption { id: string; name: string; }

/* ─── helpers ────────────────────────────────────────────────────────────── */
function formatSize(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Convert a Google Drive share URL → embeddable preview URL */
function toEmbedUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname;

    // Google Docs / Sheets / Slides  →  /preview
    if (host.includes('docs.google.com')) {
      return raw.replace(/\/(edit|view|pub)(\?.*)?$/, '/preview');
    }

    // drive.google.com/file/d/<ID>/view  →  /preview
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }

    // drive.google.com/open?id=<ID>  →  embed
    const idParam = u.searchParams.get('id');
    if (idParam) {
      return `https://drive.google.com/file/d/${idParam}/preview`;
    }

    return raw; // fallback — use as-is
  } catch {
    return raw;
  }
}

function driveIcon(url?: string) {
  if (!url) return '🔗';
  if (url.includes('spreadsheets')) return '📗';
  if (url.includes('document')) return '📘';
  if (url.includes('presentation')) return '📙';
  if (url.includes('forms')) return '📋';
  return '📁';
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function VaultPage() {
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    setUser(getUser());
  }, []);
  const isAdmin = user?.role === 'admin';
  const isLeader = user?.role === 'team_leader';
  const isMember = user?.role === 'team_member';

  const [search, setSearch] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Drive preview popup
  const [previewDoc, setPreviewDoc] = useState<DocNode | null>(null);
  const [editingDoc, setEditingDoc] = useState<any>(null);

  // Add Drive Link modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ clientId: '', stepId: '', taskId: '', title: '', driveUrl: '', notes: '', description: '' });
  const [formErr, setFormErr] = useState('');

  /* ── Data ── */
  const { data: vault = { folders: [], totalDocs: 0 } } = useQuery({
    queryKey: ['vault'],
    queryFn: () => apiFetch('/api/vault'),
  });

  // Fetch all tasks for dropdown derivation if non-admin
  const { data: allUserTasks = [] } = useQuery<any[]>({
    queryKey: ['vault-user-tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: showAddModal && !isAdmin,
  });

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['vault-clients'],
    queryFn: async () => {
      const data = await apiFetch('/api/clients');
      return (data as any[]).map((c: any) => ({ id: c.id, name: c.brandName || c.fullName }));
    },
    enabled: showAddModal && isAdmin,
  });

  const { data: steps = [] } = useQuery<StepOption[]>({
    queryKey: ['vault-steps', form.clientId],
    queryFn: async () => {
      const data = await apiFetch('/api/steps');
      return (data as any[]).map((s: any) => ({
        id: s.id, name: s.name, stepNumber: s.stepNumber,
      }));
    },
    enabled: showAddModal && !!form.clientId && isAdmin,
  });

  // Fetch tasks for selected client+step (admin only)
  const { data: tasks = [] } = useQuery<{id: string; title: string}[]>({
    queryKey: ['vault-tasks', form.clientId, form.stepId],
    queryFn: async () => {
      const data = await apiFetch(`/api/tasks?clientId=${form.clientId}&stepId=${form.stepId}`);
      return (data as any[]).map((t: any) => ({ id: t.id, title: t.title }));
    },
    enabled: showAddModal && !!form.clientId && !!form.stepId && isAdmin,
  });

  // Derive client list based on role
  const clientOptions = useMemo(() => {
    if (isAdmin) {
      return clients;
    }
    if (isLeader) {
      // Team leaders: use the vault folders returned by the scoped backend
      return (vault.folders as DocNode[]).map((c) => ({
        id: c.id.replace('client_', ''),
        name: c.name,
      }));
    }
    // Team members: derive from their assigned tasks
    const map = new Map<string, string>();
    allUserTasks
      .filter(t => (t.assignedToId || t.assignedTo?.id) === user?.id)
      .forEach(t => {
        if (t.client) {
          map.set(t.client.id, t.client.brandName || t.client.fullName);
        }
      });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clients, allUserTasks, vault.folders, isAdmin, isLeader, user?.id]);

  // Derive steps based on role and selected client
  const stepOptions = useMemo(() => {
    if (isAdmin) {
      return steps;
    }
    // For team_leader and team_member: derive from their tasks
    const map = new Map<string, { name: string; stepNumber: number }>();
    allUserTasks
      .filter(t => {
        // team_leader sees all team tasks; team_member sees only their own
        const byTeam = isLeader
          ? (t.assignedTo?.teamName === user?.teamName)
          : ((t.assignedToId || t.assignedTo?.id) === user?.id);
        return byTeam && (t.clientId === form.clientId || t.client?.id === form.clientId);
      })
      .forEach(t => {
        if (t.step) {
          map.set(t.step.id, { name: t.step.name, stepNumber: t.step.stepNumber });
        }
      });
    return Array.from(map.entries()).map(([id, s]) => ({ id, name: s.name, stepNumber: s.stepNumber }));
  }, [steps, allUserTasks, form.clientId, isAdmin, isLeader, user?.id, user?.teamName]);

  // Derive tasks based on role, selected client, and step
  const taskOptions = useMemo(() => {
    if (isAdmin) {
      return tasks;
    }
    return allUserTasks
      .filter(t => {
        const byTeam = isLeader
          ? (t.assignedTo?.teamName === user?.teamName)
          : ((t.assignedToId || t.assignedTo?.id) === user?.id);
        return byTeam
          && (t.clientId === form.clientId || t.client?.id === form.clientId)
          && (t.stepId === form.stepId || t.step?.id === form.stepId);
      })
      .map(t => ({ id: t.id, title: t.title }));
  }, [tasks, allUserTasks, form.clientId, form.stepId, isAdmin, isLeader, user?.id, user?.teamName]);

  /* ── Mutations ── */
  const addLink = useMutation({
    mutationFn: (body: object) => apiFetch('/api/vault/link', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vault'] }); closeModal(); },
    onError: (e: any) => setFormErr(e?.message || 'Failed to save link'),
  });

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiFetch(`/api/vault/${docId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vault'] }),
  });

  /* ── Handlers ── */
  const closeModal = () => {
    setShowAddModal(false);
    setForm({ clientId: '', stepId: '', taskId: '', title: '', driveUrl: '', notes: '', description: '' });
    setFormErr('');
  };

  const submitLink = () => {
    if (!form.clientId || !form.stepId || !form.driveUrl.trim()) {
      setFormErr('Client, step, and Drive URL are required.');
      return;
    }
    if (isMember && !form.taskId) {
      setFormErr('Selecting a task is required.');
      return;
    }
    try { new URL(form.driveUrl); } catch { setFormErr('Enter a valid URL.'); return; }
    setFormErr('');
    addLink.mutate({
      clientId: form.clientId,
      stepId: form.stepId,
      taskId: form.taskId || null,
      title: form.title || 'Drive Link',
      driveUrl: form.driveUrl.trim(),
      notes: form.notes,
      description: form.description,
    });
  };

  /* ── Filter ── */
  const filteredFolders = useMemo(() => {
    if (!search.trim()) return vault.folders as DocNode[];
    const q = search.toLowerCase();
    return (vault.folders as DocNode[]).filter((c) => {
      if (c.name.toLowerCase().includes(q) || c.fullName?.toLowerCase().includes(q)) return true;
      for (const s of c.children || []) {
        if (s.name.toLowerCase().includes(q)) return true;
        for (const d of s.children || []) if (d.name.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [vault.folders, search]);

  const toggleClient = (id: string) => setExpandedClients(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleStep = (id: string) => setExpandedSteps(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Render ── */
  return (
    <AppLayout>
      <Topbar title="Vault" subtitle={`${vault.totalDocs} item${vault.totalDocs !== 1 ? 's' : ''} across all clients — Proof of work organised by client → step`} />
      <div style={{ padding: 'var(--page-pad)', flex: 1 }}>
        {/* Toolbar — count left, controls right */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '8px 14px', marginBottom: 16, boxSizing: 'border-box',
        }}>
          {/* Left: count + active search pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            {/* <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', background: 'var(--surface-2)', padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
              {vault.totalDocs} {vault.totalDocs === 1 ? 'item' : 'items'}
            </span> */}
            {search.trim() && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontSize: 11, fontWeight: 600 }}>
                "{search}"
                <X size={10} style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />
              </span>
            )}
          </div>

          {/* Right: Search | Expand | Collapse | Add Drive Link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 200 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients, steps, files…"
                style={{ width: '100%', padding: '5px 10px 5px 28px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <button
              onClick={() => { setExpandedClients(new Set(filteredFolders.map(f => f.id))); setExpandedSteps(new Set(filteredFolders.flatMap(f => (f.children || []).map(s => s.id)))); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.color = 'var(--olive)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)'; }}>
              Expand all
            </button>
            <button
              onClick={() => { setExpandedClients(new Set()); setExpandedSteps(new Set()); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.color = 'var(--olive)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--ink-2)'; }}>
              Collapse all
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <button onClick={() => setShowAddModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)', background: 'var(--olive)', color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}>
              <Plus size={13} /> Add Drive Link
            </button>
          </div>
        </div>

        {/* Tree */}
        <SectionCard padding={0}>
          <div style={{ maxHeight: 'calc(100vh - 200px)', minHeight: 500, overflowY: 'auto', overflowX: 'auto' }}>
            {filteredFolders.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
                <Lock size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
                <div style={{ fontSize: 14 }}>{search ? 'No matches.' : 'No items yet. Click "Add Drive Link" to get started.'}</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ ...thStyleBase, width: '35%' }}>Name / Item</th>
                    <th style={{ ...thStyleBase, width: '15%' }}>Type</th>
                    <th style={{ ...thStyleBase, width: '25%' }}>Details / Notes</th>
                    <th style={{ ...thStyleBase, width: '15%' }}>Size / Date</th>
                    <th style={{ ...thStyleBase, width: '10%', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFolders.map((client: DocNode) => {
                    const clientOpen = expandedClients.has(client.id) || !!search.trim();
                    return (
                      <Fragment key={client.id}>
                        {/* Client row */}
                        <tr onClick={() => toggleClient(client.id)}
                          className="standup-row"
                          style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        >
                          <td colSpan={5} style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--ink)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ 
                                display: 'inline-block',
                                fontSize: 9, 
                                transform: clientOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                                transition: 'transform 0.2s',
                                color: 'var(--muted)',
                                flexShrink: 0
                              }}>▶</span>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{client.name}</span>
                              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 400 }}>· {client.fullName}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', fontWeight: 500 }}>
                                {client.childCount} item{client.childCount !== 1 ? 's' : ''} · {client.stepCount} step{client.stepCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Step rows */}
                        {clientOpen && (client.children || []).map((step: DocNode, stepIdx: number) => {
                          const stepOpen = expandedSteps.has(step.id) || !!search.trim();
                          const isLastStep = stepIdx === (client.children || []).length - 1;
                          return (
                            <Fragment key={step.id}>
                              <tr onClick={() => toggleStep(step.id)}
                                className="standup-row"
                                style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                              >
                                <td colSpan={5} style={{ padding: '8px 18px 8px 40px', fontWeight: 500, color: 'var(--ink-2)', position: 'relative' }}>
                                  {/* Tree connector lines: client → step */}
                                  <div style={{
                                    position: 'absolute', left: 20, top: 0,
                                    bottom: isLastStep && !stepOpen ? '50%' : 0,
                                    width: 1, background: 'var(--border)',
                                  }} />
                                  <div style={{
                                    position: 'absolute', left: 20, top: '50%',
                                    width: 12, height: 1, background: 'var(--border)',
                                  }} />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ 
                                      display: 'inline-block',
                                      fontSize: 9, 
                                      transform: stepOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                                      transition: 'transform 0.2s',
                                      color: 'var(--muted)',
                                      flexShrink: 0
                                    }}>▶</span>
                                    <span>{step.name}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                      {step.childCount} item{step.childCount !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </td>
                              </tr>

                              {/* Task / Doc rows */}
                              {stepOpen && (step.children || []).map((child: DocNode, childIdx: number) => {
                                const isLastChild = childIdx === (step.children || []).length - 1;
                                if (child.type === 'task') {
                                  const taskOpen = expandedSteps.has(child.id) || !!search.trim();
                                  return (
                                    <Fragment key={child.id}>
                                      <tr onClick={() => toggleStep(child.id)}
                                        className="standup-row"
                                        style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                                      >
                                        <td colSpan={5} style={{ padding: '8px 18px 8px 62px', fontWeight: 500, color: 'var(--ink-2)', position: 'relative' }}>
                                          {/* Tree connector lines: step → task */}
                                          <div style={{
                                            position: 'absolute', left: 40, top: 0,
                                            bottom: isLastChild && !taskOpen ? '50%' : 0,
                                            width: 1, background: 'var(--border)',
                                          }} />
                                          <div style={{
                                            position: 'absolute', left: 40, top: '50%',
                                            width: 12, height: 1, background: 'var(--border)',
                                          }} />
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ 
                                              display: 'inline-block',
                                              fontSize: 9, 
                                              transform: taskOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                                              transition: 'transform 0.2s',
                                              color: 'var(--muted)',
                                              flexShrink: 0
                                            }}>▶</span>
                                            <span style={{ fontSize: 12.5 }}>{child.name}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                              {child.childCount} item{child.childCount !== 1 ? 's' : ''}
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                      {taskOpen && (child.children || []).map((doc: DocNode) => (
                                        <DocRow key={doc.id} doc={doc} isAdmin={isAdmin}
                                          onPreview={() => setPreviewDoc(doc)}
                                          onDelete={() => doc.rawId && deleteDoc.mutate(doc.rawId)}
                                          onUpdate={() => setEditingDoc(doc)} />
                                      ))}
                                    </Fragment>
                                  );
                                }
                                // Direct doc under step (no task)
                                return (
                                  <DocRow key={child.id} doc={child} isAdmin={isAdmin}
                                    onPreview={() => setPreviewDoc(child)}
                                    onDelete={() => child.rawId && deleteDoc.mutate(child.rawId)}
                                    onUpdate={() => setEditingDoc(child)} />
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, color: 'var(--olive-dark)' }}>
          💡 Team members add Google Drive links as proof of work. Admins can preview the Drive content directly in this page without leaving.
        </div>
      </div>

      {/* ── Add Drive Link Modal ─────────────────────────────────── */}
      {showAddModal && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, maxHeight: '88vh', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'modalIn 0.2s ease-out' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#4285F4,#34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Link2 size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add Drive Link</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Paste a Google Drive URL as proof of work</div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Form — scrollable */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
              {formErr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
                  <AlertCircle size={14} /> {formErr}
                </div>
              )}

              <label style={labelStyle}>
                Client *
                <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value, stepId: '' }))} style={inputStyle}>
                  <option value="">— Select client —</option>
                  {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                Step *
                <select value={form.stepId} onChange={e => setForm(f => ({ ...f, stepId: e.target.value, taskId: '' }))} style={inputStyle} disabled={!form.clientId}>
                  <option value="">— Select step —</option>
                  {stepOptions.map(s => <option key={s.id} value={s.id}>Step {String(s.stepNumber).padStart(2,'0')} — {s.name}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                {isAdmin ? (<>Task <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional — attach to a specific task)</span></>) : (<>Task *</>)}
                <select value={form.taskId} onChange={e => setForm(f => ({ ...f, taskId: e.target.value }))} style={inputStyle} disabled={!form.stepId}>
                  <option value="">{isAdmin ? '— No specific task —' : '— Select assigned task —'}</option>
                  {taskOptions.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                Google Drive URL *
                <input
                  placeholder="https://drive.google.com/file/d/… or docs.google.com/…"
                  value={form.driveUrl}
                  onChange={e => setForm(f => ({ ...f, driveUrl: e.target.value }))}
                  style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                />
              </label>

              <label style={labelStyle}>
                Title <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                <input placeholder="e.g. Landing page design v2" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Description <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                <textarea placeholder="Paste or type document description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ ...inputStyle, height: 72, resize: 'vertical' }} />
              </label>

              <label style={labelStyle}>
                Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
                <textarea placeholder="Brief notes or remarks on this file…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
              </label>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
              <button onClick={closeModal} style={btnSecondary}>Cancel</button>
              <button onClick={submitLink} disabled={addLink.isPending} style={btnPrimary}>
                {addLink.isPending ? 'Saving…' : 'Save Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive Preview Popup ──────────────────────────────────── */}
      {previewDoc && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setPreviewDoc(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '88vw', maxWidth: 1100, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            {/* Preview header */}
            <div style={{ display: 'flex', alignItems: 'start', gap: 12, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 22, marginTop: 2 }}>{driveIcon(previewDoc.driveUrl)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewDoc.name}</div>
                {previewDoc.notes && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{previewDoc.notes}</div>}
              </div>
              <a href={previewDoc.driveUrl} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--olive)', color: '#fff', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}>
                <ExternalLink size={14} /> Open in Drive
              </a>
              <button onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4, marginLeft: 4 }}><X size={18} /></button>
            </div>

            {/* iFrame */}
            <div style={{ flex: 1, position: 'relative', background: '#f8f8f8' }}>
              {previewDoc.driveUrl ? (
                <iframe
                  src={toEmbedUrl(previewDoc.driveUrl)}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="autoplay"
                  title={previewDoc.name}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 14 }}>
                  No preview available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {editingDoc && isAdmin && (
        <UpdateDocumentModal
          open={!!editingDoc}
          onClose={() => setEditingDoc(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['vault'] })}
          doc={editingDoc}
        />
      )}
    </AppLayout>
  );
}

/* ─── DocRow ─────────────────────────────────────────────────────────────── */
function DocRow({ doc, isAdmin, onPreview, onDelete, onUpdate }: {
  doc: DocNode; isAdmin: boolean;
  onPreview: () => void; onDelete: () => void; onUpdate: () => void;
}) {
  const isDrive = doc.docType === 'drive_link';
  const displayType = isDrive ? (doc.driveUrl?.includes('spreadsheets') ? 'Google Sheet' : doc.driveUrl?.includes('document') ? 'Google Doc' : 'Drive Link') : 'File';
  
  return (
    <tr className="standup-row" style={{ borderBottom: '1px solid var(--surface-2)' }}>
      <td style={{ ...tdStyle, paddingLeft: 76 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>{isDrive ? driveIcon(doc.driveUrl) : '📄'}</span>
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{doc.name}</span>
        </div>
      </td>
      <td style={tdStyle}>
        <span style={{
          display: 'inline-flex',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: 'var(--surface-2)',
          color: 'var(--ink-2)',
          border: '1px solid var(--border)'
        }}>
          {displayType}
        </span>
      </td>
      <td style={tdStyle}>
        <div style={{ maxWidth: 280, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--soft)' }} title={doc.notes || doc.description || ''}>
          {doc.notes || doc.description || '—'}
        </div>
      </td>
      <td style={tdStyle}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {doc.fileSize ? formatSize(doc.fileSize) : '—'}
          {doc.createdAt && ` · ${new Date(doc.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        {(() => {
          const dropdownActions = [];
          if (isDrive) {
            dropdownActions.push({
              label: 'Preview Link',
              icon: <Eye size={13} />,
              onClick: onPreview,
            });
          }
          dropdownActions.push({
            label: 'Open External',
            icon: <ExternalLink size={13} />,
            href: doc.driveUrl || (doc.fileUrl?.startsWith('http') ? doc.fileUrl : `${API_BASE}${doc.fileUrl}`),
            target: '_blank',
          });
          if (isAdmin) {
            dropdownActions.push({
              label: 'Update',
              icon: <Edit2 size={13} />,
              onClick: onUpdate,
            });
            dropdownActions.push({
              label: 'Delete Item',
              icon: <Trash2 size={13} />,
              onClick: onDelete,
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
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const thStyleBase: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 13,
  color: 'var(--ink-2)',
  verticalAlign: 'middle',
};
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24,
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 500, color: 'var(--ink)',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
  background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
};
