'use client';
import type { CSSProperties, ReactNode } from 'react';

/**
 * SectionCard
 * ─────────────────────────────────────────────────────────────────
 * The `var(--surface) var(--border) var(--radius)` chrome that wraps
 * every section on every page — table card, 9-things panel, week
 * panel, etc. Replaces the duplicated inline `background/border/
 * borderRadius/overflow:hidden` block that used to be inlined
 * across all routes.
 *
 * Pass `title` + optional `subtitle` to get a header row. Use
 * `action` for right-aligned header content (a link, button, chip).
 * `padding` controls the body padding — pass 0 for full-bleed
 * tables.
 */
export interface SectionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  padding?: number | string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function SectionCard({
  title, subtitle, action, padding = 0, children, className, style,
}: SectionCardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={{ padding, ...(style?.display === 'flex' ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : {}) }}>
        {children}
      </div>
    </div>
  );
}
