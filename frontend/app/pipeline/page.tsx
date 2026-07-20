'use client';

import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { PipelineSkeleton } from '@/components/ui/SkeletonLoader';

const PipelinePageContent = dynamic(() => import('./PipelinePageContent'), {
  loading: () => (
    <AppLayout>
      <Topbar title="Pipeline" subtitle="Onboarding progress kanban board" />
      <PipelineSkeleton withHeader={false} />
    </AppLayout>
  ),
  ssr: false,
});

export default function PipelinePage() {
  return <PipelinePageContent />;
}
