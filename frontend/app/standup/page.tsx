'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const StandupPageContent = dynamic(() => import('./StandupPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Standup Board" subtitle="Daily standup brief" />
      <TableSkeleton columnsCount={5} rowsCount={10} hasBulkActions={false} withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function StandupPage() {
  return <StandupPageContent />;
}
