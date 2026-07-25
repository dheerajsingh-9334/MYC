'use client';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { ManageStepsPanel } from '@/app/settings/steps/page';

export default function ServiceConfigPage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.id as string;

  const { data: service, isLoading } = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => apiFetch(`/api/services/${serviceId}`),
  });

  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
  });

  const teamsListNames = (teamsList || []).map((t: any) => t.name || String(t));

  if (isLoading) return <AppLayout withHeader={false}><div style={{ padding: 40 }}>Loading...</div></AppLayout>;
  if (!service) return <AppLayout withHeader={false}><div style={{ padding: 40 }}>Service not found</div></AppLayout>;

  return (
    <AppLayout withHeader={false}>
      <Topbar 
        title={service.name} 
        subtitle="Configure steps and tasks for this service"
        leftAction={
          <button onClick={() => router.push('/services')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={16} /> Back
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column' }}>
        <ManageStepsPanel
          serviceId={serviceId}
          clientName={service.name}
          teamsList={teamsListNames}
          onClearSelection={() => {}}
        />
      </div>
    </AppLayout>
  );
}
