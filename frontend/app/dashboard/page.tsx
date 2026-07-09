'use client';
import { useState, useEffect, Suspense } from 'react';
import { getUser } from '@/lib/api';
import StaffDashboard from './StaffDashboard';

function DashboardContent() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getUser());
    setLoading(false);
  }, []);

  if (loading) {
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
