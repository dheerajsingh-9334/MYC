'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import DashboardHeader from '@/components/ui/DashboardHeader';
import {
  Sparkles, TriangleAlert, Ban, Clock, ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';

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
    };
  });

  const isLoading = liveLoading && items.length === 0;
  const totalAlerts = liveData?.total ?? items.length;
  const overdueCnt = items.filter((i: any) => i.alertType === 'overdue').length;
  const blockedCnt = items.filter((i: any) => i.alertType === 'blocked').length;
  const dueTodayCnt = items.filter((i: any) => i.alertType === 'due_today').length;

  return (
    <AppLayout>
      <Topbar title="Standup Brief" subtitle="Today's attention items" />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        <DashboardHeader
          title="Standup Brief"
          subtitle={`${totalAlerts} item${totalAlerts === 1 ? '' : 's'} need your attention today`}
        />

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, var(--olive-dark) 0%, var(--olive) 100%)',
          borderRadius: 'var(--radius-lg)', padding: 32, color: '#fff',
          marginBottom: 24, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(255,255,255,0.08), transparent 60%)', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', marginBottom: 12, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={12} style={{ color: '#FFD27A' }} />
            Today's Briefing · {format(new Date(), 'EEEE d MMMM')}
          </div>
          <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 36, lineHeight: 1.1, marginBottom: 8, letterSpacing: '-0.3px', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            {isLoading ? 'Loading…' : items.length === 0 ? (
              <>
                <Sparkles size={28} style={{ color: '#FFD27A' }} />
                All clear today
              </>
            ) : `${totalAlerts} thing${totalAlerts !== 1 ? 's' : ''} need${totalAlerts === 1 ? 's' : ''} your attention`}
          </h1>
          <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.8)', maxWidth: 540, position: 'relative', zIndex: 1 }}>
            {items.length === 0 ? 'Every client is on track. Great work team!' : 'Everything else is on track. These are the only conversations you need to have in standup today.'}
          </p>
          {totalAlerts > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 8, marginTop: 20,
              background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
              padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
              position: 'relative', zIndex: 1,
            }}>
              <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, fontStyle: 'italic', color: '#FFD27A' }}>{totalAlerts}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                action items · {overdueCnt} overdue · {blockedCnt} blocked · {dueTodayCnt} due today
              </span>
            </div>
          )}
        </div>

        {/* Alert cards */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
            <Sparkles size={36} style={{ color: 'var(--olive)', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>All clear today!</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>No overdue tasks, no blockers, no deadlines today.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item: any) => {
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