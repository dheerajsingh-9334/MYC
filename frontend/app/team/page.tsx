'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const TeamPageContent = dynamic(() => import('./TeamPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Team Directory" subtitle="Staff directory and assignments" />
      <TableSkeleton columnsCount={8} rowsCount={10} hasBulkActions={false} withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function TeamPage() {
  return <TeamPageContent />;
}
