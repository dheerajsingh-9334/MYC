'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { USE_MOCK } from '@/lib/mockData';
import { apiFetch } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (USE_MOCK) return; // skip auth check in demo mode
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    } else {
      // Background fetch to keep user role fresh across reloads
      apiFetch('/api/auth/me').then(freshUser => {
        localStorage.setItem('user', JSON.stringify(freshUser));
        // Optionally trigger a custom event if we want components to re-render immediately
        window.dispatchEvent(new Event('user-updated'));
      }).catch(err => console.error('Failed to refresh user:', err));
    }
  }, [router]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div
        className="sidebar-overlay"
        onClick={() => {
          if (typeof document !== 'undefined') {
            document.body.classList.remove('sidebar-mobile-open');
          }
        }}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
