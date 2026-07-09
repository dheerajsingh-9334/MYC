import { StepRow, autoBox, triggerBox, infoBox, Card, TaskItem } from '../PipelineUI';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';

export default function AdminTab({ stats, standup, clients }: { stats: any; standup: any; clients: any[] }) {
  const router = useRouter();
  const items = standup?.items || [];
  const overdue  = items.filter((i: any) => i.alertType === 'overdue');
  const blocked  = items.filter((i: any) => i.alertType === 'blocked');
  const dueToday = items.filter((i: any) => i.alertType === 'due_today');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Role header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, flexShrink: 0 }}>🛡</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Admin (manager)</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 16 }}>
            Sees everything. Approves clients, monitors pipeline, handles escalations, overrides steps, configures templates. Does not do task-level work.
          </div>
        </div>
      </div>

      {/* 1 — Invite & approve */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Step 1 of admin workflow</div>
        <StepRow number="👤" name="Invite & approve" dotStyle="active" isLast
          meta="Sends invite link (name + email + WhatsApp). Reviews submitted application in Onboarding Review screen.">
          <Card>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Actions available</div>
            <TaskItem label="Approve & start pipeline → pipeline engine takes over" />
            <TaskItem label="Request more info from client" />
            <TaskItem label="Reject application" />
          </Card>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => router.push('/onboarding')} style={{ padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Open Onboarding Queue →
            </button>
          </div>
        </StepRow>
      </div>

      {/* 2 — Pipeline dashboard */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16 }}>Pipeline dashboard — daily monitoring</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>Table of all clients across all steps. Sorted by risk status.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Card>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Filters admin uses</div>
            {[
              { label: 'All clients',  value: stats?.total ?? '—',    color: 'var(--olive)' },
              { label: 'Overdue',      value: stats?.overdue ?? '—',  color: 'var(--red)' },
              { label: 'Due today',    value: stats?.dueToday ?? '—', color: 'var(--amber)' },
              { label: 'On track',     value: stats?.onTrack ?? '—',  color: 'var(--green)' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink-2)' }}>{r.label}</span>
                <span style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: r.color, fontStyle: 'italic' }}>{r.value}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Columns visible</div>
            {['Client name', 'Current step', 'Team assigned', 'Days in step / SLA', 'Status badge'].map(c => (
              <div key={c} style={{ fontSize: 13, color: 'var(--ink-2)', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>{c}</div>
            ))}
          </Card>
        </div>
        <Link href="/clients" style={{ display: 'inline-flex', marginTop: 14, padding: '8px 16px', background: 'var(--surface)', color: 'var(--olive)', border: '1px solid var(--olive)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none' }}>
          Open Pipeline Dashboard →
        </Link>
      </div>

      {/* 3 — Daily standup */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Daily standup brief</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>Exception-only view. Admin opens this each morning — only at-risk clients appear.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Overdue', count: overdue.length, bg: 'var(--red-bg)', color: 'var(--red)' },
            { label: 'Blocked', count: blocked.length, bg: '#F0E8FA', color: '#6B3FA0' },
            { label: 'Due today', count: dueToday.length, bg: 'var(--amber-bg)', color: 'var(--amber)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '14px', background: s.bg, borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: s.color, fontWeight: 500, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {infoBox('Everything else is hidden. If a client isn\'t here, they\'re fine.')}
        <button onClick={() => router.push('/standup')} style={{ marginTop: 14, padding: '8px 16px', background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid #F0D9A0', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Open Today's Brief →
        </button>
      </div>

      {/* 4 — Manual override */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Manual step override</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>Admin can move any client forward or backward. Requires a reason note for audit trail.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { title: 'Forward move', rows: [['Incomplete tasks', 'Cancelled'], ['New step tasks', 'Auto-created'], ['Reason log', 'Required']], colors: ['var(--muted)', 'var(--green)', 'var(--olive)'] },
            { title: 'Backward move', rows: [['Current tasks', 'Cancelled'], ['Target step tasks', 'Deleted + fresh'], ['Reason log', 'Required']], colors: ['var(--muted)', 'var(--red)', 'var(--olive)'] },
          ].map(col => (
            <Card key={col.title}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{col.title}</div>
              {col.rows.map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>{k}</span>
                  <span style={{ fontWeight: 500, color: col.colors[i] }}>{v}</span>
                </div>
              ))}
            </Card>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
          → Use the "Move step" button on any Client Detail page
        </div>
      </div>

      {/* 5 — Step config */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Step & template configuration</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 12 }}>Configure each step's name, owning team, SLA days, and task templates. Changes only affect future clients.</div>
        {infoBox('In-progress clients are unaffected. Template changes = future clients only.')}
        <button onClick={() => router.push('/settings/steps')} style={{ marginTop: 12, padding: '8px 16px', background: 'var(--olive-50)', color: 'var(--olive-dark)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Open Step Config →
        </button>
      </div>

    </div>
  );
}
