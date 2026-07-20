'use client';
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X } from 'lucide-react';
import { isValidPhone, sanitizePhoneInput } from '@/lib/validation';
import { LoadingSpinner, BtnSpinner } from '@/components/ui/LoadingSpinner';


interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  member: any;
  teams: string[];
}

type UpdateMemberData = {
  fullName: string;
  role: 'admin' | 'team_leader' | 'team_member';
  teamName: string;
  whatsappNumber: string;
};

export default function UpdateTeamMemberModal({ open, onClose, onSuccess, member, teams }: Props) {
  const [form, setForm] = useState<UpdateMemberData>({
    fullName: '',
    role: 'team_member',
    teamName: '',
    whatsappNumber: '',
  });

  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState('');


  useEffect(() => {
    if (member && open) {
      setForm({
        fullName: member.fullName || '',
        role: member.role || 'team_member',
        teamName: member.teamName || '',
        whatsappNumber: member.whatsappNumber || '',
      });
    }
  }, [member, open]);

  const mutation = useMutation({
    mutationFn: async (data: UpdateMemberData) => {
      return await apiFetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update member');
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
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Loading overlay */}
        {mutation.isPending && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10, borderRadius: 'var(--radius-lg)',
          }}>
            <LoadingSpinner size={36} color="var(--olive)" label="Updating member..." />
          </div>
        )}
        {/* Modal header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Update Team Member</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Edit team member "{member?.fullName}".</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Full Name *</label>
            <input
              value={form.fullName}
              onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Rahul Verma"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Role *</label>
              <select
                value={form.role}
                onChange={(e: any) => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
              >
                <option value="admin">Admin</option>
                <option value="team_leader">Team Leader</option>
                <option value="team_member">Team Member</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Team</label>
              <select
                value={form.teamName}
                onChange={(e) => setForm(f => ({ ...f, teamName: e.target.value }))}
                disabled={form.role === 'admin'}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', opacity: form.role === 'admin' ? 0.6 : 1 }}
              >
                <option value="">No Team (or Unassigned)</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>WhatsApp Number</label>
            <input
              value={form.whatsappNumber}
              onChange={(e) => {
                setPhoneError('');
                setForm(f => ({ ...f, whatsappNumber: sanitizePhoneInput(e.target.value) }));
              }}
              placeholder="e.g. +91 98765 43210"
              style={{
                width: '100%', padding: '9px 12px',
                border: phoneError ? '1px solid var(--red)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)',
                background: phoneError ? 'var(--red-bg)' : 'var(--surface)', outline: 'none'
              }}
            />
            {phoneError && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{phoneError}</span>}
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
            onClick={() => {
              if (form.whatsappNumber && !isValidPhone(form.whatsappNumber)) {
                setPhoneError('Invalid WhatsApp number. Must be 7 to 15 digits.');
                return;
              }
              setPhoneError('');
              setError('');
              mutation.mutate(form);
            }}
            disabled={mutation.isPending || !form.fullName}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--olive)', color: '#fff', cursor: 'pointer', opacity: (mutation.isPending || !form.fullName) ? 0.6 : 1 }}
          >

            {mutation.isPending ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Updating...</span>
            ) : 'Update Member'}
          </button>
        </div>
      </div>
    </div>
  );
}
