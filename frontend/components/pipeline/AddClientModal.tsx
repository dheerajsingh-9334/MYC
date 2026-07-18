'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useFormDraft } from '@/lib/useFormDraft';
import { X } from 'lucide-react';
import { isValidPhone, sanitizePhoneInput } from '@/lib/validation';


interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AddClientData = { fullName: string; brandName: string; email: string; whatsappNumber: string; notes: string };

export default function AddClientModal({ open, onClose, onSuccess }: Props) {
  const draft = useFormDraft<AddClientData>({
    kind: 'add_client',
    contextId: 'new',
    initialData: { fullName: '', brandName: '', email: '', whatsappNumber: '', notes: '' },
  });
  const form = draft.data;
  const setForm = draft.setData;
  const [phoneError, setPhoneError] = useState('');


  const mutation = useMutation({
    mutationFn: async (data: AddClientData) => {
      try {
        return await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(data) });
      } catch (err: any) {
        // If the pipeline isn't seeded yet, auto-seed it and retry once.
        if (typeof err?.message === 'string' && err.message.includes('Step 1 not configured')) {
          await apiFetch('/api/admin/seed-steps', { method: 'POST', body: JSON.stringify({}) });
          return await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(data) });
        }
        throw err;
      }
    },
    onSuccess: async () => {
      await draft.clear();
      onSuccess();
      onClose();
    },
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
        width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.2s ease-out',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Add a new client</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>They'll be placed at Step 1 — Onboarding. Intake Team will be notified automatically.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Coach Name *</label>
              <input className="form-input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Priya Sharma"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Brand Name</label>
              <input value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} placeholder="e.g. Priya Healing Arts"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="priya@coaching.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>WhatsApp</label>
              <input value={form.whatsappNumber}
                onChange={e => {
                  setPhoneError('');
                  setForm(f => ({ ...f, whatsappNumber: sanitizePhoneInput(e.target.value) }));
                }}
                placeholder="+91 98765 43210"
                style={{
                  width: '100%', padding: '9px 12px',
                  border: phoneError ? '1px solid var(--red)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)',
                  background: phoneError ? 'var(--red-bg)' : 'var(--surface)', outline: 'none'
                }}
              />
              {phoneError && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{phoneError}</span>}
            </div>

          </div>
          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any relevant context..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          {mutation.isError && (
            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 12 }}>
              {(mutation.error as Error).message}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (form.whatsappNumber && !isValidPhone(form.whatsappNumber)) {
                setPhoneError('Invalid WhatsApp number. Must be 7 to 15 digits.');
                return;
              }
              setPhoneError('');
              mutation.mutate(form);
            }}
            disabled={mutation.isPending || !form.fullName}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: mutation.isPending || !form.fullName ? 'var(--soft)' : 'var(--olive)', color: '#fff', cursor: mutation.isPending || !form.fullName ? 'not-allowed' : 'pointer' }}
          >
            {mutation.isPending ? 'Adding...' : 'Add & Start Pipeline'}
          </button>

        </div>
      </div>
    </div>
  );
}
