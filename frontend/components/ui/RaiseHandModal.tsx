'use client';
import { useState, useEffect } from 'react';
import { X, Hand } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface RaiseHandModalProps {
  open: boolean;
  onClose: () => void;
  clients: any[];
  preselectedTask?: any;
}

export default function RaiseHandModal({ open, onClose, clients, preselectedTask }: RaiseHandModalProps) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (open) {
      if (preselectedTask) {
        setClientId(preselectedTask.client?.id || '');
        setTitle(preselectedTask.title ? `Problem with task: ${preselectedTask.title}` : '');
      } else {
        setClientId('');
        setTitle('');
      }
      setDescription('');
    }
  }, [open, preselectedTask]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a summary of the problem.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || null,
          title: title.trim(),
          description: description.trim(),
        }),
      });

      setSuccess('Problem reported successfully! Admins have been notified.');
      setTitle('');
      setDescription('');
      setClientId('');

      // Refresh any problem lists
      qc.invalidateQueries({ queryKey: ['problems'] });

      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to raise hand. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,25,12,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: 500,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          padding: 24,
          gap: 16,
          animation: 'slideUp 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            paddingBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ink)',
            }}
          >
            <Hand size={18} style={{ color: 'var(--red)' }} />
            <span>Raise Hand (Report a Problem)</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Message Boxes */}
        {error && (
          <div
            style={{
              background: '#FDF2F2',
              border: '1px solid #FDE8E8',
              borderRadius: 6,
              padding: '10px 14px',
              color: '#9B1C1C',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green-100)',
              borderRadius: 6,
              padding: '10px 14px',
              color: 'var(--green)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Client Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Associate Client (Optional)
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                outline: 'none',
                fontSize: 13.5,
              }}
            >
              <option value="">-- General / No Specific Client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName || c.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Problem Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Problem Title / Summary
            </label>
            <input
              type="text"
              placeholder="e.g., Ad account disabled, Missing client onboarding documents"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                outline: 'none',
                fontSize: 13.5,
              }}
            />
          </div>

          {/* Problem Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Detailed Description
            </label>
            <textarea
              placeholder="Please provide details about the problem, blockages, or help needed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                outline: 'none',
                fontSize: 13.5,
                resize: 'none',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink-2)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--red)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Raising Hand...' : 'Raise Hand ✋'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
