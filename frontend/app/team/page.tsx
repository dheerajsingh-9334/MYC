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
  active?: number;
  overdue?: number;
  completedLast7d?: number;
  avgCompletionTime?: string | null;
  avatarUrl?: string | null;
  _count?: { assignedTasks?: number };
}

export default function TeamPage() {
  const qc = useQueryClient();
  // Read the logged-in user on the client only. SSR has no localStorage,
  // so we render a neutral default until mount to avoid hydration mismatch.
  const [user, setUser] = useState<any>({});
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
  const active = team.filter((m) => m.isActive !== false && m.role !== 'admin');
  const inactive = team.filter((m) => m.isActive === false && m.role !== 'admin');

  // Admin sees the full file-based tree. Team leaders see only their team.
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // On mount, admin opens all teams by default; leader opens only theirs.
  useEffect(() => {
    const teams = new Set<string>();
    if (isAdmin) {
      // Expand all teams that have at least one active member
      active.forEach((m) => { if (m.teamName) teams.add(m.teamName); });
      teams.add('Administrators');
    } else if (user?.teamName) {
      teams.add(user.teamName);
    }
    setExpandedTeams(teams);
  }, [isAdmin, user?.teamName, team.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'team_member', teamName: '', whatsappNumber: '' });
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const activeAdmins = useMemo(() => {
    const list = team.filter((m) => m.role === 'admin' && m.isActive !== false);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((m) =>
      m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [team, search]);

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
  const expandAll = () => setExpandedTeams(new Set([...tree.map(([n]) => n), 'Administrators']));
  const collapseAll = () => setExpandedTeams(new Set());

  const createMut = useMutation({
    mutationFn: () => apiFetch('/api/teams/invite', {
      method: 'POST',
      body: JSON.stringify({ email: form.email, role: form.role, teamName: form.role === 'admin' ? '' : form.teamName })
    }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setInviteLink(data.link);
      setError('');
    },
    onError: (e: any) => setError(e.message || 'Failed to generate invitation link'),
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

  const handleCreateNewTeam = async () => {
    const name = prompt('Enter new team name:');
    if (!name?.trim()) return;
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      alert('Team created successfully!');
    } catch (e: any) {
      alert(e.message || 'Failed to create team');
    }
  };

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
      <div style={{ padding: '16px 20px', flex: 1 }}>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={expandAll} style={btnSecondary}>Expand all</button>
            <button onClick={collapseAll} style={btnSecondary}>Collapse all</button>
            <button onClick={handleCreateNewTeam} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> New Team
            </button>
            <button onClick={() => setShowModal(true)} style={btnPrimary}>
              <Plus size={14} /> Add Member
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={13} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams or members…"
            style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>

        {/* File-based tree */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {(filteredTree.length === 0 && activeAdmins.length === 0) ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>No matching teams or members.</div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {/* Admins category */}
              {activeAdmins.length > 0 && (
                <div>
                  <div onClick={() => toggle('Administrators')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', userSelect: 'none', borderBottom: (expandedTeams.has('Administrators') || !!search.trim()) ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <ChevronRight size={14} style={{ color: 'var(--soft)', transform: (expandedTeams.has('Administrators') || !!search.trim()) ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', flexShrink: 0 }} />
                    {(expandedTeams.has('Administrators') || !!search.trim()) ? <FolderOpen size={16} style={{ color: 'var(--olive)', flexShrink: 0 }} /> : <Folder size={16} style={{ color: 'var(--olive)', flexShrink: 0 }} />}
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Administrators</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      · {activeAdmins.length} admin{activeAdmins.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Members list inside the folder */}
                  {(expandedTeams.has('Administrators') || !!search.trim()) && (
                    <div style={{ paddingBottom: 8 }}>
                      {activeAdmins.map((m) => {
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px 10px 60px', borderTop: '1px solid var(--surface-2)' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                            
                            {/* Avatar */}
                            <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                              {m.avatarUrl ? (
                                <img
                                  src={m.avatarUrl}
                                  alt={m.fullName}
                                  style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    objectFit: 'cover', boxShadow: 'var(--shadow-sm)',
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const sibling = e.currentTarget.nextSibling as HTMLElement;
                                    if (sibling) sibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                                color: '#fff', display: m.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 600, fontSize: 12, boxShadow: 'var(--shadow-sm)',
                              }}>
                                {getInitials(m.fullName)}
                              </div>
                            </div>
                            
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span>{m.fullName}</span>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  background: 'var(--olive-50)',
                                  color: 'var(--olive)',
                                }}>
                                  {roleIcon(m.role)}
                                  {roleLabel(m.role)}
                                </span>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{m.email}</div>
                            </div>

                            {/* Actions for deactivating admins if not self */}
                            {isAdmin && m.id !== user?.id && (
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button onClick={() => { if (confirm(`Deactivate ${m.fullName}?`)) deactivateMut.mutate(m.id); }} style={{ ...btnMini, color: 'var(--red)', borderColor: 'rgba(220,38,38,0.2)' }}>
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
              )}

              {filteredTree.map(([teamName, members]) => {
                const isOpen = expandedTeams.has(teamName) || !!search.trim();
                const leaderCount = members.filter((m) => m.role === 'team_leader').length;
                const totalActiveTasks = members.reduce((s, m) => s + ((m.active ?? m._count?.assignedTasks) || 0), 0);
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
                          const activeTasks = (m.active ?? m._count?.assignedTasks) || 0;
                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px 10px 60px', borderTop: '1px solid var(--surface-2)' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                              
                              {/* Avatar */}
                              <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                                {m.avatarUrl ? (
                                  <img
                                    src={m.avatarUrl}
                                    alt={m.fullName}
                                    style={{
                                      width: 32, height: 32, borderRadius: '50%',
                                      objectFit: 'cover', boxShadow: 'var(--shadow-sm)',
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const sibling = e.currentTarget.nextSibling as HTMLElement;
                                      if (sibling) sibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div style={{
                                  width: 32, height: 32, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                                  color: '#fff', display: m.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 600, fontSize: 12, boxShadow: 'var(--shadow-sm)',
                                }}>
                                  {getInitials(m.fullName)}
                                </div>
                              </div>
                              
                              {/* Info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span>{m.fullName}</span>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    background: m.role === 'admin' ? 'var(--olive-50)' : m.role === 'team_leader' ? '#EBF3FB' : 'var(--surface-2)',
                                    color: m.role === 'admin' ? 'var(--olive)' : m.role === 'team_leader' ? '#2860A1' : 'var(--muted)',
                                  }}>
                                    {roleIcon(m.role)}
                                    {roleLabel(m.role)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{m.email}</div>
                              </div>
                              
                              {/* Tasks Badge or Performance Stats */}
                              <div style={{ display: 'flex', gap: 12, marginRight: 12, flexShrink: 0 }}>
                                <span style={{ textAlign: 'center', minWidth: 40 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.active ?? 0}</div>
                                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active</div>
                                </span>
                                <span style={{ textAlign: 'center', minWidth: 40 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: (m.overdue ?? 0) > 0 ? 'var(--red)' : 'var(--muted)' }}>{m.overdue ?? 0}</div>
                                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Late</div>
                                </span>
                                <span style={{ textAlign: 'center', minWidth: 40 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{m.completedLast7d ?? 0}</div>
                                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Done</div>
                                </span>
                                <span style={{ textAlign: 'center', minWidth: 50 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--olive-dark)' }}>{m.avgCompletionTime ?? '—'}</div>
                                  <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Avg. Time</div>
                                </span>
                              </div>

                              {/* Actions */}
                              {isAdmin && m.role !== 'admin' && (
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                  <button onClick={() => {
                                    const nextRole = m.role === 'team_leader' ? 'team_member' : 'team_leader';
                                    if (confirm(`${nextRole === 'team_leader' ? 'Promote' : 'Demote'} ${m.fullName} to ${nextRole === 'team_leader' ? 'Team Lead' : 'Team Member'}?`)) {
                                      roleMut.mutate({ id: m.id, role: nextRole });
                                    }
                                  }} style={btnMini}>{m.role === 'team_leader' ? 'Make Member' : 'Make Lead'}</button>
                                  <button onClick={() => { if (confirm(`Deactivate ${m.fullName}?`)) deactivateMut.mutate(m.id); }} style={{ ...btnMini, color: 'var(--red)', borderColor: 'rgba(220,38,38,0.2)' }}>
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
          <div>Admins generate a secure magic-link invitation. Invited team members use it to verify, set their password, and enter their WhatsApp number to join.</div>
        </div>
      </div>

      {/* ── CREATE MEMBER MODAL ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setInviteLink(null); setError(''); } }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Invite Team Member</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  {inviteLink ? 'Share this magic link with the member.' : 'Generate a secure signup link for a new member.'}
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setInviteLink(null); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>

            {inviteLink ? (
              <>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ background: '#EBF7EE', border: '1px solid #D1F0D8', color: '#2E7D32', padding: '12px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserCheck size={16} />
                    <span>Invitation link generated successfully!</span>
                  </div>
                  <label style={lbl}>Shareable Magic-Link</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <input readOnly value={inviteLink} style={{ ...inp, flex: 1, background: 'var(--surface-2)' }} onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <button onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      alert('Invitation link copied to clipboard!');
                    }} style={btnPrimary}>Copy</button>
                  </div>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
                  <button onClick={() => { setShowModal(false); setInviteLink(null); setForm({ fullName: '', email: '', role: 'team_member', teamName: '', whatsappNumber: '' }); setError(''); }} style={btnPrimary}>Done</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Email Address *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="member@myc.in" style={inp} />
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
                      <select
                        value={form.role === 'admin' ? '' : form.teamName}
                        onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))}
                        disabled={form.role === 'admin'}
                        style={{
                          ...inp,
                          opacity: form.role === 'admin' ? 0.6 : 0.9,
                          cursor: form.role === 'admin' ? 'not-allowed' : 'default',
                        }}
                      >
                        <option value="">Select team...</option>
                        {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>{error}</div>}
                </div>

                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
                  <button onClick={() => { setShowModal(false); setError(''); }} style={{ ...btnSecondary, padding: '8px 14px' }}>Cancel</button>
                  <button onClick={() => { setError(''); createMut.mutate(); }} disabled={createMut.isPending || !form.email}
                    style={{ ...btnPrimary, padding: '8px 16px', opacity: createMut.isPending || !form.email ? 0.6 : 1 }}>
                    {createMut.isPending ? 'Generating…' : 'Generate Link'}
                  </button>
                </div>
              </>
            )}
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
  padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', cursor: 'pointer',
  transition: 'all 0.15s ease',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5,
};
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)',
  background: 'var(--surface)', outline: 'none',
};
