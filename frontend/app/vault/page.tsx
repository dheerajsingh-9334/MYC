'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Folder, FolderOpen, FileText, Search, Lock, Upload } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK } from '@/lib/mockData';

interface DocNode {
  id: string;
  rawId?: string;
  name: string;
  fullName?: string;
  type: 'client' | 'step' | 'doc';
  childCount?: number;
  stepCount?: number;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
  createdAt?: string;
  children?: DocNode[];
}

const MOCK_VAULT = {
  folders: [
    {
      id: 'client_c1', name: 'Nimbus Coffee', fullName: 'Aarav Mehta', type: 'client', childCount: 3, stepCount: 2,
      children: [
        { id: 's1_c1', name: 'Step 01 — Onboarding Intake', type: 'step', childCount: 2, children: [
          { id: 'doc_1', rawId: 'd1', name: 'welcome_packet.pdf', type: 'doc', fileUrl: '/uploads/mock.pdf', mimeType: 'application/pdf', fileSize: 234567, createdAt: new Date().toISOString() },
          { id: 'doc_2', rawId: 'd2', name: 'brand_questionnaire.xlsx', type: 'doc', fileUrl: '/uploads/mock.xlsx', mimeType: 'application/vnd.ms-excel', fileSize: 34567, createdAt: new Date().toISOString() },
        ]},
        { id: 's2_c1', name: 'Step 02 — Brand & Content Setup', type: 'step', childCount: 1, children: [
          { id: 'doc_3', rawId: 'd3', name: 'content_pillars_v1.docx', type: 'doc', fileUrl: '/uploads/mock.docx', mimeType: 'application/msword', fileSize: 12345, createdAt: new Date().toISOString() },
        ]},
      ],
    },
    {
      id: 'client_c2', name: 'Glow Skin Co.', fullName: 'Priya Sharma', type: 'client', childCount: 0, stepCount: 0, children: [],
    },
  ],
  totalDocs: 3,
};

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileEmoji(mime?: string): string {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('word') || mime.includes('document')) return '📘';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  if (mime.includes('video')) return '🎬';
  return '📄';
}

export default function VaultPage() {
  const qc = useQueryClient();
  const user = getUser();
  const [search, setSearch] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const isAdmin = user?.role === 'admin';

  const { data: liveVault } = useQuery({
    queryKey: ['vault'],
    queryFn: () => apiFetch('/api/vault'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const vault = USE_MOCK ? MOCK_VAULT : (liveVault || { folders: [], totalDocs: 0 });

  const filteredFolders = useMemo(() => {
    if (!search.trim()) return vault.folders;
    const q = search.toLowerCase();
    return (vault.folders as DocNode[]).filter((c) => {
      if (c.name.toLowerCase().includes(q) || c.fullName?.toLowerCase().includes(q)) return true;
      if (c.children) {
        for (const s of c.children) {
          if (s.name.toLowerCase().includes(q)) return true;
          if (s.children) for (const d of s.children) {
            if (d.name.toLowerCase().includes(q)) return true;
          }
        }
      }
      return false;
    });
  }, [vault.folders, search]);

  const toggleClient = (id: string) => {
    setExpandedClients((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleStep = (id: string) => {
    setExpandedSteps((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const expandAll = () => {
    setExpandedClients(new Set(filteredFolders.map((f: DocNode) => f.id)));
    setExpandedSteps(new Set(filteredFolders.flatMap((f: DocNode) => (f.children || []).map((s: DocNode) => s.id))));
  };
  const collapseAll = () => {
    setExpandedClients(new Set());
    setExpandedSteps(new Set());
  };

  return (
    <AppLayout>
      <Topbar title="Vault" subtitle={`${vault.totalDocs} document${vault.totalDocs !== 1 ? 's' : ''} across all clients`} />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        {/* Page title + controls */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 32, color: 'var(--ink)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>Vault</h1>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>File-based document store, organised by client → step</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={expandAll} style={btnSecondary}>Expand all</button>
            <button onClick={collapseAll} style={btnSecondary}>Collapse all</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients, steps, or files…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>

        {/* Tree */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {filteredFolders.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
              <Lock size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div style={{ fontSize: 14 }}>{search ? 'No matches.' : 'No documents yet.'}</div>
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
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <ChevronRight size={14} style={{ color: 'var(--soft)', transform: clientOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} />
                      {clientOpen ? <FolderOpen size={16} style={{ color: 'var(--olive)' }} /> : <Folder size={16} style={{ color: 'var(--olive)' }} />}
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{client.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 6 }}>· {client.fullName}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>
                        {client.childCount} file{client.childCount !== 1 ? 's' : ''} · {client.stepCount} step{client.stepCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Step rows */}
                    {clientOpen && (client.children || []).map((step: DocNode) => {
                      const stepOpen = expandedSteps.has(step.id) || !!search.trim();
                      return (
                        <div key={step.id}>
                          <div onClick={() => toggleStep(step.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 6px 44px', cursor: 'pointer', userSelect: 'none' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                            <ChevronRight size={12} style={{ color: 'var(--soft)', transform: stepOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }} />
                            <Folder size={13} style={{ color: 'var(--olive-light)' }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>{step.name}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>{step.childCount}</span>
                          </div>

                          {/* Doc rows */}
                          {stepOpen && (step.children || []).map((doc: DocNode) => (
                            <div key={doc.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 16px 5px 72px', borderTop: '1px solid transparent' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                              <span style={{ fontSize: 14 }}>{fileEmoji(doc.mimeType)}</span>
                              <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--ink)', textDecoration: 'none', flex: 1 }}>
                                {doc.name}
                              </a>
                              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace' }}>{formatSize(doc.fileSize)}</span>
                              {doc.createdAt && (
                                <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70, textAlign: 'right' }}>
                                  {new Date(doc.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, color: 'var(--olive-dark)' }}>
          ℹ️ Documents uploaded from a client’s step page appear here automatically. Admin can delete from the original client view.
        </div>
      </div>
    </AppLayout>
  );
}

const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
};
