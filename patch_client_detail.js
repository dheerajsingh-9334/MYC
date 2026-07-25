const fs = require('fs');
const file = 'frontend/components/pipeline/ClientDetailPane.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for deletingServiceId
content = content.replace(
  'const [showAssignService, setShowAssignService] = useState(false);',
  'const [showAssignService, setShowAssignService] = useState(false);\n  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);'
);

// 2. Add deleteServiceMutation
const addStepErrorLine = "const [addStepError, setAddStepError] = useState('');";
const mutationCode = `
  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => apiFetch(\`/api/clients/\${id}/services/\${serviceId}\`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', id] });
      setDeletingServiceId(null);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to remove service');
      setDeletingServiceId(null);
    }
  });
`;
content = content.replace(addStepErrorLine, addStepErrorLine + mutationCode);

// 3. Update the Pipeline Track header to include a delete button
const oldHeader = `                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{svc?.name || 'Pipeline'} Progress</div>
                    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>
                      Step {svcCurrentStepNum} of {svcSteps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{cs.currentStep?.name}</span>
                    </div>
                  </div>
                </div>`;
const newHeader = `                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{svc?.name || 'Pipeline'} Progress</div>
                    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>
                      Step {svcCurrentStepNum} of {svcSteps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{cs.currentStep?.name}</span>
                    </div>
                  </div>
                  {isAdmin && client.clientServices.length > 1 && (
                    <div>
                      {deletingServiceId === cs.serviceId ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Remove {svc?.name}?</span>
                          <button onClick={() => deleteServiceMutation.mutate(cs.serviceId)} disabled={deleteServiceMutation.isPending} style={{ padding: '4px 10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                            {deleteServiceMutation.isPending ? '...' : 'Yes, Remove'}
                          </button>
                          <button onClick={() => setDeletingServiceId(null)} style={{ padding: '4px 10px', background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingServiceId(cs.serviceId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--soft)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }} title="Remove Service">
                          <Trash2 size={15} /> Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>`;
                
content = content.replace(oldHeader, newHeader);

fs.writeFileSync(file, content);
console.log('patched');
