'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import { User, Phone, Lock, Check, AlertCircle, X } from 'lucide-react';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onUpdateSuccess?: (updatedUser: any) => void;
}

export default function ProfileModal({ open, onClose, onUpdateSuccess }: ProfileModalProps) {
  const queryClient = useQueryClient();

  // Form states
  const [fullName, setFullName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch logged-in user profile details
  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await apiFetch('/api/users/me');
      setFullName(res.fullName || '');
      setWhatsappNumber(res.whatsappNumber || '');
      setAvatarUrl(res.avatarUrl || '');
      return res;
    },
    enabled: open,
    retry: false,
  });

  // Mutation to update user info/password
  const updateMut = useMutation({
    mutationFn: (body: any) =>
      apiFetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setSuccessMsg('Profile updated successfully!');
      setErrorMsg('');
      setPassword('');
      setConfirmPassword('');
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });

      // Update local storage user details
      const local = getUser();
      if (local) {
        const updatedLocal = { ...local, fullName: data.fullName, avatarUrl: data.avatarUrl };
        localStorage.setItem('user', JSON.stringify(updatedLocal));
        if (onUpdateSuccess) {
          onUpdateSuccess(updatedLocal);
        }
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to update profile.');
      setSuccessMsg('');
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const payload: any = { fullName, whatsappNumber, avatarUrl };
    if (password) payload.password = password;

    updateMut.mutate(payload);
  };

  if (!open) return null;

  const initials = fullName
    ? fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 25, 12, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20,
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
          maxWidth: 580,
          boxShadow: 'var(--shadow-lg)',
          animation: 'modalIn 0.2s ease-out',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)' }}>
              Profile Settings
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              Update your personal information and security credentials.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--soft)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 12, color: 'var(--muted)' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--olive)', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Loading profile data...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {successMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <Check size={14} /> {successMsg}
                </div>
              )}

              {errorMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <AlertCircle size={14} /> {errorMsg}
                </div>
              )}

              {/* Avatar Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={fullName}
                      style={{
                        width: 64, height: 64, borderRadius: '50%',
                        objectFit: 'cover', boxShadow: 'var(--shadow-md)',
                        border: '2px solid var(--border)',
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const sibling = e.currentTarget.nextSibling as HTMLElement;
                        if (sibling) sibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                      color: '#fff',
                      display: avatarUrl ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      fontWeight: 700,
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    {initials}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{fullName || 'Your Name'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>{profile?.email}</div>
                </div>
              </div>

              {/* Personal Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Personal Details
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px 9px 32px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>WhatsApp Number</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px 9px 32px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Profile Picture URL (from another website)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                    Use an image hosted on some other website (e.g. Gravatar or Imgur) as your avatar.
                  </div>
                </div>
              </div>

              {/* Password Management */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Security & Password
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>New Password (optional)</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                    <input
                      type="password"
                      placeholder="Leave blank to keep current"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px 9px 32px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--soft)' }} />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px 9px 32px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                        fontSize: 13.5, background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  style={{
                    padding: '9px 20px', background: 'var(--olive)', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    opacity: updateMut.isPending ? 0.75 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  {updateMut.isPending ? 'Saving changes...' : 'Save Settings'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes modalIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
