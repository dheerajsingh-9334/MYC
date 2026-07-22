'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { USE_MOCK } from '@/lib/mockData';
import { Users, CheckSquare, TrendingUp, AlertTriangle } from 'lucide-react';

export default function WeekAtAGlance({ hideStepAdvances = false, hideDueIn7d = false }: { hideStepAdvances?: boolean; hideDueIn7d?: boolean } = {}) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-staff-stats'],
    queryFn: () => apiFetch('/api/dashboard/staff'),
    enabled: !USE_MOCK,
    retry: false,
  });

  // Calculate dynamic date range for the header
  const today = new Date();
  const currentDay = today.getDay();
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatShortDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };
  const dateRangeString = `${formatShortDate(monday)} – ${formatShortDate(sunday)}`;

  // Default fallback data (mock / loading state)
  const displayStats = stats || {
    joinedThisWeek: 2,
    tasksCompleted: 8,
    stepAdvances: 3,
    dueIn7d: 5,
    pipelineDistribution: [
      { id: '1', stepNumber: 1, name: 'Onboarding', clientCount: 1 },
      { id: '2', stepNumber: 2, name: 'Strategy', clientCount: 0 },
      { id: '3', stepNumber: 3, name: 'Brand Setup', clientCount: 1 },
      { id: '4', stepNumber: 4, name: 'Funnel Build', clientCount: 1 },
      { id: '5', stepNumber: 5, name: 'Ad Creative', clientCount: 0 },
      { id: '6', stepNumber: 6, name: 'Ad Launch', clientCount: 1 },
      { id: '7', stepNumber: 7, name: 'Automation', clientCount: 0 },
      { id: '8', stepNumber: 8, name: 'Event Prep', clientCount: 0 },
      { id: '9', stepNumber: 9, name: 'Event Launch', clientCount: 2 },
    ]
  };

  const totalClients = displayStats.pipelineDistribution?.reduce((sum: number, item: any) => sum + (item.clientCount || 0), 0) || 1;
  const visibleCardsCount = 4 - (hideStepAdvances ? 1 : 0) - (hideDueIn7d ? 1 : 0);

  if (isLoading && !USE_MOCK) {
    return (
      <div style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 20, animation: 'pulse 1.5s infinite' }}>
        <div style={{ height: 24, background: 'var(--border)', width: 150, marginBottom: 16, borderRadius: 4 }} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleCardsCount}, 1fr)`, gap: 16, marginBottom: 20 }}>
          {Array.from({ length: visibleCardsCount }).map((_, i) => <div key={i} style={{ height: 80, background: 'var(--border)', borderRadius: 'var(--radius)' }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)', margin: 0 }}>Our week at a glance</h2>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Overview of client metrics & active distribution</span>
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--olive)', background: 'var(--olive-50)', padding: '5px 12px', borderRadius: 999, flexShrink: 0 }}>
          {dateRangeString}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {/* Card 1: Joined This Week */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(74, 102, 70, 0.1)', color: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joined This Week</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
              {displayStats.joinedThisWeek} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>new client{displayStats.joinedThisWeek !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tasks Completed */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(74, 102, 70, 0.1)', color: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckSquare size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasks Completed</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
              {displayStats.tasksCompleted} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>completed</span>
            </div>
          </div>
        </div>

        {/* Card 3: Step Advances */}
        {!hideStepAdvances && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(74, 102, 70, 0.1)', color: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step Advances</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                {displayStats.stepAdvances} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>last 7 days</span>
              </div>
            </div>
          </div>
        )}

        {/* Card 4: Due in Next 7D */}
        {!hideDueIn7d && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(176, 67, 106, 0.1)', color: '#B0436A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due in Next 7D</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                {displayStats.dueIn7d} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>upcoming</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Distribution Section */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>Pipeline Distribution</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayStats.pipelineDistribution?.map((step: any) => {
            const stepNumStr = String(step.stepNumber).padStart(2, '0');
            const pct = Math.max(2, Math.round(((step.clientCount || 0) / totalClients) * 100));

            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {/* Step Number Pill */}
                <div style={{
                  width: 32, height: 24, borderRadius: 6, border: '1px solid var(--olive)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: 'var(--olive)',
                  flexShrink: 0,
                }}>
                  {stepNumStr}
                </div>

                {/* Step Name Pill */}
                <div style={{
                  minWidth: 80, maxWidth: 130, padding: '4px 10px', borderRadius: 6, background: 'var(--olive)',
                  fontSize: 12, fontWeight: 600, color: '#fff', textAlign: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {step.name}
                </div>

                {/* Relative Load progress bar */}
                <div style={{ flex: 1, height: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden', position: 'relative', minWidth: 40 }}>
                  <div style={{
                    width: `${pct}%`, height: '100%',
                    background: 'linear-gradient(90deg, var(--olive), var(--olive-light))',
                    borderRadius: 999, transition: 'width 0.4s ease-out'
                  }} />
                </div>

                {/* Client count label */}
                <div style={{ minWidth: 18, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 700, color: step.clientCount > 0 ? 'var(--olive)' : 'var(--muted)', flexShrink: 0 }}>
                  {step.clientCount}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
