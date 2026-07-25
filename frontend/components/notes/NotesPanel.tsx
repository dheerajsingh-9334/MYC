'use client';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X, MoreVertical, Calendar, Users, Briefcase } from 'lucide-react';
import { apiFetch, getUser } from '@/lib/api';
import WysiwygEditor from './WysiwygEditor';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { ClientCombobox, ClientOption } from '@/components/ui/ClientCombobox';
import { formatDistanceToNow } from 'date-fns';

interface Note {
  id: string;
  title: string;
  content: string;
  isPersonal: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; avatarUrl?: string };
  clientMentions?: { client: { id: string; fullName: string } }[];
  userMentions?: { user: { id: string; fullName: string } }[];
  team?: { id: string; name: string };
}

export default function NotesPanel() {
  const qc = useQueryClient();
  const [user, setUser] = useState<any>(null);
  useEffect(() => { setUser(getUser()); }, []);

  const isAdmin = user?.role === 'admin';
  const isLeader = user?.role === 'team_leader';

  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState('');

  // Form State
  const [form, setForm] = useState({ id: '', title: '', content: '', isPersonal: false, teamId: '', clientMentions: [] as string[], userMentions: [] as string[] });

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ['notes', search],
    queryFn: () => apiFetch(`/api/notes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  const { data: allClients = [] } = useQuery<any[]>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !!user,
  });

  const { data: teamsList = [] } = useQuery<string[]>({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    retry: false,
    enabled: !!user,
  });

  const { data: usersList = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    retry: false,
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiFetch(data.id ? `/api/notes/${data.id}` : '/api/notes', {
      method: data.id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: (savedNote) => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setIsEditing(false);
      setFormError('');
      setSelectedNote(savedNote);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
      setFormError('');
      if (selectedNote?.id === deleteMutation.variables) {
        setSelectedNote(null);
        setIsEditing(false);
      }
    }
  });

  const handleNewNote = () => {
    setForm({ id: '', title: '', content: '', isPersonal: false, teamId: '', clientMentions: [], userMentions: [] });
    setSelectedNote(null);
    setFormError('');
    setIsEditing(true);
  };

  const handleEditNote = (n: Note) => {
    setForm({
      id: n.id,
      title: n.title,
      content: n.content,
      isPersonal: n.isPersonal,
      teamId: n.team?.id || '',
      clientMentions: n.clientMentions?.map(c => c.client.id) || [],
      userMentions: n.userMentions?.map(u => u.user.id) || []
    });
    setFormError('');
    setIsEditing(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Topbar title="Notes" />
      
      <div className="dashboard-mobile-scroll" style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', gap: 20, minHeight: 0, boxSizing: 'border-box' }}>
        
        {/* Left List */}
        <SectionCard style={{ width: 340, display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0 }} padding={0}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={handleNewNote} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px', background: 'var(--olive)', color: '#fff', borderRadius: 'var(--radius-sm)', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              <Plus size={16} /> New Note
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..." style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)', boxSizing: 'border-box' }} />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="custom-scrollbar">
            {isLoading ? (
               <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>Loading...</div>
            ) : notes.length === 0 ? (
               <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No notes found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {notes.map(n => (
                  <div
                    key={n.id}
                    onClick={() => { setSelectedNote(n); setIsEditing(false); }}
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      background: selectedNote?.id === n.id || form.id === n.id ? 'var(--olive-50)' : 'transparent',
                      border: selectedNote?.id === n.id || form.id === n.id ? '1px solid var(--olive-100)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (selectedNote?.id !== n.id && form.id !== n.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { if (selectedNote?.id !== n.id && form.id !== n.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title || 'Untitled Note'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{n.createdBy?.fullName}</span>
                      <span>{formatDistanceToNow(new Date(n.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Right Panel */}
        <SectionCard style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} padding={0}>
          {!isEditing && !selectedNote ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexDirection: 'column', gap: 10 }}>
              <Briefcase size={32} style={{ opacity: 0.5 }} />
              <span style={{ fontSize: 14 }}>Select a note or create a new one</span>
            </div>
          ) : isEditing ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16, overflowY: 'auto' }}>
              <input
                value={form.title}
                onChange={e => { setForm(f => ({ ...f, title: e.target.value })); if(formError) setFormError(''); }}
                placeholder="Note Title..."
                style={{ fontSize: 24, fontWeight: 700, border: 'none', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
              />
              
              {formError && (
                <div style={{ background: '#FDF2F2', border: '1px solid #FDE8E8', borderRadius: 6, padding: '10px 14px', color: '#9B1C1C', fontSize: 13, fontWeight: 500 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10 }}>
                  <input type="checkbox" checked={form.isPersonal} onChange={e => {
                    setForm(f => {
                      const updates = { ...f, isPersonal: e.target.checked };
                      if (e.target.checked) {
                        updates.teamId = '';
                        updates.userMentions = [];
                      }
                      return updates;
                    });
                  }} style={{ width: 15, height: 15, accentColor: 'var(--olive)', cursor: 'pointer' }} />
                  Personal Note
                </label>
                
                {!form.isPersonal && (
                  <>
                    <ClientCombobox
                      value={form.teamId}
                      onChange={id => setForm(f => ({ ...f, teamId: id }))}
                      placeholder="All Teams (Global)"
                      options={teamsList.map((t: string) => ({ id: t, label: t }))}
                    />

                    <ClientCombobox
                      value={form.userMentions[0] || ''}
                      onChange={id => setForm(f => ({ ...f, userMentions: id ? [id] : [] }))}
                      placeholder="Notify Member"
                      options={usersList.filter((u: any) => u.isActive !== false).map((u: any) => ({ id: u.id, label: u.fullName, subLabel: u.role }))}
                    />
                  </>
                )}

                <ClientCombobox
                  value={form.clientMentions[0] || ''}
                  onChange={id => setForm(f => ({ ...f, clientMentions: id ? [id] : [] }))}
                  placeholder="Link to Client"
                  options={allClients.map((c: any) => ({ id: c.id, label: c.brandName || c.fullName, subLabel: c.status }))}
                />
              </div>
              
              <div style={{ flex: 1, minHeight: 300 }}>
                <WysiwygEditor content={form.content} onChange={val => setForm(f => ({ ...f, content: val }))} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => { setIsEditing(false); setFormError(''); if (!form.id) setSelectedNote(null); }} style={{ padding: '8px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
                <button onClick={() => {
                  if (!form.title.trim()) {
                    setFormError('Please enter a note title before saving.');
                    return;
                  }
                  setFormError('');

                  // Extract mentions
                  const uMentions = new Set<string>(form.userMentions);
                  const cMentions = new Set<string>(form.clientMentions);
                  const regex = /data-id="([^"]+)"/g;
                  let match;
                  while ((match = regex.exec(form.content)) !== null) {
                    const val = match[1];
                    if (val.startsWith('user:')) uMentions.add(val.substring(5));
                    if (val.startsWith('client:')) cMentions.add(val.substring(7));
                  }
                  saveMutation.mutate({
                    ...form,
                    userMentions: Array.from(uMentions),
                    clientMentions: Array.from(cMentions)
                  });
                }} disabled={saveMutation.isPending} style={{ padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Note Header */}
              <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', margin: '0 0 12px' }}>{selectedNote?.title}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={14} /> {selectedNote?.createdBy?.fullName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={14} /> {selectedNote ? new Date(selectedNote.updatedAt).toLocaleString() : ''}</div>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(isAdmin || 
                    user?.id === selectedNote?.createdBy?.id || 
                    (selectedNote?.team && user?.teamName === selectedNote?.team.name) ||
                    selectedNote?.userMentions?.some((m: any) => m.user.id === user?.id) ||
                    (!selectedNote?.isPersonal && !selectedNote?.team)
                  ) && (
                    <button onClick={() => handleEditNote(selectedNote!)} style={{ padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--ink-2)' }}>Edit</button>
                  )}
                  {(isAdmin || user?.id === selectedNote?.createdBy?.id) && (
                    <button onClick={() => { if(confirm('Are you sure you want to delete this note?')) deleteMutation.mutate(selectedNote!.id); }} style={{ padding: '6px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: '#b91c1c' }}>Delete</button>
                  )}
                </div>
              </div>
              
              {/* Note Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }} className="custom-scrollbar">
                <div 
                  className="prose tiptap-editor" 
                  dangerouslySetInnerHTML={{ __html: selectedNote?.content || '' }} 
                  onClick={(e: any) => {
                    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox' && selectedNote) {
                      if (e.target.checked) e.target.setAttribute('checked', 'checked');
                      else e.target.removeAttribute('checked');
                      
                      const newHtml = e.currentTarget.innerHTML;
                      setSelectedNote(prev => prev ? { ...prev, content: newHtml } : prev);
                      
                      apiFetch(`/api/notes/${selectedNote.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                          title: selectedNote.title,
                          content: newHtml,
                          teamId: selectedNote.team?.id || '',
                          clientMentions: selectedNote.clientMentions?.map((c: any) => c.client.id) || [],
                          userMentions: selectedNote.userMentions?.map((u: any) => u.user.id) || []
                        })
                      }).catch(err => console.error("Failed to auto-save checkbox:", err));
                    }
                  }}
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <style>{`
        .prose { max-width: 100%; font-size: 14px; line-height: 1.6; color: var(--ink); }
        .prose h1 { font-size: 1.8em; margin-bottom: 0.5em; font-weight: 700; }
        .prose h2 { font-size: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
        .prose p { margin-bottom: 1em; }
        .prose ul, .prose ol { padding-left: 24px; margin-bottom: 1em; }
        .prose blockquote { border-left: 3px solid var(--border); padding-left: 16px; color: var(--muted); margin: 0 0 1em; }
        .prose img { max-width: 100%; border-radius: 8px; }
        .prose pre { background: var(--surface-2); padding: 12px; border-radius: 8px; overflow-x: auto; }
        .prose code { background: var(--surface-2); padding: 2px 4px; border-radius: 4px; font-size: 0.9em; }
        .prose .mention { background: #e0e7ff; color: #4338ca; padding: 2px 4px; border-radius: 4px; font-weight: 500; }
      `}</style>
    </div>
  );
}
