'use client';

import dynamic from 'next/dynamic';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const NotificationsPageContent = dynamic(() => import('./NotificationsPageContent'), {
  loading: () => <TableSkeleton columnsCount={4} rowsCount={10} hasBulkActions={false} />,
  ssr: false,
});

export default function NotificationsPage() {
  return <NotificationsPageContent />;
}
