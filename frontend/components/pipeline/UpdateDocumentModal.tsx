'use client';
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  doc: any;
}

type UpdateDocData = {
  title: string;
  description: string;
  notes: string;
  driveUrl?: string;
};

export default function UpdateDocumentModal({ open, onClose, onSuccess, doc }: Props) {
  const [form, setForm] = useState<UpdateDocData>({
    title: '',
    description: '',
    notes: '',
    driveUrl: '',
  });

  const [error, setError] = useState('');
  const isDrive = doc?.docType === 'drive_link' || !!doc?.driveUrl;

  useEffect(() => {
    if (doc && open) {
      setForm({
        title: doc.name || '',
        description: doc.description || '',
        notes: doc.notes || '',
        driveUrl: doc.driveUrl || '',
      });
    }
  }, [doc, open]);

  const mutation = useMutation({
    mutationFn: async (data: UpdateDocData) => {
      // rawId is the actual database UUID (since doc.id is prefixed like 'doc_...')
      const docId = doc.rawId || doc.id.replace('doc_', '');
      return await apiFetch(`/api/vault/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          notes: data.notes || null,
          driveUrl: isDrive ? data.driveUrl : undefined,
        }),
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update document');
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
        width: '100%', maxWidth: 500, boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.2s ease-out',
      }}>
        {/* Modal header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Update Document</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Edit document metadata for "{doc?.name}".</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Document Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Logo Design Guidelines"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>

          {isDrive && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Google Drive Link *</label>
              <input
                value={form.driveUrl}
                onChange={(e) => setForm(f => ({ ...f, driveUrl: e.target.value }))}
                placeholder="https://drive.google.com/..."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief summary of the document contents..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional notes or passwords..."
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>
            Cancel
          </button>
          <button
            onClick={() => { setError(''); mutation.mutate(form); }}
            disabled={mutation.isPending || !form.title.trim() || (isDrive && !form.driveUrl?.trim())}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: 'pointer', opacity: (mutation.isPending || !form.title.trim() || (isDrive && !form.driveUrl?.trim())) ? 0.6 : 1 }}
          >
            {mutation.isPending ? 'Updating...' : 'Update Document'}
          </button>
        </div>
      </div>
    </div>
  );
}
