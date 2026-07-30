import { X } from 'lucide-react';
import { BtnSpinner } from './LoadingSpinner';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  isLoading = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 9999, padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onCancel(); }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.2s ease-out',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
            {title}
          </div>
          <button onClick={onCancel} disabled={isLoading} style={{ background: 'none', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {message}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onCancel} disabled={isLoading} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: isLoading ? 'not-allowed' : 'pointer', color: 'var(--ink-2)' }}>
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: isLoading ? 'var(--soft)' : (isDanger ? 'var(--red)' : 'var(--olive)'), color: '#fff', cursor: isLoading ? 'not-allowed' : 'pointer' }}
          >
            {isLoading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Processing...</span>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
