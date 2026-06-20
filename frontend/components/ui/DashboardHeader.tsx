'use client';

/**
 * DashboardHeader
 * ─────────────────────────────────────────────────────────────────
 * The page-title row used across Dashboard, Standup, Clients, Tasks,
 * Team, Pipeline, and Admin. Sits between <Topbar> and the page body.
 *
 * - Instrument Serif 32px title + 13.5px muted subtitle.
 * - Right cluster: caller-provided actions (Export, Filters, Add
 *   buttons, etc.) passed as children.
 */
export interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function DashboardHeader({ title, subtitle, children }: DashboardHeaderProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 32, color: 'var(--ink)',
            letterSpacing: '-0.3px', lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}