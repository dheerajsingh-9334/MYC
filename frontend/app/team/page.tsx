'use client';
import React, { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { USE_MOCK, MOCK_TEAM } from '@/lib/mockData';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Folder, FolderOpen, Shield, UserCheck, Users, Plus, X, CircleAlert, Search } from 'lucide-react';
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
  const router = useRouter();
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
  const isTeamLeader = user?.role === 'team_leader';
  const canAccess = isAdmin || isTeamLeader;

  useEffect(() => {
    if (mounted && user && user.role && !canAccess) {
      router.push('/dashboard');
    }
  }, [mounted, user, router, canAccess]);

  if (mounted && user?.role && !canAccess) {
    return (
      <AppLayout>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Redirecting...</div>
      </AppLayout>
    );
  }

  const { data: liveTeam = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
    enabled: !USE_MOCK,
    retry: false,
  });

  const team: Member[] = USE_MOCK ? MOCK_TEAM : liveTeam;
  const active = useMemo(() => {
    const list = team.filter((m) => m.isActive !== false && m.role !== 'admin');
    if (user?.role === 'team_leader' && user.teamName) {
      return list.filter((m) => m.teamName === user.teamName);
    }
    return list;
  }, [team, user]);

  const inactive = useMemo(() => {
    const list = team.filter((m) => m.isActive === false && m.role !== 'admin');
    if (user?.role === 'team_leader' && user.teamName) {
      return list.filter((m) => m.teamName === user.teamName);
    }
    return list;
  }, [team, user]);

  // Admin sees the full file-based tree. Team leaders see only their team.
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // On mount, teams are collapsed by default.
  useEffect(() => {
    setExpandedTeams(new Set());
  }, []);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'team_member', teamName: '', whatsappNumber: '' });
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const [changeTeamTarget, setChangeTeamTarget] = useState<Member | null>(null);
  const [newTargetTeam, setNewTargetTeam] = useState('');

  const allTeamNames = useMemo(() => Array.from(new Set([...TEAMS, ...team.map(t => t.teamName).filter(Boolean)])).sort(), [team]);

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const teamQuery = params.get('team');
      if (teamQuery) {
        setSearch(teamQuery);
        setExpandedTeams((prev) => {
          const n = new Set(prev);
          n.add(teamQuery);
          return n;
        });
      }
    }
  }, [mounted]);

  const activeAdmins = useMemo(() => {
    if (user?.role === 'team_leader') return [];
    const list = team.filter((m) => m.role === 'admin' && m.isActive !== false);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((m) =>
      m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [team, search, user]);

  // Build tree: team → members
  const tree = useMemo(() => {
    const map = new Map<string, Member[]>();
    for (const m of active) {
      const teams = m.teamName ? m.teamName.split(',').map(t => t.trim()).filter(Boolean) : ['(Unassigned)'];
      for (const key of teams) {
        const arr = map.get(key) || [];
        arr.push(m);
        map.set(key, arr);
      }
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

  const activateMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/users/${id}/activate`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'team_leader' | 'team_member' }) =>
      apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const teamMut = useMutation({
    mutationFn: ({ id, teamName }: { id: string; teamName: string }) =>
      apiFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ teamName }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const handleCreateNewTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: newTeamName.trim() })
      });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      alert('Team created successfully!');
      setShowCreateTeam(false);
      setNewTeamName('');
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

  const thStyleBase: React.CSSProperties = {
    padding: '10px 18px',
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface-2)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  };
  const colStyles = {
    member: { width: '22%', minWidth: '160px' } as React.CSSProperties,
    email: { width: '24%', minWidth: '200px' } as React.CSSProperties,
    role: { width: '12%', minWidth: '110px' } as React.CSSProperties,
    active: { width: '8%', minWidth: '60px', textAlign: 'center' } as React.CSSProperties,
    late: { width: '8%', minWidth: '60px', textAlign: 'center' } as React.CSSProperties,
    done: { width: '8%', minWidth: '60px', textAlign: 'center' } as React.CSSProperties,
    avgTime: { width: '10%', minWidth: '85px', textAlign: 'center' } as React.CSSProperties,
    actions: { width: '8%', minWidth: '240px', textAlign: 'center' } as React.CSSProperties,
  };

  return (
    <AppLayout>
      <Topbar 
        title="Team" 
        subtitle={`${active.length} active member${active.length !== 1 ? 's' : ''}`} 
        search={search}
        setSearch={setSearch}
      />
      <div style={{ padding: 'var(--page-pad)', flex: 1 }}>

        {/* Actions bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={expandAll} style={btnSecondary}>Expand all</button>
            <button onClick={collapseAll} style={btnSecondary}>Collapse all</button>
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setShowCreateTeam(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <Plus size={13} /> New Team
              </button>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--olive)', color: '#fff', border: 'none',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
              >
                <Plus size={13} /> Add Member
              </button>
            </div>
          )}
        </div>

        {/* File-based tree */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {(filteredTree.length === 0 && activeAdmins.length === 0) ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>No matching teams or members.</div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...thStyleBase, ...colStyles.member }}>Member</th>
                    <th style={{ ...thStyleBase, ...colStyles.email }}>Email</th>
                    <th style={{ ...thStyleBase, ...colStyles.role }}>Role</th>
                    <th style={{ ...thStyleBase, ...colStyles.active }}>Active</th>
                    <th style={{ ...thStyleBase, ...colStyles.late }}>Late</th>
                    <th style={{ ...thStyleBase, ...colStyles.done }}>Done</th>
                    <th style={{ ...thStyleBase, ...colStyles.avgTime }}>Avg. Time</th>
                    {isAdmin && <th style={{ ...thStyleBase, ...colStyles.actions }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {/* Admins category */}
                  {activeAdmins.length > 0 && (
                    <>
                      <tr onClick={() => toggle('Administrators')}
                        style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', userSelect: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}>
                        <td colSpan={isAdmin ? 8 : 7} style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ 
                              display: 'inline-block',
                              fontSize: 9, 
                              transform: (expandedTeams.has('Administrators') || !!search.trim()) ? 'rotate(90deg)' : 'rotate(0deg)', 
                              transition: 'transform 0.2s',
                              color: 'var(--muted)',
                              flexShrink: 0
                            }}>▶</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Administrators</span>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              · {activeAdmins.length} admin{activeAdmins.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {(expandedTeams.has('Administrators') || !!search.trim()) && activeAdmins.map((m) => (
                        <tr key={m.id} className="standup-row" style={{ borderBottom: '1px solid var(--surface-2)' }}>
                          <td style={{ padding: '10px 18px 10px 40px', verticalAlign: 'middle', ...colStyles.member }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                                {m.avatarUrl ? (
                                  <img
                                    src={m.avatarUrl}
                                    alt={m.fullName}
                                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const sibling = e.currentTarget.nextSibling as HTMLElement;
                                      if (sibling) sibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                                  color: '#fff', display: m.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 600, fontSize: 11
                                }}>
                                  {getInitials(m.fullName)}
                                </div>
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.fullName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)', ...colStyles.email }}>
                            {m.email}
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', ...colStyles.role }}>
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
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--ink)', ...colStyles.active }}>
                            {m.active ?? 0}
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: (m.overdue ?? 0) > 0 ? 'var(--red)' : 'var(--muted)', ...colStyles.late }}>
                            {m.overdue ?? 0}
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--green)', ...colStyles.done }}>
                            {m.completedLast7d ?? 0}
                          </td>
                          <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--olive-dark)', ...colStyles.avgTime }}>
                            {m.avgCompletionTime ?? '—'}
                          </td>
                          {isAdmin && (
                            <td style={{ padding: '10px 18px', verticalAlign: 'middle', ...colStyles.actions }}>
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                {m.id !== user?.id && (
                                  <button onClick={() => { if (confirm(`Deactivate ${m.fullName}?`)) deactivateMut.mutate(m.id); }} style={{ ...btnMini, color: 'var(--red)', borderColor: 'rgba(220,38,38,0.2)' }}>
                                    Deactivate
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </>
                  )}

                  {/* Teams and members */}
                  {filteredTree.map(([teamName, members]) => {
                    const isOpen = expandedTeams.has(teamName) || !!search.trim();
                    const leaderCount = members.filter((m) => m.role === 'team_leader').length;
                    const totalActiveTasks = members.reduce((s, m) => s + ((m.active ?? m._count?.assignedTasks) || 0), 0);
                    return (
                      <React.Fragment key={teamName}>
                        <tr onClick={() => toggle(teamName)}
                          style={{ background: 'var(--surface-2)', cursor: 'pointer', borderBottom: '1px solid var(--border)', userSelect: 'none' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-50)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}>
                          <td colSpan={isAdmin ? 8 : 7} style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ 
                                display: 'inline-block',
                                fontSize: 9, 
                                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', 
                                transition: 'transform 0.2s',
                                color: 'var(--muted)',
                                flexShrink: 0
                              }}>▶</span>
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
                          </td>
                        </tr>
                        {isOpen && members.map((m) => {
                          const activeTasks = (m.active ?? m._count?.assignedTasks) || 0;
                          return (
                            <tr key={m.id} className="standup-row" style={{ borderBottom: '1px solid var(--surface-2)' }}>
                              <td style={{ padding: '10px 18px 10px 40px', verticalAlign: 'middle', ...colStyles.member }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                                    {m.avatarUrl ? (
                                      <img
                                        src={m.avatarUrl}
                                        alt={m.fullName}
                                        style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          const sibling = e.currentTarget.nextSibling as HTMLElement;
                                          if (sibling) sibling.style.display = 'flex';
                                        }}
                                      />
                                    ) : null}
                                    <div style={{
                                      width: 28, height: 28, borderRadius: '50%',
                                      background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                                      color: '#fff', display: m.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontWeight: 600, fontSize: 11
                                    }}>
                                      {getInitials(m.fullName)}
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.fullName}</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 12.5, color: 'var(--ink-2)', ...colStyles.email }}>
                                {m.email}
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', ...colStyles.role }}>
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
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--ink)', ...colStyles.active }}>
                                {activeTasks}
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: (m.overdue ?? 0) > 0 ? 'var(--red)' : 'var(--muted)', ...colStyles.late }}>
                                {m.overdue ?? 0}
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--green)', ...colStyles.done }}>
                                {m.completedLast7d ?? 0}
                              </td>
                              <td style={{ padding: '10px 18px', verticalAlign: 'middle', fontSize: 13, fontWeight: 700, color: 'var(--olive-dark)', ...colStyles.avgTime }}>
                                {m.avgCompletionTime ?? '—'}
                              </td>
                              {isAdmin && (
                                <td style={{ padding: '10px 18px', verticalAlign: 'middle', ...colStyles.actions }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                    <button onClick={() => {
                                      setChangeTeamTarget(m);
                                      setNewTargetTeam(m.teamName || '');
                                    }} style={btnMini}>Change Team</button>
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
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

              {/* Inactive section (admin only) */}
              {isAdmin && inactive.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={14} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Deactivated ({inactive.length})</span>
                  </div>
                  <div style={{
                    paddingLeft: 24,
                    borderLeft: '1px dashed var(--border)',
                    marginLeft: 26,
                    marginTop: 4,
                    marginBottom: 12
                  }}>
                    {inactive.map((m) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface-2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, opacity: 0.55 }}>
                          {getInitials(m.fullName)}
                        </div>
                        <div style={{ flex: 1, opacity: 0.55 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{m.fullName} · {m.teamName || '—'}</div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              if (confirm(`Reactivate ${m.fullName}?`)) {
                                activateMut.mutate(m.id);
                              }
                            }}
                            style={{ ...btnMini, color: 'var(--olive)', borderColor: 'rgba(128,128,0,0.2)' }}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
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
                        {allTeamNames.map((t) => <option key={t as string} value={t as string}>{t as string}</option>)}
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

      {/* ── CREATE TEAM MODAL ── */}
      {showCreateTeam && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateTeam(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Create New Team</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Add a new team to organize your members.</div>
              </div>
              <button onClick={() => setShowCreateTeam(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <label style={lbl}>Team Name *</label>
              <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Sales Team" style={inp} />
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
              <button onClick={() => setShowCreateTeam(false)} style={{ ...btnSecondary, padding: '8px 14px' }}>Cancel</button>
              <button onClick={handleCreateNewTeam} disabled={!newTeamName.trim()}
                style={{ ...btnPrimary, padding: '8px 16px', opacity: !newTeamName.trim() ? 0.6 : 1 }}>
                Create Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE TEAM MODAL ── */}
      {changeTeamTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setChangeTeamTarget(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Change Team</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Assign {changeTeamTarget.fullName} to a new team.</div>
              </div>
              <button onClick={() => setChangeTeamTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <label style={lbl}>Select Team</label>
              <select value={newTargetTeam} onChange={(e) => setNewTargetTeam(e.target.value)} style={inp}>
                <option value="">Unassigned</option>
                {allTeamNames.map(t => <option key={t as string} value={t as string}>{t as string}</option>)}
              </select>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
              <button onClick={() => setChangeTeamTarget(null)} style={{ ...btnSecondary, padding: '8px 14px' }}>Cancel</button>
              <button onClick={() => {
                teamMut.mutate({ id: changeTeamTarget.id, teamName: newTargetTeam });
                setChangeTeamTarget(null);
              }}
                style={{ ...btnPrimary, padding: '8px 16px' }}>
                Save Changes
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
