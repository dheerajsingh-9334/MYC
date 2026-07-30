import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useFormDraft } from '@/lib/useFormDraft';
import { autoBox, infoBox, Card, TaskItem } from '../PipelineUI';
import { format, isToday, isPast } from 'date-fns';
import { useState } from 'react';



export default function TeamTab({ tasks }: { tasks: any[] }) {
  const qc = useQueryClient();
  const completeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/complete`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const active = tasks.filter(t => !['complete', 'cancelled'].includes(t.status));
  const completed = tasks.filter(t => t.status === 'complete');
  const overdue = active.filter(t => isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
  const dueToday = active.filter(t => isToday(new Date(t.dueDate)));
  const upcoming = active.filter(t => !isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));

  const taskCard = (task: any) => {
    const late = isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
    const today = isToday(new Date(task.dueDate));
    return (
      <div key={task.id} style={{ background: 'var(--surface)', border: `1px solid ${late ? '#F5D0CC' : 'var(--border)'}`, borderLeft: `3px solid ${late ? 'var(--red)' : today ? 'var(--amber)' : 'var(--green)'}`, borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <button onClick={() => { if (task.status !== 'complete') completeMut.mutate(task.id); }}
            style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1, border: task.status === 'complete' ? 'none' : '1.5px solid var(--border)', background: task.status === 'complete' ? 'var(--olive)' : 'var(--surface)', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {task.status === 'complete' ? '✓' : ''}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{task.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {task.client?.brandName || task.client?.fullName} · Step {task.step?.stepNumber} — {task.step?.name}
              <span style={{ marginLeft: 8, color: late ? 'var(--red)' : today ? 'var(--amber)' : 'var(--muted)', fontWeight: 600 }}>
                · {late ? `Overdue ${Math.floor((Date.now() - new Date(task.dueDate).getTime()) / 86400000)}d` : today ? 'Due today' : `Due ${format(new Date(task.dueDate), 'd MMM')}`}
              </span>
            </div>
          </div>
          {task.status !== 'complete' && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => completeMut.mutate(task.id)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Done</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const sectionHeader = (label: string, count: number) => (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {label} <span style={{ background: 'var(--surface-2)', padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>{count}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Role header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>💼</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Team member</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 16 }}>
            Each team member only sees their own tasks. Their actions directly trigger the pipeline engine — marking a task done can auto-advance a client to the next step.
          </div>
        </div>
      </div>

      {/* Flow boxes */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>How task assignment works</div>
        {autoBox('When a client enters a step → system assigns tasks to least-loaded team member in that team (round-robin by active task count)')}
        {autoBox('Mark task complete → if last task in step → client auto-advances to next step, next team gets notified instantly')}
        {infoBox('Auto-advancement is synchronous — happens in the same API call, no delay or queued job')}
      </div>

      {/* Task states */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Task states</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { state: 'Overdue', desc: 'Past due date — manager alerted by cron', bg: 'var(--red-bg)', color: 'var(--red)' },
            { state: 'Due today', desc: 'Final day of SLA window', bg: 'var(--amber-bg)', color: 'var(--amber)' },

            { state: 'Complete', desc: 'Timestamped with who completed it', bg: 'var(--green-bg)', color: 'var(--green)' },
          ].map(s => (
            <div key={s.state} style={{ padding: '10px 14px', background: s.bg, borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.state}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Live tasks */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Live: My Tasks</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{active.length} active · {completed.length} done</span>
        </div>

        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13.5 }}>No tasks assigned yet</div>
        ) : (
          <>
            {overdue.length > 0 && <>{sectionHeader('Overdue', overdue.length)}{overdue.map(taskCard)}</>}
            {dueToday.length > 0 && <>{sectionHeader('Due Today', dueToday.length)}{dueToday.map(taskCard)}</>}
            {upcoming.length > 0 && <>{sectionHeader('Upcoming', upcoming.length)}{upcoming.map(taskCard)}</>}
            {active.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--green)', fontSize: 13.5 }}>✅ All caught up!</div>}
          </>
        )}
      </div>

      {/* Cannot see */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>Team members cannot see</div>
        {['Pipeline dashboard — other clients, other teams', 'Standup briefing screen', 'Step configuration, templates', 'User management', 'Revenue data, client financial details'].map(item => (
          <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--red-bg)', border: '1px solid var(--red)', flexShrink: 0 }} />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
