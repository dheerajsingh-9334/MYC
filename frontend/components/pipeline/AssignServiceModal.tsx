'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X } from 'lucide-react';
import { BtnSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  existingServiceIds?: string[];
}

export default function AssignServiceModal({ open, onClose, clientId, existingServiceIds = [] }: Props) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch('/api/services'),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      return await apiFetch(`/api/clients/${clientId}/services`, {
        method: 'POST',
        body: JSON.stringify({ serviceId }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      setServiceId('');
      setErrorMsg('');
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to assign service');
    }
  });

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 100, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.2s ease-out',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 18, color: 'var(--ink)' }}>Assign New Service</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Enroll this client in an additional service pipeline.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Service Package *</label>
            <select
              value={serviceId}
              onChange={e => { setServiceId(e.target.value); setErrorMsg(''); }}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            >
              <option value="" disabled>Select a service...</option>
              {services?.filter((s: any) => !existingServiceIds.includes(s.id)).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {errorMsg && (
            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 8 }}>
              {errorMsg}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!serviceId) {
                setErrorMsg('Please select a service.');
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending || !serviceId}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: mutation.isPending || !serviceId ? 'var(--soft)' : 'var(--olive)', color: '#fff', cursor: mutation.isPending || !serviceId ? 'not-allowed' : 'pointer' }}
          >
            {mutation.isPending ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Assigning...</span>
            ) : 'Assign Service'}
          </button>
        </div>
      </div>
    </div>
  );
}
