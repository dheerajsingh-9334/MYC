'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import { User, Phone, Lock, Check, AlertCircle, X } from 'lucide-react';
import { isValidPhone, sanitizePhoneInput } from '@/lib/validation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';


interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onUpdateSuccess?: (updatedUser: any) => void;
}

export default function ProfileModal({ open, onClose, onUpdateSuccess }: ProfileModalProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (whatsappNumber && !isValidPhone(whatsappNumber)) {
      setErrorMsg('Invalid WhatsApp number format. Must be 7 to 15 digits.');
      return;
    }
    if (password && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const payload: any = { fullName, whatsappNumber, avatarUrl };
    if (password) payload.password = password;

    updateMut.mutate(payload);
  };


  if (!mounted || !open) return null;

  const initials = fullName
    ? fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 25, 12, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999, // Render on top of everything
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
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'start',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>
              Profile Settings
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
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
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--soft)'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form wrapping body and footer */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0 }}>
          {/* Scrollable Content */}
          <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 12, color: 'var(--muted)' }}>
                <LoadingSpinner size={24} color="var(--olive)" label="Loading profile data..." />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {successMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 13, border: '1px solid var(--green)' }}>
                    <Check size={14} /> {successMsg}
                  </div>
                )}

                {errorMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, border: '1px solid var(--red)' }}>
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
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{profile?.email}</div>
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
                        className="profile-input"
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
                        onChange={(e) => {
                          setErrorMsg('');
                          setWhatsappNumber(sanitizePhoneInput(e.target.value));
                        }}
                        className="profile-input"
                        style={whatsappNumber && !isValidPhone(whatsappNumber) ? { borderColor: 'var(--red)', background: 'var(--red-bg)' } : {}}
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
                      className="profile-input-no-icon"
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
                        className="profile-input"
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
                        className="profile-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons / Sticky Footer */}
          {!isLoading && (
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMut.isPending}
                className="btn-primary"
                style={{ opacity: updateMut.isPending ? 0.75 : 1 }}
              >
                {updateMut.isPending ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <LoadingSpinner size={12} color="#fff" />
                    <span>Saving changes...</span>
                  </div>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          )}
        </form>
      </div>
      <style>{`
        .profile-input {
          width: 100%;
          padding: 10px 12px 10px 34px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          background: var(--surface);
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .profile-input:focus {
          border-color: var(--olive);
          box-shadow: 0 0 0 3px rgba(34, 63, 167, 0.12);
        }
        .profile-input-no-icon {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13.5px;
          background: var(--surface);
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .profile-input-no-icon:focus {
          border-color: var(--olive);
          box-shadow: 0 0 0 3px rgba(34, 63, 167, 0.12);
        }
        .btn-primary {
          padding: 9px 20px;
          background: var(--olive);
          color: #fff;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }
        .btn-primary:hover {
          background: var(--olive-light);
        }
        .btn-secondary {
          padding: 9px 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          background: var(--surface);
          color: var(--ink-2);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .btn-secondary:hover {
          background: var(--surface-2);
          border-color: var(--border-strong);
        }

        .dark .profile-input:focus, .dark .profile-input-no-icon:focus {
          border-color: var(--olive);
          box-shadow: 0 0 0 3px rgba(138, 157, 106, 0.2);
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes modalIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
