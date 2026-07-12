'use client';
import ClientDetailPane from '@/components/pipeline/ClientDetailPane';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';

export default function ClientDetailPage() {
  const { id } = useParams();
  
  return (
    <ClientDetailPane id={String(id)} />
  );
}
