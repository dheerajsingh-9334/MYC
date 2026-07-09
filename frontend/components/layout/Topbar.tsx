'use client';
import { Plus, Search, Pin, Megaphone, Shield, Sun, Moon, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/ui/NotificationBell';
import { getUser, apiFetch } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { USE_MOCK, MOCK_CLIENTS } from '@/lib/mockData';
import { useRouter, usePathname } from 'next/navigation';

const EMPTY_ARRAY: any[] = [];

interface TopbarProps {
  title: string;
  subtitle?: string;
  onAddClient?: () => void;
  showAddClient?: boolean;
  renderActions?: () => React.ReactNode;
}

export default function Topbar({ title, subtitle, onAddClient, showAddClient, renderActions }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [pinnedClients, setPinnedClients] = useState<any[]>([]);
  const [pinnedTasks, setPinnedTasks] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    const loadUser = () => setUser(getUser());
    loadUser();
    window.addEventListener('user-updated', loadUser);
    
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    
    return () => window.removeEventListener('user-updated', loadUser);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const { data: allClients = EMPTY_ARRAY } = useQuery<any[]>({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    enabled: !USE_MOCK && !!user,
  });

  const { data: allTasks = EMPTY_ARRAY } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch('/api/tasks'),
    enabled: !USE_MOCK && !!user,
  });

  const { data: allNotifs = EMPTY_ARRAY, refetch: refetchNotifs } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications'),
    enabled: !USE_MOCK && !!user,
  });

  const updatePinned = () => {
    try {
      const clientIds = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      const taskIds = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');

      const clientsList = USE_MOCK ? MOCK_CLIENTS : allClients;
      const tasksList = USE_MOCK ? [] : allTasks;

      const activePinnedClients = clientsList.filter((c: any) => clientIds.includes(c.id) && c.status !== 'completed');
      const activePinnedTasks = tasksList.filter((t: any) => 
        (taskIds.includes(t.id) || t.isPinned === true) && 
        t.status !== 'complete' && 
        t.status !== 'rejected' && 
        t.status !== 'cancelled'
      );

      // Prevent state updates if values haven't changed
      setPinnedClients(prev => {
        const prevIds = prev.map(c => c.id).join(',');
        const nextIds = activePinnedClients.map(c => c.id).join(',');
        return prevIds === nextIds ? prev : activePinnedClients;
      });

      setPinnedTasks(prev => {
        const prevIds = prev.map(t => t.id).join(',');
        const nextIds = activePinnedTasks.map(t => t.id).join(',');
        return prevIds === nextIds ? prev : activePinnedTasks;
      });

      // Clean up completed/stale pins from localStorage
      const activeClientIds = activePinnedClients.map((c: any) => c.id);
      const activeLocalTaskIds = activePinnedTasks.filter((t: any) => taskIds.includes(t.id)).map((t: any) => t.id);

      if (clientIds.length > 0 && activeClientIds.length !== clientIds.length) {
        localStorage.setItem('pinned_clients', JSON.stringify(activeClientIds));
      }
      if (taskIds.length > 0 && activeLocalTaskIds.length !== taskIds.length) {
        localStorage.setItem('pinned_tasks', JSON.stringify(activeLocalTaskIds));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    updatePinned();
    window.addEventListener('pinned-updated', updatePinned);
    return () => window.removeEventListener('pinned-updated', updatePinned);
  }, [allClients, allTasks]);

  useEffect(() => {
    const activeBroadcasts = allNotifs.filter((n: any) => n.type === 'admin_broadcast' && !n.isRead);
    setBroadcasts(activeBroadcasts);
  }, [allNotifs]);

  const markAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      refetchNotifs();
    } catch (e) {
      console.error(e);
    }
  };

  const unpinClient = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const current = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      const updated = current.filter((x: string) => x !== id);
      localStorage.setItem('pinned_clients', JSON.stringify(updated));
      updatePinned();
      window.dispatchEvent(new Event('pinned-updated'));
    } catch (err) {}
  };

  const unpinTask = async (e: React.MouseEvent, task: any) => {
    e.stopPropagation();
    try {
      const current = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');
      const updated = current.filter((x: string) => x !== task.id);
      localStorage.setItem('pinned_tasks', JSON.stringify(updated));
      
      if (user?.role === 'admin' && task.isPinned) {
        await apiFetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isPinned: false }),
        });
      }
      updatePinned();
      window.dispatchEvent(new Event('pinned-updated'));
    } catch (err) {}
  };

  const hasPinned = pinnedClients.length > 0 || pinnedTasks.length > 0 || broadcasts.length > 0;

  return (
    <div style={{ position: 'sticky', top: 0, width: '100%', zIndex: 100 }}>
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--muted)', borderLeft: '1px solid var(--border)', paddingLeft: 16, marginLeft: 8 }}>
            {subtitle}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Search - decreased size! */}
          <div style={{ position: 'relative', width: 150 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12.5,
                background: 'var(--bg)',
                color: 'var(--ink)',
                outline: 'none',
                height: 32,
                transition: 'all 0.15s',
              }}
            />
          </div>
          <NotificationBell />
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 32,
                padding: '0 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--olive)',
                border: 'none',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
            >
              <Shield size={13} /> Admin Panel
            </Link>
          )}
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          {renderActions && renderActions()}
          {showAddClient && (
            <button
              onClick={onAddClient}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--olive)', color: '#fff', border: 'none',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
            >
              <Plus size={14} /> Add Client
            </button>
          )}
        </div>
      </header>

      {/* Floating Pinned / Broadcast Banner */}
      {hasPinned && (
        <div style={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 18px',
          background: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.2)',
          borderRadius: 12,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          zIndex: 1000,
          maxWidth: 'calc(100% - 40px)',
          width: 'max-content',
          animation: 'slideDown 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--red)', fontSize: 11.5, letterSpacing: '0.5px' }}>
            <Pin size={13} style={{ transform: 'rotate(45deg)', color: 'var(--red)' }} />
            <span>PINNED & ALERTS</span>
          </div>
          
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            {pinnedClients.map(c => (
              <div key={c.id} 
                onClick={() => router.push(`/clients/${c.id}`)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  background: 'var(--olive-50)',
                  color: 'var(--olive-dark)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--olive-100)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.8 }}>CLIENT</span>
                <span style={{ fontWeight: 600 }}>{c.brandName || c.fullName}</span>
                <X size={12} onClick={(e) => unpinClient(e, c.id)} style={{ opacity: 0.6, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'} />
              </div>
            ))}

            {pinnedTasks.map(t => (
              <div key={t.id} 
                onClick={() => router.push(`/clients/${t.clientId}`)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  background: 'var(--blue-50)',
                  color: 'var(--blue-dark)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--blue-100)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.8 }}>TASK</span>
                <span style={{ fontWeight: 600 }}>{t.title}</span>
                {(user?.role === 'admin' || !t.isPinned) && (
                  <X size={12} onClick={(e) => unpinTask(e, t)} style={{ opacity: 0.6, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'} />
                )}
              </div>
            ))}

            {broadcasts.map(b => (
              <div key={b.id} 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  background: 'var(--red)',
                  color: '#fff',
                  padding: '3px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: '1px solid var(--red-dark)',
                  transition: 'all 0.15s',
                }}
              >
                <Megaphone size={12} style={{ color: '#fff' }} />
                <span style={{ fontWeight: 600 }}>{b.message}</span>
                <X size={12} onClick={(e) => markAsRead(e, b.id)}  style={{ opacity: 0.8, cursor: 'pointer', marginLeft: 4 }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.8'} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
