'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const WorkloadPageContent = dynamic(() => import('./WorkloadPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Workload Distribution" subtitle="Team load and task allocations" />
      <TableSkeleton columnsCount={7} rowsCount={12} hasBulkActions={false} withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function WorkloadPage() {
  return <WorkloadPageContent />;
}
