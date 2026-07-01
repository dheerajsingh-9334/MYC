'use client';
import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { USE_MOCK, MOCK_STEPS } from '@/lib/mockData';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X, Plus, GripVertical, Trash2 } from 'lucide-react';

type Template = { id?: string; title: string; description: string; relativeDueDay: number; priority: 'high' | 'normal'; sortOrder: number };
type Step = { id: string; stepNumber: number; name: string; owningTeamName: string; slaDays: number; isActive: boolean; taskTemplates?: Template[] };

export default function StepConfigPage() {
  const qc = useQueryClient();
  const [editStep, setEditStep] = useState<Step | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { data: liveSteps = [] } = useQuery({
    queryKey: ['steps'],
    queryFn: () => apiFetch('/api/steps'),
    enabled: !USE_MOCK,
    retry: false,
  });
  const steps: Step[] = USE_MOCK ? MOCK_STEPS : liveSteps;

  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    retry: false,
  });

  const handleCreateNewTeam = async () => {
    const name = prompt('Enter new team name:');
    if (!name?.trim()) return;
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      qc.invalidateQueries({ queryKey: ['teams'] });
      setEditStep(s => s ? { ...s, owningTeamName: name.trim() } : s);
    } catch (e: any) {
      alert(e.message || 'Failed to create team');
    }
  };

  const openEdit = async (step: Step) => {
    try {
      const full = await apiFetch(`/api/steps/${step.id}`);
      setEditStep(full);
      setTemplates((full.taskTemplates || []).sort((a: Template, b: Template) => a.sortOrder - b.sortOrder));
    } catch {
      setEditStep(step);
      setTemplates(step.taskTemplates || []);
    }
  };

  const openAddStep = () => {
    setEditStep({
      id: 'new',
      stepNumber: steps.length + 1,
      name: '',
      owningTeamName: '',
      slaDays: 3,
      isActive: true,
    });
    setTemplates([]);
  };

  const handleDelete = async (step: Step) => {
    if (!confirm(`Are you sure you want to delete "${step.name}"? This will also renumber remaining steps.`)) {
      return;
    }
    try {
      await apiFetch(`/api/steps/${step.id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['steps'] });
      setSuccessMsg('Step deleted successfully!');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (e: any) {
      alert(e.message || 'Failed to delete step');
    }
  };

  const addTemplate = () => {
    setTemplates(prev => [...prev, {
      title: '', description: '', relativeDueDay: 3, priority: 'normal', sortOrder: prev.length,
    }]);
  };

  const removeTemplate = (idx: number) => {
    setTemplates(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, sortOrder: i })));
  };

  const updateTemplate = (idx: number, patch: Partial<Template>) => {
    setTemplates(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const handleSave = async () => {
    if (!editStep) return;
    setSaving(true);
    try {
      if (editStep.id === 'new') {
        const createdStep = await apiFetch('/api/steps', {
          method: 'POST',
          body: JSON.stringify({
            name: editStep.name,
            owningTeamName: editStep.owningTeamName,
            slaDays: editStep.slaDays,
            description: '',
            stepNumber: editStep.stepNumber,
          }),
        });

        if (templates.length > 0) {
          await apiFetch(`/api/steps/${createdStep.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name: editStep.name,
              owningTeamName: editStep.owningTeamName,
              slaDays: editStep.slaDays,
              taskTemplates: templates.map((t, i) => ({ ...t, sortOrder: i })),
            }),
          });
        }
        setSuccessMsg('Step created successfully!');
      } else {
        await apiFetch(`/api/steps/${editStep.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: editStep.name,
            owningTeamName: editStep.owningTeamName,
            slaDays: editStep.slaDays,
            taskTemplates: templates.map((t, i) => ({ ...t, sortOrder: i })),
          }),
        });
        setSuccessMsg('Step saved!');
      }
      qc.invalidateQueries({ queryKey: ['steps'] });
      setEditStep(null);
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (e: any) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <Topbar title="Step Config" subtitle="Define stages, teams, SLAs, and task templates" />
      <div style={{ padding: '16px 20px', flex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 32, color: 'var(--ink)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>Step Configuration</h1>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6 }}>Define stages, owning teams, SLAs, and task templates. Changes apply to future clients only.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {successMsg && <div style={{ padding: '8px 16px', background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>✓ {successMsg}</div>}
            <button onClick={openAddStep}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              <Plus size={14} /> Add Step
            </button>
          </div>
        </div>

        {/* Steps list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((step: any) => {
            const num = step.stepNumber;
            const numPad = String(num).padStart(2, '0');
            const taskCount = step.taskCount ?? step.taskTemplates?.length ?? 0;
            const taskDesc = step.taskDesc ?? step.taskTemplates?.map((t: any) => t.title).join(', ') ?? '';

            return (
              <div key={step.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                padding: '16px 20px', display: 'grid',
                gridTemplateColumns: '36px 2fr 1.5fr 1fr auto', gap: 16, alignItems: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--olive-200)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>

                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--olive-50)', color: 'var(--olive)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
                  {numPad}
                </div>

                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{step.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{taskCount} tasks {taskDesc.length > 0 && `· ${taskDesc.length > 60 ? taskDesc.slice(0, 60) + '…' : taskDesc}`}</div>
                </div>

                <div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)' }} />
                    {step.owningTeamName}
                  </span>
                </div>

                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--ink-2)' }}>
                  {step.slaDays} day{step.slaDays !== 1 ? 's' : ''} SLA
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(step)}
                    style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--olive)'; (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--olive)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(step)}
                    style={{ padding: '6px 10px', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--red)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--red)'; (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--red)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLElement).style.color = 'var(--red)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(220,38,38,0.2)'; }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--olive-50)', border: '1px solid var(--olive-100)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--olive-dark)' }}>
          ℹ️ Changes to step configuration only affect future clients. Clients currently in progress are unaffected.
        </div>
      </div>

      {/* ── EDIT/CREATE MODAL ── */}
      {editStep && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEditStep(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>

            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--ink)' }}>
                  {editStep.id === 'new'
                    ? 'Add New Step'
                    : `Edit Step ${String(editStep.stepNumber).padStart(2, '0')} — ${editStep.name}`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Configure this step's team, SLA, and task templates</div>
              </div>
              <button onClick={() => setEditStep(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>

              {/* Step settings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Step Name *</label>
                  <input value={editStep.name} onChange={e => setEditStep(s => s ? { ...s, name: e.target.value } : s)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Owning Team *</label>
                  <select value={editStep.owningTeamName} onChange={e => setEditStep(s => s ? { ...s, owningTeamName: e.target.value } : s)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                    <option value="">Select team...</option>
                    {teamsList.map((t: string) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>SLA (working days)</label>
                  <input type="number" min={1} value={editStep.slaDays} onChange={e => setEditStep(s => s ? { ...s, slaDays: parseInt(e.target.value) || 1 } : s)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                </div>
                {editStep.id === 'new' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Position / Step Number</label>
                    <input type="number" min={1} max={steps.length + 1} value={editStep.stepNumber} onChange={e => setEditStep(s => s ? { ...s, stepNumber: parseInt(e.target.value) || (steps.length + 1) } : s)}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                  </div>
                )}
              </div>

              {/* Task templates */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Task Templates ({templates.length})</div>
                  <button onClick={addTemplate}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={13} /> Add task
                  </button>
                </div>

                {templates.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
                    No tasks yet — click "Add task" to create the first one
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {templates.map((t, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', background: 'var(--surface-2)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <input value={t.title} onChange={e => updateTemplate(idx, { title: e.target.value })} placeholder="Task title *"
                          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', fontWeight: 600 }} />
                        <select value={t.priority} onChange={e => updateTemplate(idx, { priority: e.target.value as 'high' | 'normal' })}
                          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}>
                          <option value="normal">Normal</option>
                          <option value="high">High priority</option>
                        </select>
                        <button onClick={() => removeTemplate(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                        <input value={t.description} onChange={e => updateTemplate(idx, { description: e.target.value })} placeholder="Description (optional)"
                          style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                        <div>
                          <label style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>DUE DAY</label>
                          <input type="number" min={1} value={t.relativeDueDay} onChange={e => updateTemplate(idx, { relativeDueDay: parseInt(e.target.value) || 1 })}
                            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-2)', flexShrink: 0 }}>
              <button onClick={() => setEditStep(null)} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-2)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 500, background: saving ? 'var(--soft)' : 'var(--olive)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : editStep.id === 'new' ? 'Create Step' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
