'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { USE_MOCK } from '@/lib/mockData';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (USE_MOCK) { router.push('/dashboard'); return; }
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    router.push(token ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
