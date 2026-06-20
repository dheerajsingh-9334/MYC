'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 48px',
        width: '100%',
        maxWidth: 420,
        boxShadow: 'var(--shadow-lg)',
        animation: 'modalIn 0.3s ease',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--olive)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 22,
            fontFamily: 'Instrument Serif, serif', margin: '0 auto 16px',
          }}>M</div>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.3px' }}>
            My<span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>C</span>Ops
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>
            Operations Platform — Sign in to continue
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@myc.in"
              required
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                fontSize: 14, color: 'var(--ink)', background: 'var(--surface)', outline: 'none',
                transition: 'all 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--olive)'; e.target.style.boxShadow = '0 0 0 3px var(--olive-50)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                fontSize: 14, color: 'var(--ink)', background: 'var(--surface)', outline: 'none',
                transition: 'all 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--olive)'; e.target.style.boxShadow = '0 0 0 3px var(--olive-50)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)',
              border: '1px solid #F5D0CC', borderRadius: 'var(--radius-sm)',
              fontSize: 13.5, marginBottom: 16,
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 14px',
              background: loading ? 'var(--soft)' : 'var(--olive)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{
          marginTop: 28, padding: '14px 16px',
          background: 'var(--olive-50)', borderRadius: 'var(--radius-sm)',
          fontSize: 12.5, color: 'var(--olive-dark)', lineHeight: 1.7,
        }}>
          <strong>Demo credentials:</strong><br />
          Admin: admin@myc.in / password123<br />
          Team: rajan@myc.in / password123
        </div>
      </div>
    </div>
  );
}
