'use client';
import { useState, useEffect, Suspense } from 'react';
import { getUser } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { DashboardSkeleton } from '@/components/ui/SkeletonLoader';

const StaffDashboard = dynamic(() => import('./StaffDashboard'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Dashboard" subtitle="My tasks and timeline" />
      <DashboardSkeleton />
    </AppLayout>
  ),
  ssr: false,
});

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
    return (
      <AppLayout>
        <Topbar title="Dashboard" subtitle="My tasks and timeline" />
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  return <StaffDashboard />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <Topbar title="Dashboard" subtitle="My tasks and timeline" />
        <DashboardSkeleton />
      </AppLayout>
    }>
      <DashboardContent />
    </Suspense>
  );
}


