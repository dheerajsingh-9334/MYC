'use client';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { ClientDetailSkeleton } from '@/components/ui/SkeletonLoader';

const ClientDetailPane = dynamic(() => import('@/components/pipeline/ClientDetailPane'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Client Details" subtitle="Client profile, timeline and step history" />
      <ClientDetailSkeleton withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function ClientDetailPage() {
  const { id } = useParams();
  
  return (
    <ClientDetailPane id={String(id)} />
  );
}
