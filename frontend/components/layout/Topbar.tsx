'use client';
import { Plus, Search, Pin, Megaphone, Shield, Sun, Moon, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import NotificationBell from '@/components/ui/NotificationBell';
import { getUser, apiFetch } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { USE_MOCK, MOCK_CLIENTS } from '@/lib/mockData';
import { useRouter, usePathname } from 'next/navigation';
import AddClientModal from '@/components/pipeline/AddClientModal';
import CSVImportModal from '@/components/ui/CSVImportModal';

const EMPTY_ARRAY: any[] = [];

interface TopbarProps {
  title: string;
  subtitle?: string;
  onAddClient?: () => void;
  showAddClient?: boolean;
  actionLabel?: string;
  renderActions?: () => React.ReactNode;
  search?: string;
  setSearch?: (val: string) => void;
}

export default function Topbar({ title, subtitle, onAddClient, showAddClient, actionLabel, renderActions, search, setSearch }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const [localSearch, setLocalSearch] = useState('');
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [pinnedClients, setPinnedClients] = useState<any[]>([]);
  const [pinnedTasks, setPinnedTasks] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  // Modals state
  const [showModal, setShowModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [hoveredTask, setHoveredTask] = useState<any | null>(null);
  const [hoveredTaskPosition, setHoveredTaskPosition] = useState<{ x: number, y: number } | null>(null);

  // Export options state
  const [exportType, setExportType] = useState('clients');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');
  const [expStepId, setExpStepId] = useState('');
  const [expStatus, setExpStatus] = useState('');
  const [expIncludeArchived, setExpIncludeArchived] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

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

  const { data: stepsList = EMPTY_ARRAY } = useQuery<any[]>({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    retry: false,
    enabled: !USE_MOCK && !!user,
  });

  const updatePinned = () => {
    try {
      const clientIds = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      const taskIds = JSON.parse(localStorage.getItem('pinned_tasks') || '[]');

      const clientsList = USE_MOCK ? MOCK_CLIENTS : allClients;
      const tasksList = USE_MOCK ? [] : allTasks;

      const activePinnedClients = clientsList.filter((c: any) => (clientIds.includes(c.id) || c.isPinned === true) && c.status !== 'completed');
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

  const unpinClient = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const current = JSON.parse(localStorage.getItem('pinned_clients') || '[]');
      const updated = current.filter((x: string) => x !== id);
      localStorage.setItem('pinned_clients', JSON.stringify(updated));
      
      if (user?.role === 'admin') {
        await apiFetch(`/api/clients/${id}/unpin`, {
          method: 'PATCH'
        });
      }
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
        <div style={{ minWidth: 0, flexShrink: 1 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 11, color: 'var(--soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </p>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {/* Search - decreased size! */}
          <div style={{ position: 'relative', width: 180 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
            <input
              type="text"
              placeholder="Search..."
              value={search !== undefined ? search : localSearch}
              onChange={(e) => setSearch ? setSearch(e.target.value) : setLocalSearch(e.target.value)}
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
                padding: '0 12px',
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

          {/* Consistent Client Management Buttons for Admin */}
          {user?.role === 'admin' && pathname === '/clients' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  setExportType('clients');
                  setShowExportModal(true);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
              >
                Export Clients
              </button>
              <button
                onClick={() => setShowCSVModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
              >
                Upload CSV
              </button>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--olive)', color: '#fff', border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
              >
                <Plus size={13} /> Add Client
              </button>
            </div>
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
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredTask(t);
                  setHoveredTaskPosition({ x: rect.left, y: rect.bottom });
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  setHoveredTask(null);
                  setHoveredTaskPosition(null);
                }}
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

      {/* Global Add Client Modal */}
      <AddClientModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['clients'] });
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
      />

      {/* Global CSV Import Modal */}
      <CSVImportModal
        open={showCSVModal}
        onClose={() => setShowCSVModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['clients'] });
          qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
        endpoint="/api/clients/import"
        title="Import Clients from CSV"
        templateLabel="Clients"
        templateColumns={['client_name', 'current_step_number', 'email', 'whatsapp', 'date_joined']}
      />

      {/* Global Export Modal */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowExportModal(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Export Clients Report</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Filter and download detailed reports for clients in CSV or PDF.</div>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
              
              {/* Select export type */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>Select Export Format</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {[
                    { type: 'clients', label: 'Clients List', desc: 'Summary list of onboarding details' },
                    { type: 'projects', label: 'Projects Portfolio', desc: 'Status, priority, manager, and completion rates' },
                    { type: 'tasks', label: 'Tasks List', desc: 'Detailed task assignments, due dates, and statuses' },
                    { type: 'client_full', label: 'Client Full Report', desc: 'Task counts & active steps' }
                  ].map((item) => (
                    <button
                      key={item.type}
                      onClick={() => setExportType(item.type)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius)',
                        border: `1.5px solid ${exportType === item.type ? 'var(--olive)' : 'var(--border)'}`,
                        background: exportType === item.type ? 'var(--olive-50)' : 'var(--surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters Section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 18 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Filter Options</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Onboarded After</label>
                    <input type="date" value={expStartDate} onChange={e => setExpStartDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Onboarded Before</label>
                    <input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }} />
                  </div>

                  {/* Step Filter */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Current Step</label>
                    <select value={expStepId} onChange={e => setExpStepId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                      <option value="">All Steps</option>
                      {stepsList.map((s: any) => (
                        <option key={s.id} value={s.id}>Step {s.stepNumber}: {s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Client Status</label>
                    <select value={expStatus} onChange={e => setExpStatus(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)' }}>
                      <option value="">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="churned">Churned / Archived</option>
                    </select>
                  </div>

                  {/* Include Archived checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22, gridColumn: 'span 2' }}>
                    <input type="checkbox" id="expIncludeArchived" checked={expIncludeArchived} onChange={e => setExpIncludeArchived(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--olive)' }} />
                    <label htmlFor="expIncludeArchived" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)', cursor: 'pointer' }}>Include Archived / Churned Clients</label>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, flexShrink: 0, background: 'var(--surface-2)' }}>
              <button onClick={() => setShowExportModal(false)}
                style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
                Cancel
              </button>
              <button onClick={() => { setExportFormat('csv'); setTimeout(() => {
                const params = new URLSearchParams();
                params.set('format', 'csv');
                params.set('type', exportType);
                if (expStartDate) params.set('startDate', expStartDate);
                if (expEndDate) params.set('endDate', expEndDate);
                if (expStepId) params.set('stepId', expStepId);
                if (expStatus) params.set('status', expStatus);
                if (expIncludeArchived) params.set('includeArchived', 'true');
                const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                if (token) params.set('token', token);
                const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                const link = document.createElement('a');
                link.href = url;
                link.download = `${exportType}_export_${Date.now()}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }, 50); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
                <Download size={14} /> Download CSV
              </button>
              <button onClick={() => { setExportFormat('pdf'); setTimeout(() => {
                const params = new URLSearchParams();
                params.set('format', 'pdf');
                params.set('type', exportType);
                if (expStartDate) params.set('startDate', expStartDate);
                if (expEndDate) params.set('endDate', expEndDate);
                if (expStepId) params.set('stepId', expStepId);
                if (expStatus) params.set('status', expStatus);
                if (expIncludeArchived) params.set('includeArchived', 'true');
                const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
                if (token) params.set('token', token);
                const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/export?${params.toString()}`;
                window.open(url, '_blank');
              }, 50); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Download size={14} /> Print PDF Report
              </button>
            </div>

          </div>
        </div>
      )}
      {hoveredTask && hoveredTaskPosition && (
        <div style={{
          position: 'fixed',
          top: hoveredTaskPosition.y + 6,
          left: Math.max(10, Math.min(hoveredTaskPosition.x, typeof window !== 'undefined' ? window.innerWidth - 270 : hoveredTaskPosition.x)),
          width: 260,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
          padding: '12px 14px',
          zIndex: 9999,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            {hoveredTask.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px 12px', fontSize: 11.5 }}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Assignee:</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{hoveredTask.assignedTo?.fullName || 'Unassigned'}</span>
            
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Team:</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{hoveredTask.assignedTo?.teamName || '—'}</span>
            
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Assigned:</span>
            <span style={{ color: 'var(--ink)' }}>{hoveredTask.createdAt ? new Date(hoveredTask.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
            
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Due Date:</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {hoveredTask.dueDate ? new Date(hoveredTask.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
