'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const ClientsPageContent = dynamic(() => import('./ClientsPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Clients" subtitle="Manage your client portfolio" />
      <TableSkeleton columnsCount={7} rowsCount={8} hasBulkActions={true} withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function ClientsPage() {
  return <ClientsPageContent />;
}
