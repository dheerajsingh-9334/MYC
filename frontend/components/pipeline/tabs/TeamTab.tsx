import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useFormDraft } from '@/lib/useFormDraft';
import { autoBox, infoBox, Card, TaskItem } from '../PipelineUI';
import { format, isToday, isPast } from 'date-fns';
import { useState } from 'react';

// Per-task blocker editor. Owns its own draft so the typed note
// survives tab switches and reloads.
function BlockerEditor({ taskId, onSubmit, onCancel, isPending }: {
  taskId: string;
  onSubmit: (note: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const draft = useFormDraft<{ blockerNote: string }>({
    kind: 'raise_blocker',
    contextId: taskId,
    initialData: { blockerNote: '' },
  });
  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={draft.data.blockerNote}
        onChange={e => draft.setData(p => ({ ...p, blockerNote: e.target.value }))}
        placeholder="What's blocking this task?"
        style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, minHeight: 56, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          onClick={async () => {
            onSubmit(draft.data.blockerNote);
            await draft.clear();
          }}
          disabled={!draft.data.blockerNote || isPending}
          style={{ padding: '5px 12px', background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: !draft.data.blockerNote || isPending ? 'not-allowed' : 'pointer', opacity: !draft.data.blockerNote ? 0.6 : 1 }}
        >
          Raise blocker
        </button>
        <button onClick={onCancel} style={{ padding: '5px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
      </div>
    </div>
  );
}

export default function TeamTab({ tasks }: { tasks: any[] }) {
  const qc = useQueryClient();
  const [blockerTask, setBlockerTask] = useState<string | null>(null);

  const completeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/tasks/${id}/complete`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const blockerMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`/api/tasks/${id}/blocker`, { method: 'PATCH', body: JSON.stringify({ blockerNote: note }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setBlockerTask(null); },
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
      <div key={task.id} style={{ background: 'var(--surface)', border: `1px solid ${task.status === 'blocked' ? 'var(--border)' : late ? '#F5D0CC' : 'var(--border)'}`, borderLeft: `3px solid ${task.status === 'blocked' ? '#6B3FA0' : late ? 'var(--red)' : today ? 'var(--amber)' : 'var(--green)'}`, borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 8 }}>
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
            {task.blockerNote && <div style={{ marginTop: 6, fontSize: 12, color: '#6B3FA0', background: '#F0E8FA', padding: '4px 10px', borderRadius: 4 }}>Blocked: {task.blockerNote}</div>}

            {blockerTask === task.id && (
              <BlockerEditor
                taskId={task.id}
                onSubmit={note => blockerMut.mutate({ id: task.id, note })}
                onCancel={() => setBlockerTask(null)}
                isPending={blockerMut.isPending}
              />
            )}
          </div>
          {task.status !== 'complete' && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => completeMut.mutate(task.id)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Done</button>
              <button onClick={() => setBlockerTask(task.id === blockerTask ? null : task.id)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, background: 'var(--surface)', cursor: 'pointer', color: '#6B3FA0' }}>Block</button>
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
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 2 }}>
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
            { state: 'Blocked', desc: 'Team member raised a blocker — admin notified instantly', bg: '#F0E8FA', color: '#6B3FA0' },
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
