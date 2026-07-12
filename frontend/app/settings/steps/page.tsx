'use client';
import { useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { X, Plus, Trash2, Settings, ChevronRight, Briefcase, Search, Clock, Shield } from 'lucide-react';

type Template = {
  id?: string;
  title: string;
  description: string;
  relativeDueDay: number;
  priority: 'high' | 'normal';
  sortOrder: number;
};

type Step = {
  id: string;
  stepNumber: number;
  name: string;
  owningTeamName: string;
  slaDays: number;
  isActive: boolean;
  clientId?: string | null;
  taskTemplates?: Template[];
};

export default function StepConfigPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [clientLimit, setClientLimit] = useState(15);

  // Fetch all clients
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiFetch('/api/clients'),
    retry: false,
  });

  // Fetch teams
  const { data: teamsList = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
    retry: false,
  });

  const selectedClient = useMemo(() => {
    return clients.find((c: any) => c.id === selectedClientId);
  }, [clients, selectedClientId]);

  // Search filtering
  const filteredClients = useMemo(() => {
    let list = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        (c.brandName || '').toLowerCase().includes(q) ||
        (c.fullName || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.currentStep?.name || '').toLowerCase().includes(q) ||
        (c.currentStep?.owningTeamName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [clients, search]);

  const scrollableClients = useMemo(() => {
    return filteredClients.slice(0, clientLimit);
  }, [filteredClients, clientLimit]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setClientLimit((prev) => Math.min(prev + 10, filteredClients.length));
    }
  };

  // Reset limit when search changes
  useMemo(() => {
    setClientLimit(15);
  }, [search]);

  const statusConfig: Record<string, { bg: string; color: string; dot: string; label: string }> = {
    on_track:  { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)', label: 'On track' },
    due_today: { bg: 'var(--amber-bg)', color: 'var(--amber)', dot: 'var(--amber)', label: 'Due today' },
    overdue:   { bg: 'var(--red-bg)',   color: 'var(--red)',   dot: 'var(--red)',   label: 'Overdue' },
    blocked:   { bg: '#F0E8FA', color: '#6B3FA0', dot: '#6B3FA0', label: 'Blocked' },
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontSize: '11.5px',
    fontWeight: 600,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    padding: '10px 18px',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'var(--surface-2)',
    zIndex: 10,
  };

  return (
    <AppLayout>
      <Topbar title="Client Step Config" subtitle="Manage pipeline stages scoped per client" />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {/* Left Pane: Client List */}
        <div style={{
          width: 380,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Clients</h2>
            <div style={{ position: 'relative', marginTop: 12 }}>
              <Search size={13} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients…"
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 28px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 0'
            }}
          >
            {loadingClients ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading clients...</div>
            ) : scrollableClients.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No clients match.</div>
            ) : (
              scrollableClients.map((c: any) => {
                const initials = getInitials(c.brandName || c.fullName);
                const isSelected = c.id === selectedClientId;
                const stepNumPad = String(c.currentStep?.stepNumber || 0).padStart(2, '0');

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    style={{
                      padding: '12px 20px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--olive-50)' : 'transparent',
                      borderBottom: '1px solid var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--olive-50)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSelected 
                          ? 'linear-gradient(135deg, var(--olive-dark), var(--olive))' 
                          : 'linear-gradient(135deg, var(--olive), var(--olive-light))',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0
                      }}>
                        {initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13.5, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {c.brandName || c.fullName}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--soft)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {c.currentStep ? `Step ${stepNumPad}: ${c.currentStep.name}` : 'No active step'}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: isSelected ? 'var(--olive)' : 'var(--muted)', flexShrink: 0 }} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Step Config Panel */}
        <div style={{
          flex: 1,
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {selectedClientId && selectedClient ? (
            <ManageStepsPanel
              clientId={selectedClientId}
              clientName={selectedClient.brandName || selectedClient.fullName}
              teamsList={teamsList}
              onClearSelection={() => setSelectedClientId(null)}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              color: 'var(--muted)',
              textAlign: 'center',
              background: 'var(--surface-2)'
            }}>
              <Settings size={44} style={{ color: 'var(--olive)', strokeWidth: 1.2, marginBottom: 16 }} />
              <h3 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--ink)', margin: '0 0 8px 0' }}>
                No Client Selected
              </h3>
              <p style={{ fontSize: 13.5, maxWidth: 300, margin: 0, color: 'var(--soft)' }}>
                Select a client from the left pane to view, customize, and manage their pipeline steps.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ── SEPARATE OPTIMIZED PANEL COMPONENT (isolates typing re-renders) ──
export type ManageStepsPanelProps = {
  clientId: string;
  clientName: string;
  teamsList: string[];
  onClearSelection: () => void;
};

export function ManageStepsPanel({ clientId, clientName, teamsList, onClearSelection }: ManageStepsPanelProps) {
  const qc = useQueryClient();

  // Inline Deletion Confirmation State
  const [stepIdToDeleteConfirmation, setStepIdToDeleteConfirmation] = useState<string | null>(null);

  // Inline Editing State within popup
  const [inlineEditingStepId, setInlineEditingStepId] = useState<string | null>(null);
  const [inlineEditForm, setInlineEditForm] = useState<{
    name: string;
    owningTeamName: string;
    slaDays: number;
    taskTemplates: Template[];
  }>({ name: '', owningTeamName: '', slaDays: 3, taskTemplates: [] });
  const [inlineEditError, setInlineEditError] = useState('');

  // Inline Adding State within popup
  const [inlineAddingStep, setInlineAddingStep] = useState(false);
  const [inlineAddForm, setInlineAddForm] = useState({
    name: '',
    owningTeamName: teamsList[0] || '',
    slaDays: 3,
    stepNumber: '',
  });
  const [inlineAddError, setInlineAddError] = useState('');

  // Fetch client steps
  const { data: clientSteps = [], isLoading: loadingSteps } = useQuery({
    queryKey: ['steps', clientId],
    queryFn: () => apiFetch(`/api/steps?clientId=${clientId}`),
    retry: false,
  });

  // Mutations
  const addStepMutation = useMutation({
    mutationFn: (data: typeof inlineAddForm) =>
      apiFetch('/api/steps', {
        method: 'POST',
        body: JSON.stringify({ ...data, clientId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setInlineAddingStep(false);
      setInlineAddForm({ name: '', owningTeamName: teamsList[0] || '', slaDays: 3, stepNumber: '' });
      setInlineAddError('');
    },
    onError: (err: any) => setInlineAddError(err.message || 'Failed to add step'),
  });

  const editStepMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/api/steps/${inlineEditingStepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, clientId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setInlineEditingStepId(null);
      setInlineEditError('');
    },
    onError: (err: any) => setInlineEditError(err.message || 'Failed to edit step'),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      apiFetch(`/api/steps/${stepId}?clientId=${clientId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (err: any) => alert(err.message || 'Failed to delete step'),
  });

  const startInlineEdit = (s: Step) => {
    setInlineEditingStepId(s.id);
    setInlineEditForm({
      name: s.name,
      owningTeamName: s.owningTeamName,
      slaDays: s.slaDays,
      taskTemplates: s.taskTemplates ? [...s.taskTemplates] : [],
    });
    setInlineEditError('');
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--olive)' }}>
            Manage Pipeline Steps
          </div>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 26, color: 'var(--ink)', marginTop: 4, fontWeight: 600 }}>
            {clientName}
          </div>
        </div>
        <button
          onClick={onClearSelection}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
            background: 'var(--surface)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Clear Selection
        </button>
      </div>

      {/* Panel Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        
        {/* Header and Add Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
            Configure Pipeline Steps ({clientSteps.length})
          </span>
          {!inlineAddingStep && (
            <button
              onClick={() => {
                setInlineAddForm({
                  name: '',
                  owningTeamName: teamsList[0] || '',
                  slaDays: 3,
                  stepNumber: String(clientSteps.length + 1),
                });
                setInlineAddingStep(true);
                setInlineAddError('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                background: 'var(--olive)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Add Step
            </button>
          )}
        </div>

        {/* Inline Adding Step Panel */}
        {inlineAddingStep && (
          <div
            style={{
              border: '1px dashed var(--olive)',
              borderRadius: 8,
              padding: 16,
              background: 'var(--surface-2)',
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
              Add New Step
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  Step Name *
                </label>
                <input
                  value={inlineAddForm.name}
                  onChange={(e) => setInlineAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Copywriting Draft"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  SLA (working days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={inlineAddForm.slaDays}
                  onChange={(e) => setInlineAddForm((f) => ({ ...f, slaDays: parseInt(e.target.value) || 1 }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  Owning Team *
                </label>
                <select
                  value={inlineAddForm.owningTeamName}
                  onChange={(e) => setInlineAddForm((f) => ({ ...f, owningTeamName: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                >
                  <option value="">Select team...</option>
                  {teamsList.map((t: string) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                  Position / Number
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder={`defaults to ${clientSteps.length + 1}`}
                  value={inlineAddForm.stepNumber}
                  onChange={(e) => setInlineAddForm((f) => ({ ...f, stepNumber: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 13,
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {inlineAddError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--red-bg)',
                  color: 'var(--red)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  marginBottom: 12,
                }}
              >
                {inlineAddError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setInlineAddingStep(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setInlineAddError('');
                  addStepMutation.mutate(inlineAddForm);
                }}
                disabled={addStepMutation.isPending || !inlineAddForm.name || !inlineAddForm.owningTeamName}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--olive)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: addStepMutation.isPending || !inlineAddForm.name || !inlineAddForm.owningTeamName ? 0.6 : 1,
                }}
              >
                {addStepMutation.isPending ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        )}

        {/* Steps List */}
        {loadingSteps ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>
            Loading steps...
          </div>
        ) : clientSteps.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 30,
              color: 'var(--muted)',
              fontSize: 13,
              border: '1px dashed var(--border)',
              borderRadius: 8,
            }}
          >
            No steps configured.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {clientSteps.map((s: any) => {
              const isEditingThisStep = s.id === inlineEditingStepId;

              if (isEditingThisStep) {
                // Inline Editing Form
                return (
                  <div
                    key={s.id}
                    style={{
                      border: '1.5px solid var(--olive)',
                      borderRadius: 8,
                      padding: 16,
                      background: 'var(--surface)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                          Step Name *
                        </label>
                        <input
                          value={inlineEditForm.name}
                          onChange={(e) => setInlineEditForm((f) => ({ ...f, name: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 13,
                            background: 'var(--surface)',
                            color: 'var(--ink)',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                          SLA (working days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={inlineEditForm.slaDays}
                          onChange={(e) => setInlineEditForm((f) => ({ ...f, slaDays: parseInt(e.target.value) || 1 }))}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 13,
                            background: 'var(--surface)',
                            color: 'var(--ink)',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
                        Owning Team *
                      </label>
                      <select
                        value={inlineEditForm.owningTeamName}
                        onChange={(e) => setInlineEditForm((f) => ({ ...f, owningTeamName: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          fontSize: 13,
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          outline: 'none',
                        }}
                      >
                        <option value="">Select team...</option>
                        {teamsList.map((t: string) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Task Templates List */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                          Task Templates ({inlineEditForm.taskTemplates.length})
                        </span>
                        <button
                          onClick={() =>
                            setInlineEditForm((f) => ({
                              ...f,
                              taskTemplates: [
                                ...f.taskTemplates,
                                { title: '', description: '', relativeDueDay: 3, priority: 'normal', sortOrder: f.taskTemplates.length },
                              ],
                            }))
                          }
                          style={{
                            padding: '4px 10px',
                            background: 'var(--olive)',
                            border: 'none',
                            borderRadius: 4,
                            color: '#fff',
                            fontSize: 11.5,
                            cursor: 'pointer',
                          }}
                        >
                          + Add Task
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {inlineEditForm.taskTemplates.map((t, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              padding: 10,
                              background: 'var(--surface-2)',
                            }}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                              <input
                                value={t.title}
                                onChange={(e) => {
                                  const updated = [...inlineEditForm.taskTemplates];
                                  updated[idx].title = e.target.value;
                                  setInlineEditForm((f) => ({ ...f, taskTemplates: updated }));
                                }}
                                placeholder="Task Title *"
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                }}
                              />
                              <select
                                value={t.priority}
                                onChange={(e) => {
                                  const updated = [...inlineEditForm.taskTemplates];
                                  updated[idx].priority = e.target.value as 'high' | 'normal';
                                  setInlineEditForm((f) => ({ ...f, taskTemplates: updated }));
                                }}
                                style={{
                                  padding: '6px 8px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                }}
                              >
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                              </select>
                              <button
                                onClick={() =>
                                  setInlineEditForm((f) => ({
                                    ...f,
                                    taskTemplates: f.taskTemplates.filter((_, i) => i !== idx),
                                  }))
                                }
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                value={t.description}
                                onChange={(e) => {
                                  const updated = [...inlineEditForm.taskTemplates];
                                  updated[idx].description = e.target.value;
                                  setInlineEditForm((f) => ({ ...f, taskTemplates: updated }));
                                }}
                                placeholder="Description (optional)"
                                style={{
                                  flex: 1,
                                  padding: '6px 8px',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  background: 'var(--surface)',
                                  color: 'var(--ink)',
                                }}
                              />
                              <div>
                                <input
                                  type="number"
                                  min={1}
                                  value={t.relativeDueDay}
                                  onChange={(e) => {
                                    const updated = [...inlineEditForm.taskTemplates];
                                    updated[idx].relativeDueDay = parseInt(e.target.value) || 1;
                                    setInlineEditForm((f) => ({ ...f, taskTemplates: updated }));
                                  }}
                                  style={{
                                    width: 60,
                                    padding: '6px 8px',
                                    border: '1px solid var(--border)',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    background: 'var(--surface)',
                                    color: 'var(--ink)',
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {inlineEditError && (
                      <div
                        style={{
                          padding: '8px 12px',
                          background: 'var(--red-bg)',
                          color: 'var(--red)',
                          borderRadius: 6,
                          fontSize: 12.5,
                          marginTop: 12,
                        }}
                      >
                        {inlineEditError}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                      <button
                        onClick={() => setInlineEditingStepId(null)}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          background: 'var(--surface)',
                          color: 'var(--ink-2)',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setInlineEditError('');
                          editStepMutation.mutate({
                            name: inlineEditForm.name,
                            owningTeamName: inlineEditForm.owningTeamName,
                            slaDays: inlineEditForm.slaDays,
                            taskTemplates: inlineEditForm.taskTemplates,
                          });
                        }}
                        disabled={editStepMutation.isPending || !inlineEditForm.name || !inlineEditForm.owningTeamName}
                        style={{
                          padding: '6px 14px',
                          border: 'none',
                          borderRadius: 4,
                          background: 'var(--olive)',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: editStepMutation.isPending || !inlineEditForm.name || !inlineEditForm.owningTeamName ? 0.6 : 1,
                        }}
                      >
                        {editStepMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              }

              // Static step item card
              return (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 14,
                    background: 'var(--surface-2)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--olive-200)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--olive)',
                          background: 'var(--olive-50)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {String(s.stepNumber).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
                    </div>
                    {stepIdToDeleteConfirmation === s.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Sure?</span>
                        <button
                          onClick={() => {
                            deleteStepMutation.mutate(s.id);
                            setStepIdToDeleteConfirmation(null);
                          }}
                          style={{
                            padding: '2px 8px',
                            background: 'var(--red)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setStepIdToDeleteConfirmation(null)}
                          style={{
                            padding: '2px 8px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--ink-2)',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                            fontWeight: 500,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => startInlineEdit(s)}
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)' }}
                          title="Edit Step"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          onClick={() => setStepIdToDeleteConfirmation(s.id)}
                          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
                          title="Delete Step"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      Team: {s.owningTeamName}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      SLA: {s.slaDays} days
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      Templates: {s.taskTemplates?.length || 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--surface-2)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClearSelection}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            fontWeight: 500,
            background: 'var(--surface)',
            cursor: 'pointer',
            color: 'var(--ink-2)',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
