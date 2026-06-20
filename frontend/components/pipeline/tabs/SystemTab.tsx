import { autoBox, triggerBox, infoBox, Card } from '../PipelineUI';

export default function SystemTab({ steps }: { steps: any[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Role header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>⚡</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>System / pipeline engine</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 2 }}>
            The invisible fourth "role." Handles all routing, assignment, advancement, and alerting. No human action required for any of these.
          </div>
        </div>
      </div>

      {/* 5 triggers */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 20 }}>All 5 automatic triggers</div>

        {[
          {
            num: 1, title: 'Client approved',
            meta: 'Admin clicks "Approve & start pipeline"',
            content: autoBox('System calls advanceClientToStep(clientId, step1.id, "admin") → Step 1 tasks created, Intake team notified'),
          },
          {
            num: 2, title: 'Last task completed',
            meta: 'Team member marks final task in a step as complete',
            content: (
              <Card style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>checkAutoAdvancement() logic</div>
                {[
                  'Count tasks in this step with status NOT complete/cancelled',
                  'If count = 0 → find next step (stepNumber + 1)',
                  'Next step exists → advanceClientToStep() → tasks created for next team',
                  'Step 9 complete → client.status = "completed"',
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓</span>{s}
                  </div>
                ))}
              </Card>
            ),
          },
          {
            num: 3, title: 'advanceClientToStep() is called',
            meta: 'Core engine function — called by Trigger 1, 2, and manual override',
            content: (
              <Card style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>What happens inside</div>
                {[
                  'Write StepHistory record (from → to, triggered by, reason)',
                  'Update client.currentStepId + stepEnteredAt = now',
                  'Load step\'s task templates (ordered by sortOrder)',
                  'Assign each task to least-loaded active team member',
                  'dueDate = stepEnteredAt + template.relativeDueDay',
                  'Create Notification(type=task_assigned) for each assignee',
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓</span>{s}
                  </div>
                ))}
              </Card>
            ),
          },
          {
            num: 4, title: 'SLA cron (runs every hour)',
            meta: 'node-cron job scans all active tasks for overdue status',
            content: (
              <>
                <Card style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Cron logic</div>
                  {[
                    'Find all tasks: status=pending/in_progress AND dueDate < now',
                    'For each: check if task_overdue notification already sent today',
                    'If not → create Notification for all admins in that org',
                    'Client appears in standup briefing screen',
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>○</span>{s}
                    </div>
                  ))}
                </Card>
                {triggerBox('De-duplicated per day — admin gets one alert per overdue task per day, not one per hour')}
              </>
            ),
          },
          {
            num: 5, title: 'Blocker raised',
            meta: 'Team member raises a blocker on any task',
            content: autoBox('Instant notification to all admins → client appears in standup under "Blocked" section → SLA timer still runs (blocker doesn\'t pause the clock unless admin manually extends due date)'),
          },
        ].map((trigger, i) => (
          <div key={trigger.num} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 14, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--amber-bg)', border: '1.5px solid var(--amber)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{trigger.num}</div>
              {i < 4 && <div style={{ width: 1.5, flex: 1, background: 'var(--border)', minHeight: 16 }} />}
            </div>
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', paddingTop: 6 }}>Trigger {trigger.num} — {trigger.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{trigger.meta}</div>
              {trigger.content}
            </div>
          </div>
        ))}
      </div>

      {/* Assignment algorithm */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Assignment algorithm — round-robin by load</div>
        {[
          'Step enters → owning team identified from step config',
          'All active users WHERE teamName = step.owningTeamName',
          'Count each user\'s pending + in_progress tasks',
          'Assign to user with lowest count',
          'Tie → first user alphabetically',
          'No team members found → throw error, don\'t assign silently',
        ].map((rule, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--ink-2)', padding: '7px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--olive-50)', color: 'var(--olive)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
            {rule}
          </div>
        ))}
      </div>

      {/* Data rules */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Data rules the engine enforces</div>
        {[
          'Every DB query includes organisationId — Org A never sees Org B data',
          'Tasks are never deleted — only cancelled (full audit trail)',
          'Template changes don\'t affect in-progress clients',
          'Auto-advancement is synchronous (same request, not queued)',
          'StepHistory logged for every transition, manual or automatic',
        ].map((rule, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--ink-2)', padding: '7px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--green)', fontWeight: 700, marginTop: 1 }}>✓</span>{rule}
          </div>
        ))}
      </div>

      {/* Live steps from DB */}
      {steps.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Live step config from database</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map((s: any) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1.5fr 1fr', gap: 12, padding: '9px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--olive)' }}>S{s.stepNumber}</span>
                <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{s.name}</span>
                <span style={{ color: 'var(--muted)' }}>{s.owningTeamName}</span>
                <span style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{s.slaDays}d SLA · {s.taskTemplates?.length || 0} tasks</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
