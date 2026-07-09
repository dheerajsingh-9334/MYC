'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch, getUser } from '@/lib/api';
import { USE_MOCK, MOCK_TASKS, MOCK_TEAM, MOCK_CLIENTS } from '@/lib/mockData';
import { TrendingUp, Users, Target, Clock, ArrowRight, Sparkles } from 'lucide-react';

export default function PerformancePage() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'individual' | 'team' | 'clients'>('individual');

  useEffect(() => {
    setUser(getUser());
    apiFetch('/api/auth/me').then(freshUser => {
      localStorage.setItem('user', JSON.stringify(freshUser));
      setUser(freshUser);
    }).catch(err => console.error('Failed to refresh user:', err));
  }, []);

  const { data: liveTasks = [] } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK,
  });

  const { data: liveClients = [] } = useQuery<any[]>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK,
  });

  const tasksList = useMemo(() => {
    return USE_MOCK ? MOCK_TASKS : liveTasks;
  }, [liveTasks]);

  const clientsList = useMemo(() => {
    return USE_MOCK ? MOCK_CLIENTS : liveClients;
  }, [liveClients]);

  // 1. My Performance calculation (when member set task as progress and till completed)
  const myPerformance = useMemo(() => {
    if (!user) return { avgHours: '0.0h', completedCount: 0, taskBreakdown: [] };

    const myCompletedTasks = tasksList.filter((t: any) => {
      const assigneeId = t.assignedToId || t.assignedTo?.id;
      const isMine = assigneeId === user.id || t.assignedTo?.fullName === user.fullName;
      return isMine && t.status === 'complete';
    });

    let totalMs = 0;
    let validCount = 0;
    const breakdown = myCompletedTasks.map((t: any) => {
      let durationStr = '—';
      let hours = 0;
      // Start time is when task went to progress, fallback to creation
      const start = t.inProgressAt || t.createdAt;
      if (start && t.completedAt) {
        const diff = new Date(t.completedAt).getTime() - new Date(start).getTime();
        totalMs += diff;
        validCount++;
        hours = diff / (1000 * 60 * 60);
        durationStr = hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;
      }
      return {
        id: t.id,
        title: t.title,
        clientName: t.client?.brandName || t.client?.fullName || '—',
        durationStr,
        hours,
        completedAt: t.completedAt ? new Date(t.completedAt).toLocaleDateString() : '—',
      };
    });

    const avgHoursVal = validCount > 0 ? (totalMs / (1000 * 60 * 60 * validCount)) : 0;

    return {
      avgHours: `${avgHoursVal.toFixed(1)}h`,
      completedCount: myCompletedTasks.length,
      taskBreakdown: breakdown,
    };
  }, [tasksList, user]);

  // 2. Team Performance (how much hour)
  const teamPerformance = useMemo(() => {
    const teamName = user?.teamName;
    if (!teamName) return { avgHours: '0.0h', totalHours: '0.0h', membersList: [] };

    const teamTasks = tasksList.filter((t: any) => {
      const taskTeam = t.step?.owningTeamName || t.assignedTo?.teamName;
      return taskTeam === teamName && t.status === 'complete';
    });

    let totalMs = 0;
    let validCount = 0;
    teamTasks.forEach((t: any) => {
      const start = t.inProgressAt || t.createdAt;
      if (start && t.completedAt) {
        const diff = new Date(t.completedAt).getTime() - new Date(start).getTime();
        totalMs += diff;
        validCount++;
      }
    });

    const avgHoursVal = validCount > 0 ? (totalMs / (1000 * 60 * 60 * validCount)) : 0;
    const totalHoursVal = totalMs / (1000 * 60 * 60);

    // Group by member
    const memberMap: Record<string, { name: string; completed: number; totalHours: number; validCount: number }> = {};
    tasksList.filter((t: any) => {
      const taskTeam = t.step?.owningTeamName || t.assignedTo?.teamName;
      return taskTeam === teamName;
    }).forEach((t: any) => {
      const assigneeName = t.assignedTo?.fullName || 'Unassigned';
      if (!memberMap[assigneeName]) {
        memberMap[assigneeName] = { name: assigneeName, completed: 0, totalHours: 0, validCount: 0 };
      }
      if (t.status === 'complete') {
        memberMap[assigneeName].completed++;
        const start = t.inProgressAt || t.createdAt;
        if (start && t.completedAt) {
          const diff = new Date(t.completedAt).getTime() - new Date(start).getTime();
          memberMap[assigneeName].totalHours += diff / (1000 * 60 * 60);
          memberMap[assigneeName].validCount++;
        }
      }
    });

    const membersList = Object.values(memberMap).map((m: any) => ({
      name: m.name,
      completed: m.completed,
      totalHours: `${m.totalHours.toFixed(1)}h`,
      avgHours: m.validCount > 0 ? `${(m.totalHours / m.validCount).toFixed(1)}h` : '—',
    }));

    return {
      avgHours: `${avgHoursVal.toFixed(1)}h`,
      totalHours: `${totalHoursVal.toFixed(1)}h`,
      membersList,
    };
  }, [tasksList, user]);

  // 3. Client Performance (how much days)
  const clientPerformance = useMemo(() => {
    if (clientsList.length === 0) return { avgDays: '—', list: [] };

    const list = clientsList.map((c: any) => {
      const days = c.completionDurationDays ?? 0;
      return {
        id: c.id,
        name: c.brandName || c.fullName || '—',
        dateJoined: c.dateJoined ? new Date(c.dateJoined).toLocaleDateString() : '—',
        status: c.status,
        days,
        daysStr: `${days} days`,
      };
    });

    let sumDays = 0;
    let count = 0;
    list.forEach((c: any) => {
      sumDays += c.days;
      count++;
    });

    const avgDaysVal = count > 0 ? sumDays / count : 0;

    return {
      avgDays: count > 0 ? `${avgDaysVal.toFixed(1)} days` : '—',
      list,
    };
  }, [clientsList]);

  return (
    <AppLayout>
      <Topbar title="Performance Analytics" subtitle="Standard cycle-time, team efficiency, and client timelines" />
      
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <SectionCard padding="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(59, 130, 246, 0.08)', color: '#3B82F6' }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>My Avg Completion</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{myPerformance.avgHours}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard padding="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(16, 185, 129, 0.08)', color: '#10B981' }}>
                <Users size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Team Avg Cycle Time</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{teamPerformance.avgHours}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard padding="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(139, 92, 246, 0.08)', color: '#8B5CF6' }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Team Total Hours</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{teamPerformance.totalHours}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard padding="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(245, 158, 11, 0.08)', color: '#F59E0B' }}>
                <Target size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Client Avg Lifecycle</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{clientPerformance.avgDays}</div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 24 }}>
          <button 
            onClick={() => setActiveTab('individual')}
            style={{
              padding: '10px 4px', fontSize: 13.5, fontWeight: activeTab === 'individual' ? 600 : 500,
              color: activeTab === 'individual' ? 'var(--olive)' : 'var(--muted)',
              border: 'none', background: 'none', borderBottom: activeTab === 'individual' ? '2px solid var(--olive)' : 'none',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            My Performance
          </button>
          {user?.teamName && (
            <button 
              onClick={() => setActiveTab('team')}
              style={{
                padding: '10px 4px', fontSize: 13.5, fontWeight: activeTab === 'team' ? 600 : 500,
                color: activeTab === 'team' ? 'var(--olive)' : 'var(--muted)',
                border: 'none', background: 'none', borderBottom: activeTab === 'team' ? '2px solid var(--olive)' : 'none',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              Team Performance ({user.teamName})
            </button>
          )}
          <button 
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '10px 4px', fontSize: 13.5, fontWeight: activeTab === 'clients' ? 600 : 500,
              color: activeTab === 'clients' ? 'var(--olive)' : 'var(--muted)',
              border: 'none', background: 'none', borderBottom: activeTab === 'clients' ? '2px solid var(--olive)' : 'none',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            Client Analytics
          </button>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {activeTab === 'individual' && (
            <SectionCard title="My Completed Tasks & Timelines" padding="0">
              {myPerformance.taskBreakdown.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
                  <Sparkles size={36} style={{ color: 'var(--border)', margin: '0 auto 16px', display: 'block' }} />
                  No completed tasks found for you. Start working on a task to track performance!
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Task</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Client</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Completion Date</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Time to Complete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPerformance.taskBreakdown.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--ink)' }}>{item.title}</td>
                          <td style={{ padding: '10px 18px', color: 'var(--ink-2)' }}>{item.clientName}</td>
                          <td style={{ padding: '10px 18px', color: 'var(--soft)' }}>{item.completedAt}</td>
                          <td style={{ padding: '10px 18px', fontWeight: 700, color: 'var(--olive)', textAlign: 'right' }}>{item.durationStr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {activeTab === 'team' && (
            <SectionCard title="Team Efficiency Breakdown" padding="0">
              {teamPerformance.membersList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>No team member statistics available.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Team Member</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Completed Tasks</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Total Hours Spent</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Avg task duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamPerformance.membersList.map((m: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--ink)' }}>{m.name}</td>
                          <td style={{ padding: '10px 18px', color: 'var(--ink-2)' }}>{m.completed} tasks</td>
                          <td style={{ padding: '10px 18px', color: 'var(--ink-2)', textAlign: 'right' }}>{m.totalHours}</td>
                          <td style={{ padding: '10px 18px', fontWeight: 700, color: 'var(--olive)', textAlign: 'right' }}>{m.avgHours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {activeTab === 'clients' && (
            <SectionCard title="Client Lifecycle & Pipeline Days" padding="0">
              {clientPerformance.list.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>No client data found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Client Brand / Name</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Onboarding Date</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)' }}>Status</th>
                        <th style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Active / Lifecycle Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientPerformance.list.map((c: any) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 18px', fontWeight: 600, color: 'var(--ink)' }}>{c.name}</td>
                          <td style={{ padding: '10px 18px', color: 'var(--ink-2)' }}>{c.dateJoined}</td>
                          <td style={{ padding: '10px 18px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              background: c.status === 'active' ? 'var(--olive-50)' : c.status === 'completed' ? 'var(--green-bg)' : 'var(--surface-2)',
                              color: c.status === 'active' ? 'var(--olive)' : c.status === 'completed' ? 'var(--green)' : 'var(--muted)',
                            }}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 18px', fontWeight: 700, color: 'var(--olive)', textAlign: 'right' }}>{c.daysStr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
