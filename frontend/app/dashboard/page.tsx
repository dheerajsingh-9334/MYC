'use client';
import { useState, useEffect, Suspense } from 'react';
import { getUser } from '@/lib/api';
import { useRouter } from 'next/navigation';
import StaffDashboard from './StaffDashboard';

function DashboardContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const u = getUser();
    setUser(u);
    setLoading(false);
    if (u?.role === 'admin') {
      router.replace('/admin');
    }
  }, [router]);

  if (loading || user?.role === 'admin') {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  }

  return <StaffDashboard />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
      <DashboardContent />
    </Suspense>
  );
}

