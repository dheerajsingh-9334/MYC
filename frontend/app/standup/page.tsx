'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import {
  Sparkles, TriangleAlert, Ban, Clock, ArrowRight, ChevronLeft, ChevronRight, Search
} from 'lucide-react';
import { format } from 'date-fns';
import { useState, useMemo, useEffect } from 'react';

const TEAMS = ['Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 'Account Manager', 'Content Team'];

const AUTO_REFRESH_MS = 30_000;

const TYPE_STYLES: Record<string, { color: string; bg: string; Icon: any; label: string; tag: (i: any) => string }> = {
  overdue: {
    color: 'var(--red)', bg: 'var(--red-bg)', Icon: TriangleAlert, label: 'OVERDUE',
    tag: (i) => `+${i.daysLate} day${i.daysLate !== 1 ? 's' : ''}`,
  },
  blocked: {
    color: '#6B3FA0', bg: '#F0E8FA', Icon: Ban, label: 'BLOCKER RAISED',
    tag: () => 'Blocked',
  },
  due_today: {
    color: 'var(--amber)', bg: 'var(--amber-bg)', Icon: Clock, label: 'DUE TODAY',
    tag: () => 'Today',
  },
};

export default function StandupPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [limit, setLimit] = useState(10);

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ['standup'],
    queryFn: () => apiFetch('/api/standup'),
    refetchInterval: AUTO_REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const items = (liveData?.items || []).map((it: any) => {
    const isOverdue = it.alertType === 'overdue';
    const isBlocked = it.alertType === 'blocked';
    const daysLate = it.daysLate || 0;
    const assignee = it.task?.assignedTo?.fullName;
    const assigneeTeam = it.task?.assignedTo?.teamName;
    const clientName = it.client?.brandName || it.client?.fullName || '—';
    const stepLabel = it.step ? `Step ${String(it.step.stepNumber).padStart(2, '0')} — ${it.step.name}` : '';
    const title = it.task?.title || '—';
    let detail = '';
    if (isBlocked && it.task?.blockerNote) {
      detail = `Blocker raised by <b>${assignee || 'team member'}</b>: <em>"${it.task.blockerNote}"</em>`;
    } else if (assignee) {
      detail = `Assigned to <b>${assignee}${assigneeTeam ? ` (${assigneeTeam})` : ''}</b>.${it.task?.dueDate ? ` Due ${format(new Date(it.task.dueDate), 'd MMM')}.` : ''}`;
    } else {
      detail = 'Unassigned';
    }
    return {
      id: it.task?.id || `${it.client?.id}-${it.task?.id || ''}`,
      clientId: it.client?.id,
      alertType: it.alertType,
      clientName, stepLabel, title, detail, daysLate,
      assigneeTeam,
    };
  });

  const filteredItems = useMemo(() => {
    return items.filter((item: any) => {
      const searchMatch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.clientName.toLowerCase().includes(search.toLowerCase()) ||
        (item.stepLabel && item.stepLabel.toLowerCase().includes(search.toLowerCase())) ||
        item.detail.toLowerCase().includes(search.toLowerCase());

      const alertTypeMatch = !alertTypeFilter || item.alertType === alertTypeFilter;
      const teamMatch = !teamFilter || item.assigneeTeam === teamFilter;

      return searchMatch && alertTypeMatch && teamMatch;
    });
  }, [items, search, alertTypeFilter, teamFilter]);

  const scrollableItems = useMemo(() => {
    return filteredItems.slice(0, limit);
  }, [filteredItems, limit]);

  useEffect(() => {
    setLimit(10);
  }, [search, alertTypeFilter, teamFilter]);

  const handleStandupScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setLimit(prev => Math.min(prev + 10, filteredItems.length));
    }
  };

  const isLoading = liveLoading && items.length === 0;
  const totalAlerts = liveData?.total ?? items.length;
  const overdueCnt = items.filter((i: any) => i.alertType === 'overdue').length;
  const blockedCnt = items.filter((i: any) => i.alertType === 'blocked').length;
  const dueTodayCnt = items.filter((i: any) => i.alertType === 'due_today').length;

  return (
    <AppLayout>
      <Topbar title="Standup Brief" subtitle="Today's attention items" />
      <div style={{ padding: '16px 20px', flex: 1 }}>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 24, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: '12px 16px'
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input
              type="text"
              placeholder="Search standup items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 34px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg)', color: 'var(--ink)',
                outline: 'none', transition: 'all 0.15s'
              }}
            />
          </div>

          {/* Alert Type */}
          <select
            value={alertTypeFilter}
            onChange={(e) => setAlertTypeFilter(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', outline: 'none'
            }}
          >
            <option value="">All Alerts</option>
            <option value="overdue">Overdue</option>
            <option value="blocked">Blocked</option>
            <option value="due_today">Due Today</option>
          </select>

          {/* Team Filter */}
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, background: 'var(--bg)', color: 'var(--ink)', outline: 'none'
            }}
          >
            <option value="">All Teams</option>
            {TEAMS.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        {/* Alert cards */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: 'var(--olive)', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>No items match your criteria!</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Try adjusting your filters or search terms.</div>
          </div>
        ) : (
          <div
            onScroll={handleStandupScroll}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 650,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              background: 'var(--surface-2)'
            }}
          >
            {scrollableItems.map((item: any) => {
              const s = TYPE_STYLES[item.alertType] || TYPE_STYLES.due_today;
              const { Icon } = s;
              return (
                <div key={item.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: '18px 20px', display: 'grid', gridTemplateColumns: '4px 1fr auto',
                  gap: 18, alignItems: 'center', transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                  <div style={{ width: 4, minHeight: 60, borderRadius: 4, background: s.color }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <Icon size={11} style={{ color: s.color }} />
                      <span style={{ color: s.color }}>{s.label}</span>
                      <span>·</span>
                      <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{item.clientName}</span>
                      {item.stepLabel && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{item.stepLabel}</span>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)' }}
                      dangerouslySetInnerHTML={{ __html: item.detail }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 5, background: s.bg, color: s.color,
                    }}>
                      {s.tag(item)}
                    </span>
                    <button onClick={() => item.clientId && router.push(`/clients/${item.clientId}`)} style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', background: 'var(--surface)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Open client <ArrowRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}