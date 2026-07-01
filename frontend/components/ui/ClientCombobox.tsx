'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface ClientOption {
  id: string;
  label: string;     // display label (brandName || fullName)
  subLabel?: string; // optional secondary text (fullName || status)
}

export function ClientCombobox({
  value, onChange, options, placeholder = 'All clients', disabled,
}: {
  value: string;                          // selected client id, or '' for all
  onChange: (id: string) => void;
  options: ClientOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.subLabel || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }
  }, [open]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) {
      // Small delay so the input is mounted
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 200 }}>
      {/* Trigger */}
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          fontSize: 12.5, background: 'var(--surface)', color: selected ? 'var(--ink)' : 'var(--muted)',
          outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {selected && (
            <span onClick={(e) => { e.stopPropagation(); onChange(''); }}
              style={{ display: 'inline-flex', padding: 2, borderRadius: 3, color: 'var(--soft)', cursor: 'pointer' }}
              title="Clear">
              <X size={11} />
            </span>
          )}
          <ChevronDown size={12} style={{ color: 'var(--soft)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ padding: 8, borderBottom: '1px solid var(--surface-2)', position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client…"
              style={{
                width: '100%', padding: '7px 10px 7px 30px',
                border: '1px solid var(--border)', borderRadius: 5,
                fontSize: 12.5, background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none',
              }}
            />
          </div>
          {/* List */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <div onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', cursor: 'pointer', fontSize: 12.5,
                color: !value ? 'var(--olive)' : 'var(--ink-2)',
                background: !value ? 'var(--olive-50)' : 'transparent',
              }}
              onMouseEnter={(e) => { if (value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              <span style={{ fontWeight: !value ? 600 : 400 }}>All clients</span>
              {!value && <Check size={12} style={{ color: 'var(--olive)' }} />}
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No clients match.</div>
            ) : filtered.map((o) => (
              <div key={o.id}
                onClick={() => { onChange(o.id); setOpen(false); setQuery(''); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', cursor: 'pointer', fontSize: 12.5,
                  background: value === o.id ? 'var(--olive-50)' : 'transparent',
                  borderTop: '1px solid var(--surface-2)',
                }}
                onMouseEnter={(e) => { if (value !== o.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (value !== o.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: value === o.id ? 600 : 400, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.label}
                  </div>
                  {o.subLabel && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{o.subLabel}</div>}
                </div>
                {value === o.id && <Check size={12} style={{ color: 'var(--olive)', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}