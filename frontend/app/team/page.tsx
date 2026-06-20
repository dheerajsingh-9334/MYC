'use client';
import { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { USE_MOCK, MOCK_TEAM } from '@/lib/mockData';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { ChevronRight, Folder, FolderOpen, Shield, UserCheck, Users, Plus, X, CircleAlert, Search } from 'lucide-react';
import DashboardHeader from '@/components/ui/DashboardHeader';

const TEAMS = ['Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 'Account Manager', 'Content Team'];

interface Member {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'team_leader' | 'team_member';
  teamName?: string | null;
  isActive: boolean;
  _count?: { assignedTasks?: number };
}

export default function TeamPage() {
  const qc = useQueryClient();
  // Read the logged-in user on the client only. SSR has no localStorage,
  // so we render a neutral default until mount to avoid hydration mismatch.
  const [user, setUser] = useState<{ role?: string; teamName?: string }>({});
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('user');
      setUser(raw ? JSON.parse(raw) : {});
    } catch {
      setUser({});
    }
    setMounted(true);
  }, []);
  const isAdmin = user?.role === 'admin';

  const { data: liveTeam = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK,
    retry: false,
  });

  const team: Member[] = USE_MOCK ? MOCK_TEAM : liveTeam;
  const active = team.filter((m) => m.isActive !== false);
  const inactive = team.filter((m) => m.isActive === false);

  // Admin sees the full file-based tree. Team leaders see only their team.
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // On mount, admin opens all teams by default; leader opens only theirs.
  useEffect(() => {
    const teams = new Set<string>();
    if (isAdmin) {
      // Expand all teams that have at least one active member
      active.forEach((m) => { if (m.teamName) teams.add(m.teamName); });
    } else if (user?.teamName) {
      teams.add(user.teamName);
    }
    setExpandedTeams(teams);
  }, [isAdmin, user?.teamName]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'team_member', teamName: '', whatsappNumber: '' });
  const [error, setError] = useState('');

  // Build tree: team → members
  const tree = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of active) {
      const key = m.teamName || '(Unassigned)';
      const arr = map.get(key) || [];
      arr.push(m);
      map.set(key, arr);
    }
    // Sort members within each team: leader first, then alphabetical
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const order = (r: string) => (r === 'team_leader' ? 0 : r === 'admin' ? 1 : 2);
        const oa = order(a.role), ob = order(b.role);
        if (oa !== ob) return oa - ob;
        return a.fullName.localeCompare(b.fullName);
      });
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [active]);

  const [search, setSearch] = useState('');
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    return tree.map(([teamName, members]) => {
      const matchedMembers = members.filter((m) =>
        m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );
      if (teamName.toLowerCase().includes(q)) return [teamName, members] as [string, Member[]];
      if (matchedMembers.length > 0) return [teamName, matchedMembers] as [string, Member[]];
      return null;
    }).filter((x): x is [string, Member[]] => x !== null);
  }, [tree, search]);

  const toggle = (name: string) => {
    setExpandedTeams((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };
  const expandAll = () => setExpandedTeams(new Set(tree.map(([n]) => n)));
  const collapseAll = () => setExpandedTeams(new Set());

  const createMut = useMutation({
    mutationFn: () => apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setForm({ fullName: '', email: '', role: 'team_member', teamName: '', whatsappNumber: '' });
      setError('');
    },
    onError: (e: any) => setError(e.message || 'Failed to create member'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/users/${id}/deactivate`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'team_leader' | 'team_member' }) =>
      apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const roleIcon = (role: string) => {
    if (role === 'admin') return <Shield size={11} style={{ color: 'var(--olive)' }} />;
    if (role === 'team_leader') return <UserCheck size={11} style={{ color: '#2860A1' }} />;
    return <Users size={11} style={{ color: 'var(--muted)' }} />;
  };
  const roleLabel = (role: string) => role === 'admin' ? 'Admin' : role === 'team_leader' ? 'Team Lead' : 'Team Member';

  return (
    <AppLayout>
      <Topbar title="Team" subtitle={`${active.length} active member${active.length !== 1 ? 's' : ''}`} />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title={mounted && isAdmin ? 'All Teams' : (mounted && !isAdmin ? (user?.teamName || 'My Team') : 'All Teams')}
          subtitle={isAdmin
            ? `${tree.length} team${tree.length !== 1 ? 's' : ''} · ${active.length} active · ${inactive.length} deactivated`
            : `${active.filter((m) => m.teamName === user?.teamName).length} active members in your team`}
        >
          {isAdmin && (
            <>
              <button onClick={expandAll} style={btnSecondary}>Expand all</button>
              <button onClick={collapseAll} style={btnSecondary}>Collapse all</button>
              <button onClick={() => setShowModal(true)} style={btnPrimary}>
                <Plus size={14} /> Add Member
              </button>
            </>
          )}
        </DashboardHeader>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={13} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams or members…"
            style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>

        {/* File-based tree */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {filteredTree.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>No matching teams or members.</div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {filteredTree.map(([teamName, members]) => {
                const isOpen = expandedTeams.has(teamName) || !!search.trim();
                const leaderCount = members.filter((m) => m.role === 'team_leader').length;
                const totalActiveTasks = members.reduce((s, m) => s + (m._count?.assignedTasks || 0), 0);
                return (
                  <div key={teamName}>
                    {/* Team folder row */}
                    <div onClick={() => toggle(teamName)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      <ChevronRight size={14} style={{ color: 'var(--soft)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', flexShrink: 0 }} />
                      {isOpen ? <FolderOpen size={16} style={{ color: 'var(--olive)', flexShrink: 0 }} /> : <Folder size={16} style={{ color: 'var(--olive)', flexShrink: 0 }} />}
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{teamName}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {leaderCount > 0 && `· ${leaderCount} lead${leaderCount !== 1 ? 's' : ''}`} · {members.length} member{members.length !== 1 ? 's' : ''}
                      </span>
                      {totalActiveTasks > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10 }}>
                          {totalActiveTasks} active task{totalActiveTasks !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Members list inside the folder */}
                    {isOpen && (
                      <div style={{ paddingBottom: 8 }}>
                        {members.map((m) => {
                          const activeTasks = m._count?.assignedTasks || 0;
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 8px 60px', borderTop: '1px solid var(--surface-2)' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, var(--olive), var(--olive-light))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                                {getInitials(m.fullName)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {m.fullName}
                                  {roleIcon(m.role)}
                                  <span style={{ fontSize: 10.5, fontWeight: 500, color: m.role === 'team_leader' ? '#2860A1' : m.role === 'admin' ? 'var(--olive)' : 'var(--muted)' }}>
                                    {roleLabel(m.role)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.email}</div>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 80, textAlign: 'right' }}>
                                <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 17, fontStyle: 'italic', color: activeTasks > 0 ? 'var(--olive)' : 'var(--muted)' }}>{activeTasks}</span>
                                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>active</span>
                              </div>
                              {isAdmin && m.role !== 'admin' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => {
                                    const nextRole = m.role === 'team_leader' ? 'team_member' : 'team_leader';
                                    if (confirm(`${nextRole === 'team_leader' ? 'Promote' : 'Demote'} ${m.fullName} to ${nextRole === 'team_leader' ? 'Team Lead' : 'Team Member'}?`)) {
                                      roleMut.mutate({ id: m.id, role: nextRole });
                                    }
                                  }} style={btnMini}>{m.role === 'team_leader' ? 'Make Member' : 'Make Lead'}</button>
                                  <button onClick={() => { if (confirm(`Deactivate ${m.fullName}?`)) deactivateMut.mutate(m.id); }} style={{ ...btnMini, color: 'var(--red)' }}>
                                    Deactivate
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Inactive section (admin only) */}
              {isAdmin && inactive.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={14} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Deactivated ({inactive.length})</span>
                  </div>
                  {inactive.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px 6px 36px', opacity: 0.55 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10 }}>
                        {getInitials(m.fullName)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{m.fullName} · {m.teamName || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius-sm)', fontSize: 12.5, color: 'var(--olive-dark)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <CircleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>New members are created with a default password of <code>password123</code>. They should change it on first login.</div>
        </div>
      </div>

      {/* ── CREATE MEMBER MODAL ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add Team Member</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>They'll receive access to their assigned tasks immediately.</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Full Name *</label>
                  <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Priya Sharma" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="priya@myc.in" style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Role *</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={inp}>
                    <option value="team_member">Team Member</option>
                    <option value="team_leader">Team Lead</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Team</label>
                  <select value={form.teamName} onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))} style={inp}>
                    <option value="">Select team...</option>
                    {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>WhatsApp Number</label>
                <input value={form.whatsappNumber} onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))} placeholder="+91 98765 43210" style={inp} />
              </div>
              {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>{error}</div>}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
              <button onClick={() => setShowModal(false)} style={{ ...btnSecondary, padding: '8px 14px' }}>Cancel</button>
              <button onClick={() => { setError(''); createMut.mutate(); }} disabled={createMut.isPending || !form.fullName || !form.email}
                style={{ ...btnPrimary, padding: '8px 16px', opacity: createMut.isPending || !form.fullName || !form.email ? 0.6 : 1 }}>
                {createMut.isPending ? 'Adding…' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 'var(--radius-sm)', background: 'var(--olive)', color: '#fff',
  fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  fontSize: 12.5, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)',
};
const btnMini: React.CSSProperties = {
  padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5,
  fontSize: 11, fontWeight: 500, color: '#2860A1', background: 'var(--surface)', cursor: 'pointer',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5,
};
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)',
  background: 'var(--surface)', outline: 'none',
};
