'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { ReportsPageSkeleton } from '@/components/ui/SkeletonLoader';

const ReportsPageContent = dynamic(() => import('./ReportsPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Operations & Business Analytics" subtitle="Generate data-driven client, team, and employee performance audits" />
      <ReportsPageSkeleton />
    </AppLayout>
  ),
  ssr: false,
});

export default function ReportsPage() {
  return <ReportsPageContent />;
}
