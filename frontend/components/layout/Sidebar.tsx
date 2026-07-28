'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearTokens, getUser } from '@/lib/api';
import {
  LayoutDashboard, Sun, CheckSquare, Users, Settings,
  TrendingUp, LogOut, GitBranch, Shield, UserCheck,
  FolderLock, Activity, BarChart3, Bell, X, Layers, StickyNote, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { USE_MOCK } from '@/lib/mockData';
import ProfileModal from './ProfileModal';

const MOCK_USER = { fullName: 'Ambesh Kumar', role: 'admin', teamName: null };

/**
 * Role hierarchy:
 *   admin       — full access
 *   team_leader — workspace + their team view; NO step config, NO create users
 *   team_member — my tasks + client view only
 */
const navItems = [
  // Workspace section
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', section: 'workspace', roles: ['admin', 'team_leader', 'team_member'] },
  { label: 'Standup Brief', icon: Sun, href: '/standup', section: 'workspace', roles: ['admin'] },
  { label: 'Tasks', icon: CheckSquare, href: '/tasks', section: 'workspace', roles: ['admin', 'team_leader', 'team_member'] },
  { label: 'Clients', icon: GitBranch, href: '/clients', section: 'workspace', roles: ['admin'] },
  { label: 'Vault', icon: FolderLock, href: '/vault', section: 'workspace', roles: ['admin', 'team_leader', 'team_member'] },
  { label: 'Workload', icon: Activity, href: '/workload', section: 'workspace', roles: ['admin', 'team_leader'] },
  { label: 'Notes', icon: StickyNote, href: '/notes', section: 'workspace', roles: ['admin', 'team_leader', 'team_member'] },
  // Manage section
  // { label: 'Reports', icon: BarChart3, href: '/reports', section: 'manage', roles: ['admin', 'team_leader'] },
  { label: 'Services', icon: Layers, href: '/services', section: 'manage', roles: ['admin'] },
  { label: 'Team', icon: Users, href: '/team', section: 'manage', roles: ['admin', 'team_leader'] },
  // { label: 'Performance',     icon: TrendingUp,       href: '/performance',     section: 'manage',    roles: ['admin'] },

];

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'Admin', color: 'var(--olive)', bg: 'var(--olive-50)' },
  team_leader: { label: 'Team Leader', color: '#2860A1', bg: '#EBF3FB' },
  team_member: { label: 'Team', color: 'var(--muted)', bg: 'var(--surface-2)' },
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(USE_MOCK ? MOCK_USER : null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed');
      if (saved === 'true') {
        setIsCollapsed(true);
        document.body.classList.add('sidebar-collapsed');
      }
    }
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
    if (next) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  };

  useEffect(() => {
    if (!USE_MOCK) {
      const loadUser = () => setUser(getUser());
      loadUser();
      window.addEventListener('user-updated', loadUser);
      return () => window.removeEventListener('user-updated', loadUser);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('sidebar-mobile-open');
    }
  }, [pathname]);

  const handleLogout = () => {
    clearTokens();
    router.push('/login');
  };

  const role = user?.role || 'team_member';
  const initials = user?.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?';
  const roleBadge = ROLE_BADGE[role] || ROLE_BADGE.team_member;

  const visibleItems = (section: string) =>
    navItems.filter((i) => i.section === section && i.roles.includes(role));

  const workspaceItems = visibleItems('workspace').map(item => {
    if (item.label === 'Dashboard' && role === 'admin') {
      return { ...item, href: '/admin' };
    }
    return item;
  });
  const manageItems = visibleItems('manage');

  const NavLink = ({ item, index }: { item: typeof navItems[0]; index: number }) => {
    const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href + '/'));
    return (
      <Link href={item.href}
        className={`sidebar-link ${active ? 'active' : ''}`}
        title={isCollapsed ? item.label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '9px 12px 9px 16px',
          borderRadius: '0 8px 8px 0',
          color: active ? 'var(--olive)' : 'var(--ink-2)',
          background: active ? 'var(--olive-50)' : 'transparent',
          fontSize: 13.5,
          fontWeight: active ? 600 : 500,
          textDecoration: 'none',
          position: 'relative',
          borderLeft: active ? '3px solid var(--olive)' : '3px solid transparent',
        }}
      >
        <item.icon size={16} className="sidebar-icon" style={{ flexShrink: 0, transition: 'transform 0.2s ease' }} />
        <span className="sidebar-nav-label" style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="sidebar-container" style={{
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      padding: '0 0 20px 0', position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column', width: 'var(--sidebar-w)', flexShrink: 0,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Brand */}
      <div className="sidebar-brand-container" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 20px',
        height: '56px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
        boxSizing: 'border-box',
        justifyContent: 'space-between',
        transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: 'var(--olive)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', letterSpacing: '0.5px' }}>M</div>
          <div className="sidebar-brand-text" style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 19, color: 'var(--ink)', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
            MYC OS
          </div>
        </div>
        
        {/* Toggle Collapse Desktop */}
        <button
          onClick={toggleCollapse}
          className="desktop-sidebar-collapse"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <button
          className="mobile-sidebar-close"
          onClick={() => {
            if (typeof document !== 'undefined') {
              document.body.classList.remove('sidebar-mobile-open');
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'none',
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Role context banner (for non-admin) */}
      {role !== 'admin' && user?.teamName && (
        <div className="sidebar-role-badge" style={{
          margin: '0 12px 14px', padding: '8px 10px',
          background: roleBadge.bg, borderRadius: 8,
          fontSize: 11.5, color: roleBadge.color, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {role === 'team_leader' ? <UserCheck size={13} /> : <Shield size={13} />}
          <span>{user.teamName}</span>
        </div>
      )}

      {/* Workspace Nav */}
      <div className="sidebar-section-title" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', color: 'var(--soft)', padding: '0 20px 6px', textTransform: 'uppercase' }}>Workspace</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px' }}>
        {workspaceItems.map((item, idx) => <NavLink key={item.href} item={item} index={idx} />)}
      </nav>

      {/* Manage Nav */}
      {manageItems.length > 0 && (
        <>
          <div className="sidebar-section-title" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.2px', color: 'var(--soft)', padding: '20px 20px 6px', textTransform: 'uppercase' }}>Manage</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px' }}>
            {manageItems.map((item, idx) => <NavLink key={item.href} item={item} index={workspaceItems.length + idx} />)}
          </nav>
        </>
      )}

      {/* Footer / User profile */}
      <div className="sidebar-footer" style={{ marginTop: 'auto', padding: '10px 16px', borderTop: '1px solid var(--border)', transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 0.15s',
        }}
          onClick={() => setShowProfileModal(true)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--olive-50)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName || 'User'}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  objectFit: 'cover', border: role === 'team_member' ? '1.5px solid var(--border)' : 'none',
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const sibling = e.currentTarget.nextSibling as HTMLElement;
                  if (sibling) sibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: role === 'admin' ? 'linear-gradient(135deg, var(--olive), var(--olive-light))'
                : role === 'team_leader' ? 'linear-gradient(135deg, #2860A1, #5B9BD5)'
                  : 'var(--surface-2)',
              color: '#fff', display: user?.avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12, border: role === 'team_member' ? '1.5px solid var(--border)' : 'none',
            }}>
              {initials}
            </div>
          </div>
          <div className="sidebar-user-details" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || 'Guest'}</div>
            <div style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2, padding: '1px 6px', borderRadius: 6, background: roleBadge.bg, color: roleBadge.color, fontWeight: 600 }}>
              {roleBadge.label}
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={(e) => { e.stopPropagation(); handleLogout(); }} title="Logout" style={{ color: 'var(--soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
      <ProfileModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onUpdateSuccess={(updatedUser) => setUser(updatedUser)}
      />
    </aside>
  );
}
