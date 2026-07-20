'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getUser } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { format } from 'date-fns';
import { User, Phone, Lock, Calendar, Shield, Users, Check, AlertCircle, BarChart2 } from 'lucide-react';
import { isValidPhone, sanitizePhoneInput } from '@/lib/validation';
import { FormSkeleton } from '@/components/ui/SkeletonLoader';
import { BtnSpinner } from '@/components/ui/LoadingSpinner';


const GRADIENTS = [
  { id: 'olive', label: 'Olive Forest', value: 'linear-gradient(135deg, var(--olive), var(--olive-light))' },
  { id: 'blue', label: 'Deep Blue', value: 'linear-gradient(135deg, #2860A1, #5B9BD5)' },
  { id: 'purple', label: 'Sunset Purple', value: 'linear-gradient(135deg, #6B3FA0, #9A6FCA)' },
  { id: 'amber', label: 'Golden Amber', value: 'linear-gradient(135deg, #D97706, #F59E0B)' },
  { id: 'green', label: 'Emerald Green', value: 'linear-gradient(135deg, #059669, #10B981)' },
];

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [gradient, setGradient] = useState(GRADIENTS[0]);

  // Form states
  const [fullName, setFullName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch logged-in user profile details & stats
  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await apiFetch('/api/users/me');
      setFullName(res.fullName || '');
      setWhatsappNumber(res.whatsappNumber || '');
      setAvatarUrl(res.avatarUrl || '');
      return res;
    },
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
      // Update local storage user details if needed
      const local = getUser();
      if (local) {
        localStorage.setItem('user', JSON.stringify({ ...local, fullName: data.fullName, avatarUrl: data.avatarUrl }));
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


  if (isLoading || !profile) {
    return (
      <AppLayout>
        <Topbar title="My Profile" subtitle="Manage your profile & details" />
        <FormSkeleton fieldsCount={5} />
      </AppLayout>
    );
  }

  const initials = profile.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const completionRate = profile.performance.totalTasks > 0
    ? Math.round((profile.performance.completedTasks / profile.performance.totalTasks) * 100)
    : 100;

  return (
    <AppLayout>
      <Topbar title="My Profile" subtitle="Account details & performance tracking" />
      <div style={{ padding: '24px 28px', flex: 1, maxWidth: 1000, margin: '0 auto', width: '100%' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 28, alignItems: 'start' }}>
          
          {/* Left Column: Avatar & KPI Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <SectionCard title="Account Info" padding="24px">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                
                {/* Photo/Avatar Circle */}
                <div style={{ position: 'relative', width: 100, height: 100 }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profile.fullName}
                      style={{
                        width: 100, height: 100, borderRadius: '50%',
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
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: gradient.value,
                    color: '#fff', display: avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, fontWeight: 700, boxShadow: 'var(--shadow-md)',
                    transition: 'background 0.3s ease',
                  }}>
                    {initials}
                  </div>
                </div>

                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{profile.fullName}</h2>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{profile.email}</div>
                </div>

                {/* Meta details list */}
                <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                    <Shield size={14} style={{ color: 'var(--olive)' }} />
                    <span>Role: <strong style={{ color: 'var(--ink)' }}>{profile.role.replace('_', ' ')}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                    <Users size={14} style={{ color: 'var(--olive)' }} />
                    <span>Team: <strong style={{ color: 'var(--ink)' }}>{profile.teamName || 'Unassigned'}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
                    <Calendar size={14} style={{ color: 'var(--olive)' }} />
                    <span>Joined: <strong style={{ color: 'var(--ink)' }}>{format(new Date(profile.createdAt), 'dd MMM yyyy')}</strong></span>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Right Column: Edit Profile & Password Form */}
          <SectionCard title="Account Settings" padding="24px 28px">
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              
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

              {/* Profile Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Personal Details</div>
                
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    disabled
                    readOnly
                    value={profile.email}
                    style={{
                      width: '100%', padding: '10px 12px',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      fontSize: 13.5, background: 'var(--surface-2)', color: 'var(--muted)', cursor: 'not-allowed', outline: 'none',
                    }}
                  />
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
                    Use an image hosted on some other website (e.g. Gravatar or Imgur) as your avatar. Leave blank to use fallback initials.
                  </div>
                </div>
              </div>

              {/* Password Management */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Security & Password</div>
                
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10 }}>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  className="btn-primary"
                  style={{ opacity: updateMut.isPending ? 0.75 : 1 }}
                >
                  {updateMut.isPending ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BtnSpinner /> Saving changes...</span>
                  ) : 'Save Settings'}
                </button>
              </div>

            </form>
          </SectionCard>

        </div>

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
          padding: 10px 24px;
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

        .dark .profile-input:focus, .dark .profile-input-no-icon:focus {
          border-color: var(--olive);
          box-shadow: 0 0 0 3px rgba(138, 157, 106, 0.2);
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </AppLayout>
  );
}
