import { StepRow, autoBox, triggerBox, infoBox, Card, TaskItem } from '../PipelineUI';
import StatCard from '@/components/ui/StatCard';
import { deriveSparkline } from '@/lib/sparkline';
import { Mail, CircleCheck, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STEP_DATA = [
  { num: 1, name: 'Client onboarding', team: 'Intake team', sla: 3, teamColor: 'var(--olive)' },
  { num: 2, name: 'Strategy call',     team: 'Sales team',  sla: 5, teamColor: 'var(--blue)' },
  { num: 3, name: 'Brand setup',       team: 'Design team', sla: 7, teamColor: '#6B3FA0' },
  { num: 4, name: 'Funnel build',      team: 'Tech team',   sla: 10, teamColor: 'var(--olive)' },
  { num: 5, name: 'Ad creative',       team: 'Creative team', sla: 7, teamColor: 'var(--amber)' },
  { num: 6, name: 'Ad launch',         team: 'Media buyer', sla: 5, teamColor: 'var(--blue)' },
  { num: 7, name: 'Automation setup',  team: 'Automation team', sla: 5, teamColor: '#6B3FA0' },
  { num: 8, name: 'Event prep',        team: 'Event team',  sla: 7, teamColor: 'var(--green)' },
  { num: 9, name: 'Event launch',      team: 'All teams',   sla: 1, teamColor: 'var(--green)' },
];

export default function OverviewTab({ stats, steps, clients }: { stats: any; steps: any[]; clients: any[] }) {
  const router = useRouter();
  const liveSteps = steps.length > 0 ? steps : STEP_DATA.map(s => ({ ...s, stepNumber: s.num, name: s.name, owningTeamName: s.team, slaDays: s.sla }));

  return (
    <div>
      {/* Stats */}
      <div className="stat-grid">
        <StatCard label="Steps" value={9} accent="var(--olive)" trend="Defined" trendType="neutral" />
        <StatCard label="Roles" value={3} accent="var(--blue)" trend="Defined" trendType="neutral" />
        <StatCard label="Auto triggers" value={5} accent="var(--green)" trend="Wired" trendType="up" />
        <StatCard label="Manual gate" value={1} accent="var(--amber)" trend="Admin approval" trendType="warn" />
      </div>

      {/* Live stats row */}
      {stats && (
        <div className="stat-grid">
          <StatCard label="Active clients" value={stats.total ?? '—'} accent="var(--olive)" trend="In pipeline" trendType="up" sparklineData={deriveSparkline('active_overview', clients)} />
          <StatCard label="On track" value={stats.onTrack ?? '—'} accent="var(--green)" trend="On schedule" trendType="up" sparklineData={deriveSparkline('ontrack_overview', clients)} />
          <StatCard label="Due today" value={stats.dueToday ?? '—'} accent="var(--amber)" trend="Needs check-in" trendType="warn" sparklineData={deriveSparkline('due_overview', clients)} />
          <StatCard label="Overdue" value={stats.overdue ?? '—'} accent="var(--red)" trend="Past SLA" trendType="down" sparklineData={deriveSparkline('overdue_overview', clients)} />
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        {[
          { color: 'var(--olive)', label: 'Admin action' },
          { color: 'var(--blue)',  label: 'Team member action' },
          { color: '#6B3FA0',      label: 'Client action' },
          { color: 'var(--green)', label: 'System auto-trigger' },
          { color: 'var(--amber)', label: 'SLA / cron alert' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Pipeline steps */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 20 }}>Full 9-step pipeline flow</div>

        {/* Invite row */}
        <StepRow number={<Mail size={14} />} name="Invite sent" meta="Admin sends onboarding link → client fills self-service form (~8 min)" dotStyle="active">
          {autoBox('Client submits form → application appears in Onboarding Review queue automatically')}
        </StepRow>

        {/* Manual gate */}
        <StepRow number={<CircleCheck size={14} />} name="Manual approval gate" meta="Admin reviews application — approves, requests info, or rejects" dotStyle="trigger">
          {triggerBox('Only gate in the entire pipeline where a human must act before the system proceeds')}
          {autoBox('On approve → client profile created, pipeline starts at Step 1, Intake Team notified instantly')}
        </StepRow>

        {/* Steps 1–9 */}
        {liveSteps.map((step: any, i: number) => {
          const isLast = i === liveSteps.length - 1;
          const stepNum = step.stepNumber || step.num;
          const teamName = step.owningTeamName || step.team;
          const sla = step.slaDays || step.sla;
          const liveCount = clients.filter((c: any) => c.currentStep?.stepNumber === stepNum).length;
          return (
            <StepRow key={stepNum} number={stepNum} isLast={isLast}
              name={`Step ${stepNum} — ${step.name}`}
              meta={`${teamName} · ${sla} days SLA`}
              dotStyle={isLast ? 'done' : 'upcoming'}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 4, background: 'var(--olive-50)', color: 'var(--olive-dark)', fontWeight: 600, border: '1px solid var(--olive-100)' }}>
                  {teamName} · {sla}d SLA
                </span>
                {liveCount > 0 && (
                  <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 4, background: 'var(--amber-bg)', color: 'var(--amber)', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => router.push('/dashboard')}>
                    {liveCount} client{liveCount !== 1 ? 's' : ''} here now <ArrowRight size={10} />
                  </span>
                )}
              </div>
              {isLast && autoBox('All Step 9 tasks complete → client status set to Completed automatically')}
              {stepNum === 1 && autoBox('All tasks complete → system auto-advances to Step 2, no manager action needed')}
            </StepRow>
          );
        })}
      </div>
    </div>
  );
}
