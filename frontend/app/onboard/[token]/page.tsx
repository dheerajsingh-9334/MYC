'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useFormDraft, DraftStatus } from '@/lib/useFormDraft';
import { isValidPhone, sanitizePhoneInput } from '@/lib/validation';


const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Step = 'loading' | 'invalid' | 'used' | 'form' | 'submitted';

type OnboardData = {
  section: number;
  fullName: string;
  brandName: string;
  email: string;
  whatsappNumber: string;
  location: string;
  niche: string;
  experience: string;
  audienceSize: string;
  revenueGoal: string;
  eventTopic: string;
  eventFormat: string;
  brandColors: string;
  brandTone: string;
  notes: string;
};

const EMPTY_DATA: OnboardData = {
  section: 0,
  fullName: '', brandName: '', email: '', whatsappNumber: '', location: '',
  niche: '', experience: '', audienceSize: '', revenueGoal: '',
  eventTopic: '', eventFormat: '', brandColors: '', brandTone: '', notes: '',
};

const sectionDot = (done: boolean, active: boolean, label: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, background: done ? 'var(--olive)' : active ? '#fff' : 'rgba(255,255,255,0.15)', color: done ? '#fff' : active ? 'var(--olive)' : 'rgba(255,255,255,0.6)', border: active ? '2px solid #fff' : 'none' }}>
      {done ? '✓' : label}
    </div>
  </div>
);

export default function OnboardFormPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [prefill, setPrefill] = useState<any>({});
  const [tokenReady, setTokenReady] = useState(false);
  const [phoneError, setPhoneError] = useState('');


  // The hook is created unconditionally; we gate its I/O on `enabled`
  // until the token is validated. We seed it with prefill once the
  // token resolves.
  const draft = useFormDraft<OnboardData>({
    kind: 'onboard_application',
    contextId: token || 'pending',
    initialData: EMPTY_DATA,
    enabled: tokenReady && step === 'form',
    debounceMs: 1500,
    maxWaitMs: 4000,
  });
  const { data: form, setData: setForm, status: draftStatus, lastSavedAt, clear: clearDraft } = draft;
  const section = form.section;

  useEffect(() => {
    fetch(`${API_BASE}/api/onboarding/token/${token}`)
      .then(r => {
        if (r.status === 410) { setStep('used'); return null; }
        if (!r.ok) { setStep('invalid'); return null; }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setPrefill(data);
        // Apply prefill on top of the (possibly restored) draft. The
        // hook runs in 'enabled: false' mode until we set tokenReady,
        // then mounts and reads any existing draft; we then layer
        // the prefill defaults on top so empty fields still get
        // sensible values.
        setForm(prev => ({
          ...prev,
          fullName: prev.fullName || data.name || '',
          email: prev.email || data.email || '',
          whatsappNumber: prev.whatsappNumber || data.whatsapp || '',
        }));
        setTokenReady(true);
        setStep('form');
      })
      .catch(() => setStep('invalid'));
  }, [token]);

  // The hook may have just restored from a draft; re-apply prefill
  // in case the restored draft was missing the prefill fields.
  useEffect(() => {
    if (draftStatus === 'restored' && prefill) {
      setForm(prev => ({
        ...prev,
        fullName: prev.fullName || prefill.name || '',
        email: prev.email || prefill.email || '',
        whatsappNumber: prev.whatsappNumber || prefill.whatsapp || '',
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStatus]);

  const f = (k: keyof OnboardData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let val = e.target.value;
    if (k === 'whatsappNumber') {
      val = sanitizePhoneInput(val);
      if (phoneError) setPhoneError('');
    }
    setForm(p => ({ ...p, [k]: val }));
  };

  const goToSection = (next: number) => {
    setForm(p => ({ ...p, section: next }));
  };

  const handleContinue = () => {
    if (section === 0) {
      if (!isValidPhone(form.whatsappNumber)) {
        setPhoneError('Invalid WhatsApp number format. Must be 7 to 15 digits.');
        return;
      }
      setPhoneError('');
    }
    goToSection(section + 1);
  };


  const handleSubmit = async () => {
    const res = await fetch(`${API_BASE}/api/onboarding/submit/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      await clearDraft();
      setStep('submitted');
    }
  };

  const sections = [
    { title: 'About you', num: '1' },
    { title: 'Your coaching', num: '2' },
    { title: 'Event & brand', num: '3' },
    { title: 'Review', num: '4' },
  ];

  const inputStyle = (val?: string) => ({
    width: '100%', padding: '10px 12px',
    border: `1px solid ${val ? 'var(--olive)' : '#D0D0C4'}`,
    borderRadius: 8, fontSize: 14.5, color: '#1A1A1A',
    background: val ? '#FAFDF6' : '#fff', outline: 'none', transition: 'all 0.15s', fontFamily: 'inherit',
  } as React.CSSProperties);

  const label = (text: string, req?: boolean) => (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3D3D3D', marginBottom: 6, letterSpacing: '0.2px' }}>
      {text}{req && <span style={{ color: '#B23B2D', marginLeft: 3 }}>*</span>}
    </label>
  );

  const field = (key: keyof typeof form, labelText: string, placeholder?: string, req?: boolean, type?: string) => {
    const isPhone = key === 'whatsappNumber';
    const hasError = isPhone && !!phoneError;
    const currentStyle = {
      ...inputStyle(form[key] as string),
      ...(hasError ? { borderColor: '#B23B2D', background: '#FFF7F6' } : {})
    };

    return (
      <div style={{ marginBottom: 20 }}>
        {label(labelText, req)}
        <input type={type || 'text'} placeholder={placeholder} value={form[key] as string}
          onChange={f(key)}
          style={currentStyle} />
        {hasError && <div style={{ color: '#B23B2D', fontSize: 12, marginTop: 4 }}>{phoneError}</div>}
      </div>
    );
  };


  // ── States ──
  if (step === 'loading') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7' }}>
      <div style={{ fontSize: 14, color: '#6B6B6B' }}>Verifying your invite link...</div>
    </div>
  );

  if (step === 'invalid') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>Invalid link</h1>
        <p style={{ fontSize: 14.5, color: '#6B6B6B', lineHeight: 1.6 }}>This onboarding link is invalid or has expired. Please contact MyC to get a new link.</p>
      </div>
    </div>
  );

  if (step === 'used') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>Already submitted</h1>
        <p style={{ fontSize: 14.5, color: '#6B6B6B', lineHeight: 1.6 }}>Your application has already been submitted. Our team will be in touch shortly.</p>
      </div>
    </div>
  );

  if (step === 'submitted') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF7', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 480, animation: 'fadeIn 0.4s ease' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}>🎉</div>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 32, color: '#1A1A1A', marginBottom: 12, letterSpacing: '-0.3px' }}>Application submitted!</h1>
        <p style={{ fontSize: 15, color: '#6B6B6B', lineHeight: 1.7, marginBottom: 24 }}>
          Thank you, <strong>{form.fullName}</strong>! Our team at MyC will review your application and get back to you within 24-48 hours via WhatsApp and email.
        </p>
        <div style={{ background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 12, padding: '16px 20px', fontSize: 13.5, color: 'var(--olive-dark)', lineHeight: 1.7 }}>
          📱 Watch out for a message from our team on <strong>{form.whatsappNumber || 'your WhatsApp'}</strong>
        </div>
      </div>
    </div>
  );

  // ── Form ──
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF7', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, var(--olive-dark) 0%, var(--olive) 100%)', color: '#fff', padding: '20px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 700 }}>M</div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20 }}>My<span style={{ fontStyle: 'italic' }}>C</span> Onboarding</div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>~8 minutes to complete</div>
        </div>

        {/* Status indicator */}
        <div style={{ maxWidth: 640, margin: '0 auto 16px' }}>
          {draftStatus !== 'idle' && draftStatus !== 'loading' && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 20,
              fontSize: 11,
              color: 'rgba(255,255,255,0.9)',
            }}>
              {draftStatus === 'saving' && 'Saving...'}
              {draftStatus === 'saved' && 'Saved'}
              {draftStatus === 'error' && 'Save error'}
              {draftStatus === 'restored' && 'Restored'}
              {lastSavedAt && (draftStatus === 'saved' || draftStatus === 'restored') && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                  at {lastSavedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Progress bar + step dots */}
        <div style={{ maxWidth: 640, margin: '16px auto 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 11, left: '12%', right: '12%', height: 2, background: 'rgba(255,255,255,0.2)', zIndex: 0 }}>
              <div style={{ height: '100%', background: '#fff', width: `${(section / 3) * 100}%`, transition: 'width 0.4s ease' }} />
            </div>
            {sections.map((s, i) => (
              <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
                  background: i < section ? '#fff' : i === section ? '#fff' : 'rgba(255,255,255,0.15)',
                  color: i < section ? 'var(--olive)' : i === section ? 'var(--olive)' : 'rgba(255,255,255,0.6)',
                  border: i === section ? '3px solid rgba(255,255,255,0.4)' : 'none',
                  boxShadow: i === section ? '0 0 0 3px rgba(255,255,255,0.15)' : 'none',
                }}>
                  {i < section ? '✓' : s.num}
                </div>
                <div style={{ fontSize: 11, color: i <= section ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)', textAlign: 'center', fontWeight: i === section ? 600 : 400, lineHeight: 1.3 }}>
                  {s.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form content */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* Section 0 — About you */}
        {section === 0 && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>About you</div>
              <div style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 }}>Let's start with the basics. Tell us who you are.</div>
            </div>
            {field('fullName', 'Your full name', 'Priya Sharma', true)}
            {field('brandName', 'Brand / business name', 'Priya Healing Arts')}
            {field('email', 'Email address', 'priya@coaching.com', true, 'email')}
            {field('whatsappNumber', 'WhatsApp number', '+91 98765 43210', true)}
            {field('location', 'City / Country', 'Mumbai, India')}
          </div>
        )}

        {/* Section 1 — Your coaching */}
        {section === 1 && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>Your coaching practice</div>
              <div style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 }}>Help us understand your niche, audience, and goals.</div>
            </div>
            {field('niche', 'Your coaching niche', 'e.g. Mindfulness for corporate professionals', true)}
            <div style={{ marginBottom: 20 }}>
              {label('Years of coaching experience')}
              <select value={form.experience} onChange={f('experience')} style={{ ...inputStyle(form.experience) }}>
                <option value="">Select...</option>
                {['Less than 1 year', '1–2 years', '3–5 years', '5–10 years', '10+ years'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              {label('Current audience size')}
              <select value={form.audienceSize} onChange={f('audienceSize')} style={{ ...inputStyle(form.audienceSize) }}>
                <option value="">Select...</option>
                {['0–500', '500–2000', '2000–10000', '10000+'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {field('revenueGoal', 'Revenue goal for this event', 'e.g. ₹5 lakhs', true)}
          </div>
        )}

        {/* Section 2 — Event & brand */}
        {section === 2 && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>Event & brand details</div>
              <div style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 }}>Tell us about the event we'll be launching together.</div>
            </div>
            {field('eventTopic', 'Event topic / title', 'e.g. From Burnout to Balance — 3 Day Workshop', true)}
            <div style={{ marginBottom: 20 }}>
              {label('Event format', true)}
              <select value={form.eventFormat} onChange={f('eventFormat')} style={{ ...inputStyle(form.eventFormat) }}>
                <option value="">Select...</option>
                {['Live webinar (Zoom)', 'In-person workshop', 'Hybrid', '3-day virtual summit', 'Masterclass series'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {field('brandColors', 'Brand colors', 'e.g. Forest green, warm beige, terracotta')}
            <div style={{ marginBottom: 20 }}>
              {label('Brand tone')}
              <select value={form.brandTone} onChange={f('brandTone')} style={{ ...inputStyle(form.brandTone) }}>
                <option value="">Select...</option>
                {['Calm & nurturing', 'Energetic & bold', 'Professional & corporate', 'Playful & vibrant', 'Spiritual & soulful'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              {label('Anything else you want to share?')}
              <textarea value={form.notes} onChange={f('notes')} placeholder="Specific requirements, timeline constraints, past experience with ads, etc."
                style={{ ...inputStyle(form.notes), minHeight: 80, resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* Section 3 — Review */}
        {section === 3 && (
          <div style={{ animation: 'fadeIn 0.2s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: '#1A1A1A', marginBottom: 8 }}>Review & submit</div>
              <div style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.6 }}>Almost done! Check your details before submitting.</div>
            </div>
            {[
              { heading: 'About you', items: [['Name', form.fullName], ['Brand', form.brandName], ['Email', form.email], ['WhatsApp', form.whatsappNumber], ['Location', form.location]] },
              { heading: 'Coaching', items: [['Niche', form.niche], ['Experience', form.experience], ['Audience', form.audienceSize], ['Revenue goal', form.revenueGoal]] },
              { heading: 'Event & brand', items: [['Event topic', form.eventTopic], ['Format', form.eventFormat], ['Colors', form.brandColors], ['Tone', form.brandTone]] },
            ].map(group => (
              <div key={group.heading} style={{ background: '#fff', border: '1px solid #E5E4DC', borderRadius: 10, padding: '14px 18px', marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#9C9C9C', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>{group.heading}</div>
                {group.items.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F5F4EF', fontSize: 13.5 }}>
                    <span style={{ color: '#6B6B6B' }}>{k}</span>
                    <span style={{ color: '#1A1A1A', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 10, padding: '14px 18px', marginTop: 16, fontSize: 13.5, color: 'var(--olive-dark)', lineHeight: 1.7 }}>
              By submitting, you agree that MyC may contact you via WhatsApp and email about your application.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, gap: 12 }}>
          {section > 0 ? (
            <button onClick={() => goToSection(section - 1)}
              style={{ padding: '11px 20px', border: '1px solid #E5E4DC', borderRadius: 8, fontSize: 14, fontWeight: 500, background: '#fff', cursor: 'pointer', color: '#3D3D3D' }}>
              ← Back
            </button>
          ) : <div />}

          {section < 3 ? (
            <button onClick={handleContinue}
              disabled={section === 0 && (!form.fullName || !form.email || !form.whatsappNumber)}
              style={{ padding: '11px 28px', background: !form.fullName && section === 0 ? '#9C9C9C' : 'var(--olive)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: !form.fullName && section === 0 ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
              Continue →
            </button>

          ) : (
            <button onClick={handleSubmit}
              disabled={!form.fullName || !form.eventTopic}
              style={{ padding: '11px 28px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Submit application 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
