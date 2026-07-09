'use client';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, Folder, FolderOpen, FileText, Search, Lock,
  Link2, X, ExternalLink, Eye, Trash2, Plus, AlertCircle,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch, getUser } from '@/lib/api';

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

  const [search, setSearch] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Drive preview popup
  const [previewDoc, setPreviewDoc] = useState<DocNode | null>(null);

  // Add Drive Link modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ clientId: '', stepId: '', taskId: '', title: '', driveUrl: '', notes: '', description: '' });
  const [formErr, setFormErr] = useState('');

  /* ── Data ── */
  const { data: vault = { folders: [], totalDocs: 0 } } = useQuery({
    queryKey: ['vault'],
    queryFn: () => apiFetch('/api/vault'),
  });

  // Fetch all tasks for dropdown derivation if staff
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
    const map = new Map<string, string>();
    allUserTasks
      .filter(t => (t.assignedToId || t.assignedTo?.id) === user?.id)
      .forEach(t => {
        if (t.client) {
          map.set(t.client.id, t.client.brandName || t.client.fullName);
        }
      });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [clients, allUserTasks, isAdmin, user?.id]);

  // Derive steps based on role and selected client
  const stepOptions = useMemo(() => {
    if (isAdmin) {
      return steps;
    }
    const map = new Map<string, { name: string; stepNumber: number }>();
    allUserTasks
      .filter(t => (t.assignedToId || t.assignedTo?.id) === user?.id && t.clientId === form.clientId)
      .forEach(t => {
        if (t.step) {
          map.set(t.step.id, { name: t.step.name, stepNumber: t.step.stepNumber });
        }
      });
    return Array.from(map.entries()).map(([id, s]) => ({ id, name: s.name, stepNumber: s.stepNumber }));
  }, [steps, allUserTasks, form.clientId, isAdmin, user?.id]);

  // Derive tasks based on role, selected client, and step
  const taskOptions = useMemo(() => {
    if (isAdmin) {
      return tasks;
    }
    return allUserTasks
      .filter(t => (t.assignedToId || t.assignedTo?.id) === user?.id && t.clientId === form.clientId && t.stepId === form.stepId)
      .map(t => ({ id: t.id, title: t.title }));
  }, [tasks, allUserTasks, form.clientId, form.stepId, isAdmin, user?.id]);

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
    if (!isAdmin && !form.taskId) {
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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setExpandedClients(new Set(filteredFolders.map(f => f.id))); setExpandedSteps(new Set(filteredFolders.flatMap(f => (f.children || []).map(s => s.id)))); }} style={btnSecondary}>Expand all</button>
            <button onClick={() => { setExpandedClients(new Set()); setExpandedSteps(new Set()); }} style={btnSecondary}>Collapse all</button>
            <button onClick={() => setShowAddModal(true)} style={btnPrimary}>
              <Plus size={13} /> Add Drive Link
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients, steps, or files…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
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
            <div style={{ padding: '8px 0' }}>
              {filteredFolders.map((client: DocNode) => {
                const clientOpen = expandedClients.has(client.id) || !!search.trim();
                return (
                  <div key={client.id}>
                    {/* Client row */}
                    <div onClick={() => toggleClient(client.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <ChevronRight size={14} style={{ color: 'var(--soft)', transform: clientOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      {clientOpen ? <FolderOpen size={16} style={{ color: 'var(--olive)' }} /> : <Folder size={16} style={{ color: 'var(--olive)' }} />}
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{client.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 4 }}>· {client.fullName}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>
                        {client.childCount} item{client.childCount !== 1 ? 's' : ''} · {client.stepCount} step{client.stepCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Step rows */}
                    {clientOpen && (client.children || []).map((step: DocNode) => {
                      const stepOpen = expandedSteps.has(step.id) || !!search.trim();
                      return (
                        <div key={step.id}>
                          <div onClick={() => toggleStep(step.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 6px 44px', cursor: 'pointer', userSelect: 'none' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <ChevronRight size={12} style={{ color: 'var(--soft)', transform: stepOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                            <Folder size={13} style={{ color: 'var(--olive-light)' }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>{step.name}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>{step.childCount}</span>
                          </div>

                          {/* Task / Doc rows */}
                          {stepOpen && (step.children || []).map((child: DocNode) => {
                            if (child.type === 'task') {
                              // Task group: expandable with doc children
                              const taskOpen = expandedSteps.has(child.id) || !!search.trim();
                              return (
                                <div key={child.id}>
                                  <div onClick={() => toggleStep(child.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 6px 68px', cursor: 'pointer', userSelect: 'none' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                    <ChevronRight size={11} style={{ color: 'var(--soft)', transform: taskOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                                    <FileText size={12} style={{ color: 'var(--olive-light)' }} />
                                    <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)' }}>{child.name}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>{child.childCount}</span>
                                  </div>
                                  {taskOpen && (child.children || []).map((doc: DocNode) => (
                                    <DocRow key={doc.id} doc={doc} isAdmin={isAdmin}
                                      onPreview={() => setPreviewDoc(doc)}
                                      onDelete={() => doc.rawId && deleteDoc.mutate(doc.rawId)} />
                                  ))}
                                </div>
                              );
                            }
                            // Direct doc under step (no task)
                            return (
                              <DocRow key={child.id} doc={child} isAdmin={isAdmin}
                                onPreview={() => setPreviewDoc(child)}
                                onDelete={() => child.rawId && deleteDoc.mutate(child.rawId)} />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', width: 480, maxWidth: '94vw', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#4285F4,#34A853)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link2 size={16} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>Add Drive Link</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Paste a Google Drive URL as proof of work</div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Form */}
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                {isAdmin ? (
                  <>
                    Task <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional — attach to a specific task)</span>
                  </>
                ) : (
                  <>Task *</>
                )}
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

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={closeModal} style={btnSecondary}>Cancel</button>
                <button onClick={submitLink} disabled={addLink.isPending} style={btnPrimary}>
                  {addLink.isPending ? 'Saving…' : 'Save Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive Preview Popup ──────────────────────────────────── */}
      {previewDoc && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setPreviewDoc(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', width: '88vw', maxWidth: 1100, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
            {/* Preview header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 22 }}>{driveIcon(previewDoc.driveUrl)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewDoc.name}</div>
                {previewDoc.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>{previewDoc.notes}</div>}
              </div>
              <a href={previewDoc.driveUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#4285F4', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', flexShrink: 0 }}>
                <ExternalLink size={13} /> Open in Drive
              </a>
              <button onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 6, marginLeft: 4 }}><X size={20} /></button>
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
    </AppLayout>
  );
}

/* ─── DocRow ─────────────────────────────────────────────────────────────── */
function DocRow({ doc, isAdmin, onPreview, onDelete }: {
  doc: DocNode; isAdmin: boolean;
  onPreview: () => void; onDelete: () => void;
}) {
  const isDrive = doc.docType === 'drive_link';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 6px 72px', borderTop: '1px solid transparent' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>

      {/* icon */}
      <span style={{ fontSize: 15 }}>{isDrive ? driveIcon(doc.driveUrl) : '📄'}</span>

      {/* name + badge */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
          {isDrive && (
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, background: '#e8f0fe', color: '#1a73e8', padding: '1px 6px', borderRadius: 4, letterSpacing: 0.3 }}>DRIVE</span>
          )}
        </div>
        {(doc.description || doc.notes) && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {doc.description && <div><span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Description:</span> {doc.description}</div>}
            {doc.notes && <div><span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Notes:</span> {doc.notes}</div>}
          </div>
        )}
      </div>

      {/* meta */}
      {!isDrive && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>{formatSize(doc.fileSize)}</span>}
      {doc.createdAt && (
        <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 60, textAlign: 'right' }}>
          {new Date(doc.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </span>
      )}

      {/* actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isDrive && (
          <button onClick={onPreview} title="Preview in popup"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: '#1a73e8', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500 }}>
            <Eye size={11} /> Preview
          </button>
        )}
        {isDrive && (
          <a href={doc.driveUrl} target="_blank" rel="noreferrer" title="Open in Drive"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, textDecoration: 'none' }}>
            <ExternalLink size={11} />
          </a>
        )}
        {!isDrive && doc.fileUrl && (
          <a href={doc.fileUrl} target="_blank" rel="noreferrer"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', fontSize: 11, textDecoration: 'none' }}>
            <FileText size={11} />
          </a>
        )}
        {isAdmin && (
          <button onClick={onDelete} title="Delete"
            style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
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
