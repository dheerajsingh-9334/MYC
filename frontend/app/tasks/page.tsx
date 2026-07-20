'use client';

import dynamic from 'next/dynamic';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const TasksPageContent = dynamic(() => import('./TasksPageContent'), {
  loading: () => <TableSkeleton columnsCount={5} rowsCount={8} hasBulkActions={false} />,
  ssr: false,
});

export default function TasksPage() {
  return <TasksPageContent />;
}
