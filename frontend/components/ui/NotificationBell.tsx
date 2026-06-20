'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Bell } from 'lucide-react';
import { USE_MOCK } from '@/lib/mockData';
import { formatDistanceToNow } from 'date-fns';

const TYPE_ICONS: Record<string, string> = {
  task_assigned:         '📋',
  task_overdue:          '⚠️',
  task_completed:        '✅',
  blocker_raised:        '🚫',
  step_advanced:         '🎉',
  extension_request:     '⏰',
  client_status_changed: '🔄',
};

const TYPE_BG: Record<string, string> = {
  task_assigned:         '#f0f9f0',
  task_overdue:          '#fff8f0',
  task_completed:        '#e8f5ee',
  blocker_raised:        '#fff0f0',
  step_advanced:         '#f0f4ff',
  extension_request:     '#fffbf0',
  client_status_changed: '#f5f0ff',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Lightweight unread-count poll every 30s ─────────────────────────────
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ['notif-count'],
    queryFn: () => apiFetch('/api/notifications/unread-count'),
    enabled: !USE_MOCK,
    refetchInterval: 30_000,
    retry: false,
  });
  const unread = countData?.count ?? 0;

  // ── Full notifications list — only fetch when panel is open ─────────────
  const { data: notifs = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    enabled: !USE_MOCK && open,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch('/api/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  if (USE_MOCK) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        id="notification-bell-btn"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: open ? 'var(--olive-50)' : 'none',
          border: 'none',
          cursor: 'pointer',
          width: 36,
          height: 36,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: open ? 'var(--olive)' : 'var(--ink-2)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLElement).style.background = 'none'; }}
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              minWidth: 17,
              height: 17,
              borderRadius: 9,
              background: 'var(--red)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              border: '2px solid var(--surface)',
              animation: 'pulse 2s infinite',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 380,
            maxHeight: 520,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 200,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'modalIn 0.18s ease-out',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: '14px 16px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Notifications
              {unread > 0 && (
                <span
                  style={{
                    background: 'var(--red-bg)',
                    color: 'var(--red)',
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  {unread} unread
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                style={{
                  fontSize: 11.5,
                  color: 'var(--olive)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  padding: '2px 6px',
                  borderRadius: 4,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--olive-50)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                {markAll.isPending ? 'Marking…' : '✓ Mark all read'}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🔔</div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>All caught up!</div>
                <div style={{ fontSize: 12 }}>Notifications will appear here when clients move steps, tasks are assigned, or blockers are raised.</div>
              </div>
            ) : (
              notifs.slice(0, 30).map((n: any) => {
                const icon = TYPE_ICONS[n.type] || '📬';
                const bg = TYPE_BG[n.type] || 'transparent';
                const timeAgo = (() => {
                  try { return formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }); }
                  catch { return ''; }
                })();

                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      cursor: n.isRead ? 'default' : 'pointer',
                      background: n.isRead ? 'transparent' : bg,
                      transition: 'background 0.1s',
                      display: 'flex',
                      gap: 11,
                      alignItems: 'flex-start',
                    }}
                    onMouseEnter={(e) => {
                      if (!n.isRead) (e.currentTarget as HTMLElement).style.filter = 'brightness(0.97)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.filter = 'none';
                    }}
                  >
                    {/* Icon */}
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--ink)',
                          lineHeight: 1.45,
                          marginBottom: 4,
                          fontWeight: n.isRead ? 400 : 500,
                        }}
                      >
                        {n.message}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo}</div>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'var(--olive)',
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                fontSize: 11.5,
                color: 'var(--muted)',
                textAlign: 'center',
              }}
            >
              Showing last {Math.min(notifs.length, 30)} notifications
            </div>
          )}
        </div>
      )}
    </div>
  );
}
