'use client';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import NotificationBell from '@/components/ui/NotificationBell';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onAddClient?: () => void;
  showAddClient?: boolean;
  renderActions?: () => React.ReactNode;
}

export default function Topbar({ title, subtitle, onAddClient, showAddClient, renderActions }: TopbarProps) {
  const [search, setSearch] = useState('');

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 13, color: 'var(--muted)', borderLeft: '1px solid var(--border)', paddingLeft: 16, marginLeft: 8 }}>
          {subtitle}
        </div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
          <input
            type="text"
            placeholder="Search clients, tasks, teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              background: 'var(--bg)',
              color: 'var(--ink)',
              outline: 'none',
              transition: 'all 0.15s',
            }}
          />
        </div>
        <NotificationBell />
        {renderActions && renderActions()}
        {showAddClient && (
          <button
            onClick={onAddClient}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
              background: 'var(--olive)', color: '#fff',
              fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <Plus size={14} /> Add Client
          </button>
        )}
      </div>
    </header>
  );
}
