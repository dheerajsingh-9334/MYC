interface StatusBadgeProps {
  status: 'on_track' | 'due_today' | 'overdue' | 'blocked' | string;
}

const config: Record<string, { label: string; bg: string; color: string }> = {
  on_track:  { label: 'On track',  bg: 'var(--green-bg)',  color: 'var(--green)' },
  due_today: { label: 'Due today', bg: 'var(--amber-bg)',  color: 'var(--amber)' },
  overdue:   { label: 'Overdue',   bg: 'var(--red-bg)',    color: 'var(--red)' },
  blocked:   { label: 'Blocked',   bg: '#F0E8FA',          color: '#6B3FA0' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const c = config[status] || config['on_track'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 9px', borderRadius: 5,
      fontSize: 11.5, fontWeight: 600, letterSpacing: '0.2px',
      background: c.bg, color: c.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}
