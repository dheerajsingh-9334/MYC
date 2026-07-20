'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { DashboardSkeleton } from '@/components/ui/SkeletonLoader';

const AdminDashboard = dynamic(() => import('./AdminDashboard'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Admin Dashboard" subtitle="Org-wide view · Tasks, teams, performance" />
      <DashboardSkeleton />
    </AppLayout>
  ),
  ssr: false,
});

export default function AdminPage() {
  return <AdminDashboard />;
}
