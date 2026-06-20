'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { useState } from 'react';
import { format } from 'date-fns';
import { Check, X, Info, ChevronDown, ChevronRight, UserPlus } from 'lucide-react';
import { useFormDraft } from '@/lib/useFormDraft';
import { useViewPreference } from '@/lib/useViewPreference';

// ─── helpers ────────────────────────────────────────────────────
const appStatusStyle: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#FFF4DA', color: '#C58A1A', label: 'Pending review' },
  approved:  { bg: '#E8F5EE', color: '#2A7F4F', label: 'Approved' },
  rejected:  { bg: '#FCEAE7', color: '#B23B2D', label: 'Rejected' },
  more_info: { bg: '#E6F0FA', color: '#2860A1', label: 'More info requested' },
};

// ─── Invite Modal ────────────────────────────────────────────────
function InviteModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const draft = useFormDraft<{ sentToName: string; sentToEmail: string; sentToWhatsapp: string }>({
    kind: 'send_invite',
    contextId: 'new',
    initialData: { sentToName: '', sentToEmail: '', sentToWhatsapp: '' },
  });
  const form = draft.data;
  const setForm = draft.setData;
  const [link, setLink] = useState('');

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch('/api/onboarding/invite', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: async (res) => {
      setLink(res.link);
      onSuccess();
      // Clear the draft once the invite is generated successfully.
      await draft.clear();
    },
  });

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !link) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>Send onboarding invite</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Client gets a unique link to fill their self-service form (~8 min). No login required.</div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {link ? (
            <div>
              <div style={{ padding: '14px 16px', background: '#E8F5EE', border: '1px solid #B0DCC0', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>✓ Invite link created</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all', lineHeight: 1.6 }}>{link}</div>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(link); }}
                style={{ width: '100%', padding: '9px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}>
                Copy link to clipboard
              </button>
              <button onClick={() => { setLink(''); setForm(p => ({ sentToName: '', sentToEmail: '', sentToWhatsapp: '' })); onClose(); }}
                style={{ width: '100%', padding: '9px', background: 'none', color: 'var(--ink-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          ) : (
            <>
              {[
                { key: 'sentToName', label: 'Client Name *', placeholder: 'Priya Sharma', type: 'text' },
                { key: 'sentToEmail', label: 'Email', placeholder: 'priya@coaching.com', type: 'email' },
                { key: 'sentToWhatsapp', label: 'WhatsApp', placeholder: '+91 98765 43210', type: 'text' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                </div>
              ))}
              {mutation.isError && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}>{(mutation.error as Error).message}</div>}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={onClose} style={{ flex: 1, padding: '9px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
                <button onClick={() => mutation.mutate(form)} disabled={!form.sentToName || mutation.isPending}
                  style={{ flex: 2, padding: '9px', background: !form.sentToName ? 'var(--soft)' : 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: !form.sentToName ? 'not-allowed' : 'pointer' }}>
                  {mutation.isPending ? 'Generating link...' : 'Generate invite link'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Application row ─────────────────────────────────────────────
function ApplicationRow({ app, onAction }: { app: any; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showNote, setShowNote] = useState<'reject' | 'info' | null>(null);
  const qc = useQueryClient();

  // Review note draft — survives the 15s auto-refetch that wipes
  // component-local state, and survives modal close + tab reload.
  const reviewDraft = useFormDraft<{ reviewNote: string }>({
    kind: 'application_review_note',
    contextId: app.id,
    initialData: { reviewNote: '' },
  });
  const reviewNote = reviewDraft.data.reviewNote;

  const action = (path: string, body?: any) => apiFetch(`/api/onboarding/applications/${app.id}/${path}`, {
    method: 'PATCH', body: body ? JSON.stringify(body) : undefined,
  });

  const approveMut = useMutation({ mutationFn: () => action('approve'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications'] }); onAction(); } });
  const rejectMut = useMutation({
    mutationFn: () => action('reject', { reviewNote }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      await reviewDraft.clear();
      setShowNote(null);
    },
  });
  const infoMut = useMutation({
    mutationFn: () => action('more-info', { reviewNote }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      await reviewDraft.clear();
      setShowNote(null);
    },
  });

  const s = appStatusStyle[app.status] || appStatusStyle.pending;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)', transition: 'box-shadow 0.15s' }}>
      {/* Row header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 16, alignItems: 'center', padding: '14px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{app.fullName}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{app.email || 'No email'} · {app.whatsappNumber || 'No WhatsApp'}</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{app.niche || '—'}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{format(new Date(app.createdAt), 'd MMM · HH:mm')}</div>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, background: s.bg, color: s.color }}>
            {s.label}
          </span>
        </div>
        <div style={{ color: 'var(--muted)' }}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '20px', background: 'var(--surface-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              ['Brand Name', app.brandName], ['Location', app.location], ['Experience', app.experience],
              ['Audience Size', app.audienceSize], ['Revenue Goal', app.revenueGoal],
              ['Event Topic', app.eventTopic], ['Event Format', app.eventFormat],
              ['Brand Colors', app.brandColors], ['Brand Tone', app.brandTone],
            ].map(([k, v]) => v ? (
              <div key={k} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{v}</div>
              </div>
            ) : null)}
          </div>
          {app.notes && (
            <div style={{ background: 'var(--amber-bg)', border: '1px solid #F0D9A0', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8B6010', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional Notes</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{app.notes}</div>
            </div>
          )}

          {app.status === 'pending' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <button onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Check size={14} /> {approveMut.isPending ? 'Approving...' : 'Approve & start pipeline'}
              </button>
              <button onClick={() => setShowNote(showNote === 'info' ? null : 'info')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid #B0C8E0', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Info size={14} /> Request more info
              </button>
              <button onClick={() => setShowNote(showNote === 'reject' ? null : 'reject')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #F5D0CC', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <X size={14} /> Reject
              </button>

              {(showNote === 'reject' || showNote === 'info') && (
                <div style={{ width: '100%', marginTop: 4 }}>
                  <textarea value={reviewNote} onChange={e => reviewDraft.setData(p => ({ ...p, reviewNote: e.target.value }))} placeholder={showNote === 'reject' ? 'Reason for rejection...' : 'What information do you need?'}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', outline: 'none', background: 'var(--surface)' }} />
                  <button onClick={() => showNote === 'reject' ? rejectMut.mutate() : infoMut.mutate()}
                    disabled={!reviewNote || rejectMut.isPending || infoMut.isPending}
                    style={{ marginTop: 8, padding: '7px 14px', background: showNote === 'reject' ? 'var(--red)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: !reviewNote ? 'not-allowed' : 'pointer', opacity: !reviewNote ? 0.6 : 1 }}>
                    {showNote === 'reject' ? (rejectMut.isPending ? 'Rejecting...' : 'Confirm reject') : (infoMut.isPending ? 'Sending...' : 'Send request')}
                  </button>
                </div>
              )}
            </div>
          )}

          {app.status !== 'pending' && app.reviewNote && (
            <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink-2)' }}>
              <strong>Review note:</strong> {app.reviewNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function OnboardingQueuePage() {
  const [showInvite, setShowInvite] = useState(false);
  // Persisted filter — survives reloads and syncs across devices.
  const [filter, setFilter] = useViewPreference<string>({
    page: 'onboarding_queue',
    key: 'status_filter',
    defaultValue: 'pending',
  });
  const qc = useQueryClient();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiFetch('/api/onboarding/applications'),
    refetchInterval: 15000, // auto-refresh every 15s
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['invites'],
    queryFn: () => apiFetch('/api/onboarding/invites'),
  });

  const filtered = apps.filter((a: any) => filter === 'all' ? true : a.status === filter);
  const pendingCount = apps.filter((a: any) => a.status === 'pending').length;

  const tabs = [
    { key: 'pending', label: 'Pending', count: apps.filter((a: any) => a.status === 'pending').length },
    { key: 'approved', label: 'Approved', count: apps.filter((a: any) => a.status === 'approved').length },
    { key: 'more_info', label: 'More info', count: apps.filter((a: any) => a.status === 'more_info').length },
    { key: 'rejected', label: 'Rejected', count: apps.filter((a: any) => a.status === 'rejected').length },
    { key: 'all', label: 'All', count: apps.length },
  ];

  return (
    <AppLayout>
      <Topbar title="Onboarding Queue" subtitle={pendingCount > 0 ? `${pendingCount} pending review` : 'All reviewed'} />
      <div style={{ padding: '28px 32px', flex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 32, color: 'var(--ink)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>Onboarding Queue</h1>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>
              Review applications, send invite links, and approve clients into the pipeline
            </div>
          </div>
          <button onClick={() => setShowInvite(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <UserPlus size={15} /> Send invite link
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Pending review', value: apps.filter((a: any) => a.status === 'pending').length, color: 'var(--amber)' },
            { label: 'Approved (pipeline active)', value: apps.filter((a: any) => a.status === 'approved').length, color: 'var(--green)' },
            { label: 'Awaiting more info', value: apps.filter((a: any) => a.status === 'more_info').length, color: 'var(--blue)' },
            { label: 'Invites sent (unused)', value: invites.filter((i: any) => !i.usedAt).length, color: 'var(--muted)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              style={{ padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s', borderColor: filter === tab.key ? 'var(--olive)' : 'var(--border)', background: filter === tab.key ? 'var(--olive)' : 'var(--surface)', color: filter === tab.key ? '#fff' : 'var(--ink-2)' }}>
              {tab.label} <span style={{ marginLeft: 4, background: filter === tab.key ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)', padding: '1px 7px', borderRadius: 10, fontSize: 11 }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Applications list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading applications...</div>
          ) : filtered.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, color: 'var(--ink)', marginBottom: 6 }}>No {filter === 'all' ? '' : filter} applications</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {filter === 'pending' ? 'Send invite links to prospective clients to get applications here.' : 'Nothing here yet.'}
              </div>
              {filter === 'pending' && (
                <button onClick={() => setShowInvite(true)} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <UserPlus size={14} /> Send first invite
                </button>
              )}
            </div>
          ) : (
            filtered.map((app: any) => (
              <ApplicationRow key={app.id} app={app} onAction={() => qc.invalidateQueries({ queryKey: ['applications'] })} />
            ))
          )}
        </div>
      </div>

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ['invites'] })} />
    </AppLayout>
  );
}
