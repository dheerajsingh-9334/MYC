'use client';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
export default function PerformancePage() {
  return (
    <AppLayout>
      <Topbar title="Performance" subtitle="Coming soon" />
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: 'var(--ink)', marginBottom: 8 }}>Performance</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Team and pipeline performance analytics — coming in Phase 2.</div>
        </div>
      </div>
    </AppLayout>
  );
}
