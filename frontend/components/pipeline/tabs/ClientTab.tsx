import { infoBox, Card } from '../PipelineUI';
import { useRouter } from 'next/navigation';

export default function ClientTab() {
  const router = useRouter();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Role header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#6B3FA0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>👤</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Client (coach)</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 2 }}>
            Phase 1: client only interacts via the self-service onboarding form (no login). Client actions are the most common source of blockers.
          </div>
        </div>
      </div>

      {/* Journey steps */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>Client journey — Phase 1</div>

        {[
          {
            icon: '✉️', title: 'Receives invite',
            desc: 'Gets a unique onboarding link via WhatsApp + email. Link is valid until submitted.',
            extra: infoBox('Link format: /onboard/[unique-token] — no login required, single-use form'),
          },
          {
            icon: '📝', title: 'Fills onboarding form',
            desc: '~8 minutes. Self-service, no MyC staff involvement.',
            extra: (
              <Card style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Form sections</div>
                {['Coach & brand info (name, email, WhatsApp, location)', 'Coaching practice (niche, experience, audience size, revenue goal)', 'Event details (topic, format, target date)', 'Brand assets (photo, logo, bio, intro video)', 'Brand tone & colors'].map(s => (
                  <div key={s} style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>○</span>{s}
                  </div>
                ))}
              </Card>
            ),
          },
          {
            icon: '⏳', title: 'Waiting for approval',
            desc: 'Application reviewed by admin. Client receives a confirmation that application was received.',
            extra: null,
          },
          {
            icon: '✅', title: 'Pipeline starts',
            desc: 'On approval — client is notified (email + WhatsApp), pipeline begins at Step 1.',
            extra: null,
          },
        ].map((step, i) => (
          <div key={step.title} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 14, marginBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0E8FA', border: '1.5px solid #6B3FA0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{step.icon}</div>
              {i < 3 && <div style={{ width: 1.5, flex: 1, background: 'var(--border)', minHeight: 16 }} />}
            </div>
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', paddingTop: 6 }}>{step.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{step.desc}</div>
              {step.extra}
            </div>
          </div>
        ))}
      </div>

      {/* Common blockers */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>During pipeline — client responsibilities</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Client is the most common source of delays. These are the things teams wait on:</div>
        {[
          'Provide brand photos (Step 5 — most common blocker)',
          'Respond to strategy call scheduling (Step 2)',
          'Approve ad creatives before launch (Step 5→6)',
          'Show up for event dry run (Step 8)',
        ].map(item => (
          <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: '#F0E8FA', border: '1px solid #6B3FA0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B3FA0', fontSize: 9 }}>🚩</div>
            <span style={{ color: 'var(--ink-2)' }}>{item}</span>
          </div>
        ))}
        {infoBox('Phase 2: client portal with progress tracker, document vault, and task requests from their side')}
      </div>

      {/* Preview form link */}
      <div style={{ background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--olive-dark)', marginBottom: 8 }}>Send an invite to a new client</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Generate a unique invite link from the Onboarding Queue. The client gets a 4-step form to fill — no login, no friction.</div>
        <button onClick={() => router.push('/onboarding')} style={{ padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Go to Onboarding Queue →
        </button>
      </div>
    </div>
  );
}
