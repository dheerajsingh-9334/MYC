'use client';
import { useEffect, useRef, useState, ReactNode } from 'react';
import { Pencil } from 'lucide-react';

export interface DropdownAction {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  target?: string;
  danger?: boolean;
  disabled?: boolean;
}

interface ActionDropdownProps {
  actions: DropdownAction[];
  align?: 'left' | 'right';
}

export default function ActionDropdown({ actions, align = 'right' }: ActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open]);

  const activeActions = actions.filter((action) => action !== null && action !== undefined);

  if (activeActions.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button: Standard Pencil Icon */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{
          width: 28,
          height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: open ? 'var(--surface-2)' : 'var(--surface)',
          color: open ? 'var(--olive)' : 'var(--ink-2)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--olive)';
          e.currentTarget.style.color = 'var(--olive)';
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--ink-2)';
          }
        }}
        title="Actions"
      >
        <Pencil size={13} />
      </button>

      {/* Dropdown Popover */}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align === 'left' ? 'left' : 'right']: 0,
            zIndex: 9999, // Ensure it floats on top of other content
            minWidth: 160,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            padding: '4px 0',
            overflow: 'hidden',
            animation: 'fadeIn 0.1s ease-out',
          }}
        >
          {activeActions.map((action, idx) => {
            const handleItemClick = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (action.disabled) {
                e.preventDefault();
                return;
              }
              setOpen(false);
              if (action.onClick) {
                action.onClick();
              }
            };

            const itemStyle: React.CSSProperties = {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              fontSize: '12.5px',
              fontWeight: 500,
              color: action.danger ? 'var(--red)' : 'var(--ink-2)',
              textAlign: 'left',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.5 : 1,
              textDecoration: 'none',
              boxSizing: 'border-box',
              transition: 'background 0.12s, color 0.12s',
            };

            const content = (
              <>
                {action.icon && (
                  <span style={{ display: 'inline-flex', flexShrink: 0, color: 'inherit' }}>
                    {action.icon}
                  </span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {action.label}
                </span>
              </>
            );

            if (action.href) {
              return (
                <a
                  key={idx}
                  href={action.href}
                  target={action.target}
                  rel={action.target === '_blank' ? 'noreferrer' : undefined}
                  style={itemStyle}
                  onClick={handleItemClick}
                  onMouseEnter={(e) => {
                    if (!action.disabled) {
                      e.currentTarget.style.background = action.danger ? 'var(--red-bg)' : 'var(--surface-2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                key={idx}
                type="button"
                style={itemStyle}
                onClick={handleItemClick}
                onMouseEnter={(e) => {
                  if (!action.disabled) {
                    e.currentTarget.style.background = action.danger ? '#FBEEF1' : 'var(--surface-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
