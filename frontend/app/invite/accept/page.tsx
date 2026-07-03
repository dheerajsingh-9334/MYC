'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, UserCheck, KeyRound, Phone, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type InviteDetails = {
  email: string;
  role: 'admin' | 'team_leader' | 'team_member';
  teamName: string | null;
  organisationName: string;
};

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<InviteDetails | null>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.');
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/teams/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Invalid or expired invitation link.');
        }
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to validate invitation.');
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/teams/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          fullName: fullName.trim(),
          password,
          whatsappNumber: whatsappNumber.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to accept invitation.');
      }

      setSuccess(true);
    } catch (err: any) {
      setFormError(err.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleLabel = (role?: string) => {
    if (role === 'admin') return 'Administrator';
    if (role === 'team_leader') return 'Team Leader';
    return 'Team Member';
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={spinnerStyle}></div>
            <p style={{ marginTop: 20, color: 'var(--muted)', fontSize: 14 }}>Verifying your invitation...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertCircle size={48} style={{ color: 'var(--red)', marginBottom: 16 }} />
            <h1 style={titleStyle}>Invitation Error</h1>
            <p style={{ ...descStyle, marginTop: 10 }}>{error}</p>
            <button onClick={() => router.push('/login')} style={{ ...btnPrimary, marginTop: 24, alignSelf: 'center' }}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 32px' }}>
          <div style={checkContainerStyle}>
            <CheckCircle2 size={40} style={{ color: '#2E7D32' }} />
          </div>
          <h1 style={titleStyle}>Registration Complete!</h1>
          <p style={{ ...descStyle, marginTop: 12, lineHeight: 1.6 }}>
            Welcome aboard! You have successfully accepted the invitation and joined <strong>{details?.organisationName}</strong> as a {getRoleLabel(details?.role)}.
          </p>
          <button onClick={() => router.push('/login')} style={{ ...btnPrimary, marginTop: 30, width: '100%' }}>
            Go to Login Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={logoIconStyle}>M</div>
          <h1 style={titleStyle}>Join the Team</h1>
          <p style={{ ...descStyle, marginTop: 6 }}>
            You've been invited to join <strong>{details?.organisationName}</strong>
          </p>
        </div>

        {/* Read-Only Invitation details */}
        <div style={infoBoxStyle}>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Email Address</span>
            <span style={infoValueStyle}>{details?.email}</span>
          </div>
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}>Assigned Role</span>
            <span style={infoValueStyle}>{getRoleLabel(details?.role)}</span>
          </div>
          {details?.teamName && (
            <div style={infoRowStyle}>
              <span style={infoLabelStyle}>Assigned Team</span>
              <span style={infoValueStyle}>{details.teamName}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Full Name *</label>
            <div style={{ position: 'relative' }}>
              <input
                required
                type="text"
                placeholder="Priya Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>WhatsApp Number</label>
            <div style={{ position: 'relative' }}>
              <Phone size={16} style={inputIconStyle} />
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 38 }}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
              Used for operational updates and task notifications.
            </span>
          </div>

          <div>
            <label style={labelStyle}>Create Password *</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={inputIconStyle} />
              <input
                required
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 38 }}
              />
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
              Must be at least 8 characters.
            </span>
          </div>

          <div>
            <label style={labelStyle}>Confirm Password *</label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={inputIconStyle} />
              <input
                required
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 38 }}
              />
            </div>
          </div>

          {formError && (
            <div style={errorBoxStyle}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...btnPrimary,
              marginTop: 10,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Setting up account...' : 'Create Account & Join'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={spinnerStyle}></div>
            <p style={{ marginTop: 20, color: 'var(--muted)', fontSize: 14 }}>Loading page...</p>
          </div>
        </div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}

// ── Premium Styles ──
const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#FAFAF7',
  fontFamily: 'Inter, system-ui, sans-serif',
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid var(--border, #E5E4DC)',
  borderRadius: 16,
  padding: '36px 32px',
  width: '100%',
  maxWidth: 460,
  boxShadow: '0 8px 30px rgba(20, 25, 12, 0.04)',
};

const logoIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  background: 'linear-gradient(135deg, var(--olive, #556B2F), var(--olive-light, #8FBC8F))',
  color: '#ffffff',
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: 22,
  fontFamily: 'Instrument Serif, serif',
  margin: '0 auto 16px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'Instrument Serif, serif',
  fontSize: 28,
  fontWeight: 500,
  color: 'var(--ink, #1A1A1A)',
  margin: 0,
};

const descStyle: React.CSSProperties = {
  fontSize: 14.5,
  color: 'var(--muted, #6B6B6B)',
  margin: 0,
};

const infoBoxStyle: React.CSSProperties = {
  background: 'var(--surface-2, #F4F3EE)',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 13,
};

const infoLabelStyle: React.CSSProperties = {
  color: 'var(--muted, #6B6B6B)',
};

const infoValueStyle: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--ink, #1A1A1A)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2, #3D3D3D)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border, #D0D0C4)',
  borderRadius: 8,
  fontSize: 14.5,
  color: 'var(--ink, #1A1A1A)',
  background: '#ffffff',
  outline: 'none',
  fontFamily: 'inherit',
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 12,
  transform: 'translateY(-50%)',
  color: 'var(--soft, #9C9C9C)',
  pointerEvents: 'none',
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 20px',
  borderRadius: 8,
  background: 'var(--olive, #556B2F)',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--red-bg, #FDF3F2)',
  color: 'var(--red, #B23B2D)',
  borderRadius: 8,
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid rgba(178, 59, 45, 0.15)',
};

const checkContainerStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: '#E8F5EE',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 20px',
};

const spinnerStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '3px solid #E5E4DC',
  borderTop: '3px solid #556B2F',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  margin: '0 auto',
};
