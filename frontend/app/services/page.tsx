'use client';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';
import Topbar from '@/components/layout/Topbar';
import SectionCard from '@/components/ui/SectionCard';
import { apiFetch } from '@/lib/api';
import { Layers, Plus, Search, Settings, Trash2, ChevronRight, FolderOpen, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TableSkeleton } from '@/components/ui/SkeletonLoader';
import ActionDropdown from '@/components/ui/ActionDropdown';
import { ManageStepsPanel } from '@/app/settings/steps/page';
import { X } from 'lucide-react';

export default function ServicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [configServiceId, setConfigServiceId] = useState<string | null>(null);
  const [configStepId, setConfigStepId] = useState<string | null>(null);
  
  // Track which services are expanded to show their steps
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});

  const { data: dbTeams = [] } = useQuery<string[]>({
    queryKey: ['teams'],
    queryFn: () => apiFetch('/api/teams'),
  });

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiFetch('/api/services'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => apiFetch('/api/services', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowCreateModal(false);
      setNewServiceName('');
      setNewServiceDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setDeleteConfirm(null);
    },
  });

  const filteredServices = (services || []).filter((s: any) => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleExpand = (serviceId: string) => {
    setExpandedServices(prev => ({
      ...prev,
      [serviceId]: !(prev[serviceId] ?? false),
    }));
  };

  return (
    <AppLayout>
      <Topbar title="Services" subtitle="Manage your client service pipelines" />
      
      <div className="dashboard-mobile-scroll" style={{ padding: 'var(--page-pad)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, boxSizing: 'border-box' }}>
        
        {/* Layout exactly like /tasks matching standard padding/margins */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 20 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Search services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '8px 12px 8px 30px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                outline: 'none',
                width: 250,
                background: 'var(--surface)',
                color: 'var(--ink)'
              }}
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 'var(--radius-sm)', background: 'var(--olive)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--olive-light)'; }} 
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--olive)'; }}
          >
            <Plus size={14} /> Create Service
          </button>
        </div>

        <SectionCard className="dashboard-card-stretch" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }} padding={0}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading services…</div>
          ) : (
            <div
              className="custom-scrollbar"
              style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', margin: '16px 20px 20px', background: 'var(--surface)' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)', width: '30%', userSelect: 'none', whiteSpace: 'nowrap' }}>Service Name</th>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)', width: '40%', userSelect: 'none', whiteSpace: 'nowrap' }}>Description</th>
                    <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)', width: '20%', userSelect: 'none', whiteSpace: 'nowrap' }}>Pipeline Health</th>
                    <th style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 18px', borderBottom: '1px solid var(--border)', width: '10%', userSelect: 'none', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                
                {filteredServices.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                        No services found matching your search.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  filteredServices.map((service: any) => {
                    const isExpanded = expandedServices[service.id] ?? false;
                    const steps = service.steps || [];

                    return (
                      <tbody key={service.id}>
                        {/* Parent Service Row styled EXACTLY like the Client row in /tasks */}
                        <tr 
                          onClick={() => toggleExpand(service.id)}
                          style={{
                            background: 'var(--surface-2)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--olive-100)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        >
                          <td colSpan={4} style={{ position: 'sticky', top: 38, zIndex: 9, background: 'inherit', padding: '10px 18px', fontWeight: 600, borderBottom: '1px solid var(--border)', boxShadow: '0 1px 0 var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: 9,
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s',
                                  color: 'var(--muted)',
                                  flexShrink: 0
                                }}>▶</span>
                                
                                <span style={{
                                  fontSize: 13.5, fontWeight: 700, color: 'var(--olive-dark)',
                                  background: 'var(--olive-50)', padding: '3px 10px', borderRadius: 6,
                                  border: '1px solid var(--olive-100)', letterSpacing: '0.2px',
                                }}>
                                  {service.name}
                                </span>
                                
                                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                                  {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                                </span>
                                
                                <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
                                
                                <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 400 }}>
                                  {service.description || 'No description provided'}
                                </span>
                              </div>

                              {/* Actions pushed to the right */}
                              <div onClick={e => e.stopPropagation()}>
                                <ActionDropdown
                                  actions={[
                                    {
                                      label: 'Configure Steps',
                                      icon: <Settings size={14} />,
                                      onClick: () => setConfigServiceId(service.id),
                                    },
                                    {
                                      label: 'Delete Service',
                                      icon: <Trash2 size={14} />,
                                      onClick: () => setDeleteConfirm({ id: service.id, name: service.name }),
                                      danger: true,
                                    },
                                  ]}
                                />
                              </div>

                            </div>
                          </td>
                        </tr>
                        
                        {/* Nested Steps Rows */}
                        {isExpanded && steps.length > 0 && steps.map((step: any, index: number) => (
                          <tr key={step.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                            <td colSpan={4} style={{ padding: 0 }}>
                              {/* Inner table matching StaffTaskRow structure but simplified for steps */}
                              <div style={{ display: 'flex', padding: '12px 18px 12px 40px', alignItems: 'center' }}>
                                
                                <div style={{ flex: '0 0 30%', display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>
                                    {step.stepNumber}
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{step.name}</span>
                                </div>
                                
                                <div style={{ flex: '0 0 40%' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--olive-light)' }} />
                                    {step.owningTeamName}
                                  </span>
                                </div>
                                
                                <div style={{ flex: '0 0 20%', fontSize: 12, color: 'var(--muted)' }}>
                                  {step.taskTemplates?.length || 0} Task Templates
                                </div>
                                
                                <div style={{ flex: '0 0 10%', textAlign: 'center' }}>
                                  <button
                                    onClick={() => {
                                      setConfigServiceId(service.id);
                                      setConfigStepId(step.id);
                                    }}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                                      background: 'var(--surface-2)', color: 'var(--ink-2)', cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--olive)'; e.currentTarget.style.borderColor = 'var(--olive)'; e.currentTarget.style.background = 'var(--surface)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                                    title="Edit Step"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                </div>
                                
                              </div>
                            </td>
                          </tr>
                        ))}

                        {/* Empty Steps State */}
                        {isExpanded && steps.length === 0 && (
                          <tr style={{ background: 'var(--surface)' }}>
                            <td colSpan={4} style={{ padding: '24px 20px 24px 72px', fontSize: 13, color: 'var(--muted)' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                No steps configured yet. <button onClick={() => setConfigServiceId(service.id)} style={{ background: 'none', border: 'none', color: 'var(--olive)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Configure Pipeline</button>
                              </span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })
                )}
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 24 }} onClick={() => setShowCreateModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', padding: 24, animation: 'slideUp 0.2s ease' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>Create New Service</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Service Name *</label>
              <input
                type="text"
                value={newServiceName}
                onChange={e => setNewServiceName(e.target.value)}
                placeholder="e.g. Web Design Package"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Description</label>
              <textarea
                value={newServiceDesc}
                onChange={e => setNewServiceDesc(e.target.value)}
                placeholder="Optional description"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', minHeight: 80 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate({ name: newServiceName, description: newServiceDesc })}
                disabled={!newServiceName.trim() || createMutation.isPending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--olive)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!newServiceName.trim() || createMutation.isPending) ? 0.7 : 1 }}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 24 }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Trash2 size={18} color="var(--red, #dc2626)" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', }}>Delete Service</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>This action cannot be undone</div>
                </div>
              </div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}>Service to be deleted</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{deleteConfirm.name}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 10, padding: '0 24px 24px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                style={{ padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: deleteMutation.isPending ? 0.7 : 1 }}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP CONFIGURATION MODAL ─────────────────────────────────── */}
      {configServiceId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,25,12,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfigServiceId(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'modalIn 0.2s ease-out', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>Step Configuration — {services?.find((s: any) => s.id === configServiceId)?.name}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Configure steps and tasks for this service pipeline.</div>
              </div>
              <button onClick={() => setConfigServiceId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-2)' }}>
              <ManageStepsPanel
                serviceId={configServiceId}
                clientName={services?.find((s: any) => s.id === configServiceId)?.name || 'Service'}
                teamsList={dbTeams}
                focusStepId={configStepId || undefined}
                hideHeader={true}
                onClearSelection={() => {
                  setConfigServiceId(null);
                  setConfigStepId(null);
                  queryClient.invalidateQueries({ queryKey: ['services'] });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
