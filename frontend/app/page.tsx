'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { USE_MOCK } from '@/lib/mockData';
import { getUser } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (USE_MOCK) { router.push('/admin'); return; }
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const storedUser = token ? getUser() : null;
    router.push(token ? (storedUser?.role === 'admin' ? '/admin' : '/dashboard') : '/login');
  }, [router]);
  return null;
}
