const fs = require('fs');
const file = 'frontend/app/settings/steps/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Import ActionDropdown
if (!content.includes('ActionDropdown')) {
  content = content.replace(
    `import { Settings, Plus, Trash2 } from 'lucide-react';`,
    `import { Settings, Plus, Trash2 } from 'lucide-react';\nimport ActionDropdown from '@/components/ui/ActionDropdown';`
  );
}

// 2. Add state and mutation inside ManageStepsPanel
const stateInsertPoint = `  const [stepIdToDeleteConfirmation, setStepIdToDeleteConfirmation] = useState<string | null>(null);`;
if (!content.includes('deletingServiceId')) {
  const newStates = `  const [stepIdToDeleteConfirmation, setStepIdToDeleteConfirmation] = useState<string | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => apiFetch(\`/api/clients/\${clientId}/services/\${serviceId}\`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps', clientId] });
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      setDeletingServiceId(null);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to remove service');
      setDeletingServiceId(null);
    }
  });`;
  content = content.replace(stateInsertPoint, newStates);
}

// 3. Update the header rendering
const oldHeaderStart = `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.serviceName}</h3>
                  {!inlineAddingStep && !focusStepId && (`;
                  
const oldHeaderFull = `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.serviceName}</h3>
                  {!inlineAddingStep && !focusStepId && (
                    <button
                      onClick={() => {
                        setInlineAddForm({ name: '', owningTeamName: teamsList[0] || '', slaDays: 3, stepNumber: String(group.steps.length + 1) });
                        setInlineAddingStep(group.serviceId);
                        setInlineAddError('');
                      }}
                      style={{ padding: '6px 12px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                    >
                      <Plus size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add Step
                    </button>
                  )}
                </div>`;
                
const newHeaderFull = `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group.serviceName}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!inlineAddingStep && !focusStepId && (
                      <button
                        onClick={() => {
                          setInlineAddForm({ name: '', owningTeamName: teamsList[0] || '', slaDays: 3, stepNumber: String(group.steps.length + 1) });
                          setInlineAddingStep(group.serviceId);
                          setInlineAddError('');
                        }}
                        style={{ padding: '6px 12px', background: 'var(--olive)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                      >
                        <Plus size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add Step
                      </button>
                    )}
                    {clientId && group.serviceId !== 'default' && groupedSteps.length > 1 && (
                      deletingServiceId === group.serviceId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Remove {group.serviceName}?</span>
                          <button onClick={() => deleteServiceMutation.mutate(group.serviceId)} disabled={deleteServiceMutation.isPending} style={{ padding: '4px 10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                            {deleteServiceMutation.isPending ? '...' : 'Yes'}
                          </button>
                          <button onClick={() => setDeletingServiceId(null)} style={{ padding: '4px 10px', background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <ActionDropdown
                          align="right"
                          actions={[
                            {
                              label: 'Remove Service',
                              icon: <Trash2 size={13} />,
                              onClick: () => setDeletingServiceId(group.serviceId),
                            }
                          ]}
                        />
                      )
                    )}
                  </div>
                </div>`;
                
if (!content.includes('deletingServiceId === group.serviceId')) {
  content = content.replace(oldHeaderFull, newHeaderFull);
}

fs.writeFileSync(file, content);
console.log('patched manage steps');
