'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';

const VaultPageContent = dynamic(() => import('./VaultPageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Document Vault" subtitle="Secure document repository" />
      <TableSkeleton columnsCount={5} rowsCount={8} hasBulkActions={false} withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function VaultPage() {
  return <VaultPageContent />;
}
