// Shared pipeline UI primitives reused across all tabs

export const pill = (label: string, color: string, bg: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: bg, color }}>{label}</span>
);

export const autoBox = (text: string) => (
  <div style={{ background: 'var(--green-bg)', border: '0.5px solid #B0DCC0', borderLeft: '3px solid var(--green)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12.5, color: '#1A5535', marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}>
    <span>⚡</span><span>{text}</span>
  </div>
);

export const triggerBox = (text: string) => (
  <div style={{ background: 'var(--amber-bg)', border: '0.5px solid #F0D9A0', borderLeft: '3px solid var(--amber)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12.5, color: '#5C4400', marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}>
    <span>🔒</span><span>{text}</span>
  </div>
);

export const infoBox = (text: string) => (
  <div style={{ background: 'var(--blue-bg)', border: '0.5px solid #B0C8E0', borderLeft: '3px solid var(--blue)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12.5, color: '#1A3A5C', marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}>
    <span>ℹ️</span><span>{text}</span>
  </div>
);

interface StepRowProps {
  number: React.ReactNode;
  name: string;
  meta: string;
  dotStyle?: 'active' | 'done' | 'trigger' | 'upcoming';
  isLast?: boolean;
  children?: React.ReactNode;
}

export function StepRow({ number, name, meta, dotStyle = 'upcoming', isLast, children }: StepRowProps) {
  const dotColors: Record<string, { bg: string; color: string; border: string; shadow?: string }> = {
    active:  { bg: 'var(--olive)',     color: '#fff',            border: 'var(--olive)',  shadow: '0 0 0 4px var(--olive-100)' },
    done:    { bg: 'var(--green-bg)',  color: 'var(--green)',    border: 'var(--green)' },
    trigger: { bg: 'var(--amber-bg)', color: 'var(--amber)',    border: 'var(--amber)' },
    upcoming:{ bg: 'var(--surface-2)',color: 'var(--muted)',    border: 'var(--border)' },
  };
  const d = dotColors[dotStyle];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: '0 12px', position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, background: d.bg, color: d.color, border: `1.5px solid ${d.border}`, boxShadow: d.shadow, zIndex: 1 }}>
          {number}
        </div>
        {!isLast && <div style={{ width: 1.5, flex: 1, background: dotStyle === 'done' ? 'var(--green)' : 'var(--border)', minHeight: 16 }} />}
      </div>
      <div style={{ paddingBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', paddingTop: 7, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>{meta}</div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', ...style }}>
      {children}
    </div>
  );
}

export function TaskItem({ done, label, tag, tagColor, tagBg }: { done?: boolean; label: string; tag?: string; tagColor?: string; tagBg?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--ink)', padding: '3px 0' }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: done ? 'var(--green-bg)' : 'var(--surface-2)', border: `1px solid ${done ? 'var(--green)' : 'var(--border)'}`, color: done ? 'var(--green)' : 'transparent' }}>
        {done && '✓'}
      </div>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{label}</span>
      {tag && <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 4, fontWeight: 600, background: tagBg || 'var(--surface-2)', color: tagColor || 'var(--muted)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{tag}</span>}
    </div>
  );
}
