const fs = require('fs');
const file = 'frontend/app/settings/steps/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update state type for inlineAddingStep
content = content.replace(
  'const [inlineAddingStep, setInlineAddingStep] = useState(false);',
  'const [inlineAddingStep, setInlineAddingStep] = useState<string | false>(false);'
);

// 2. add groupedSteps memo
const clientStepsFetch = `  const { data: clientSteps = [], isLoading: loadingSteps } = useQuery({
    queryKey: ['steps', clientId || serviceId],
    queryFn: () => apiFetch(\`/api/steps?\${clientId ? \`clientId=\${clientId}\` : \`serviceId=\${serviceId}\`}\`),
    retry: false,
  });`;
  
const groupedStepsCode = `  const groupedSteps = useMemo(() => {
    const groups: Record<string, { serviceId: string; serviceName: string; steps: any[] }> = {};
    clientSteps.forEach((s: any) => {
      const sId = s.serviceId || 'default';
      const sName = s.service?.name || (sId === 'default' ? 'General Pipeline' : s.service?.name);
      if (!groups[sId]) groups[sId] = { serviceId: sId, serviceName: sName, steps: [] };
      groups[sId].steps.push(s);
    });
    // If empty, add a default group so we can still add steps
    if (Object.keys(groups).length === 0) {
      groups['default'] = { serviceId: 'default', serviceName: 'General Pipeline', steps: [] };
    }
    return Object.values(groups);
  }, [clientSteps]);`;

content = content.replace(clientStepsFetch, clientStepsFetch + '\n\n' + groupedStepsCode);

// 3. update addStepMutation to use the serviceId from state
content = content.replace(
  `body: JSON.stringify({ ...data, clientId: clientId || undefined, serviceId: serviceId || undefined }),`,
  `body: JSON.stringify({ ...data, clientId: clientId || undefined, serviceId: (inlineAddingStep && inlineAddingStep !== 'default') ? inlineAddingStep : (serviceId || undefined) }),`
);

// 4. Update the render logic!
const oldRenderStart = content.indexOf('{/* Header and Add Button */}');
const oldRenderEnd = content.indexOf('</div>\n\n      {/* Panel Footer */}');

if (oldRenderStart === -1 || oldRenderEnd === -1) {
  console.log("Could not find render boundaries");
  process.exit(1);
}

const newRenderLogic = `{/* Header */}
        {!hideHeader && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>
              Configure Pipeline Steps ({clientSteps.length})
            </span>
          </div>
        )}

        {/* Steps List Grouped by Service */}
        {loadingSteps ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PulseStyle />
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 14,
                  background: 'var(--surface-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '60%' }}>
                    <Skeleton height={20} width={24} borderRadius={4} />
                    <Skeleton height={16} width="80%" />
                  </div>
                  <Skeleton height={24} width={50} borderRadius={4} />
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <Skeleton height={12} width={120} />
                  <Skeleton height={12} width={80} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {groupedSteps.map(group => (
              <div key={group.serviceId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {group.serviceName}
                  </div>
                  {!inlineAddingStep && !focusStepId && (
                    <button
                      onClick={() => {
                        setInlineAddForm({
                          name: '',
                          owningTeamName: teamsList[0] || '',
                          slaDays: 3,
                          stepNumber: String(group.steps.length + 1),
                        });
                        setInlineAddingStep(group.serviceId);
                        setInlineAddError('');
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 12px',
                        background: 'var(--olive-50)',
                        color: 'var(--olive-dark)',
                        border: '1px solid var(--olive-200)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} /> Add Step
                    </button>
                  )}
                </div>

                {inlineAddingStep === group.serviceId && (
                  <div style={{ border: '1px dashed var(--olive)', borderRadius: 8, padding: 16, background: 'var(--surface-2)', marginBottom: 16 }}>
                    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 16, color: 'var(--ink)', marginBottom: 12 }}>
                      Add New Step to {group.serviceName}
                    </div>
                    {/* (Add Form Fields) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Step Name *</label>
                        <input value={inlineAddForm.name} onChange={(e) => setInlineAddForm((f) => ({ ...f, name: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>SLA (working days)</label>
                        <input type="number" min={1} value={inlineAddForm.slaDays} onKeyDown={restrictNumericKeyDown} onChange={(e) => { const parsed = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10); setInlineAddForm((f) => ({ ...f, slaDays: isNaN(parsed) || parsed < 1 ? 1 : parsed })); }} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Owning Team *</label>
                        <select value={inlineAddForm.owningTeamName} onChange={(e) => setInlineAddForm((f) => ({ ...f, owningTeamName: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)' }}>
                          <option value="">Select team...</option>
                          {teamsList.map((t: string) => (<option key={t} value={t}>{t}</option>))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>Position / Number</label>
                        <input type="number" min={1} value={inlineAddForm.stepNumber} onKeyDown={restrictNumericKeyDown} onChange={(e) => setInlineAddForm((f) => ({ ...f, stepNumber: e.target.value.replace(/[^0-9]/g, '') }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)' }} />
                      </div>
                    </div>
                    {inlineAddError && <div style={{ padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>{inlineAddError}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button onClick={() => setInlineAddingStep(false)} style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => { setInlineAddError(''); addStepMutation.mutate(inlineAddForm); }} disabled={addStepMutation.isPending || !inlineAddForm.name || !inlineAddForm.owningTeamName} style={{ padding: '6px 14px', border: 'none', borderRadius: 4, background: 'var(--olive)', color: '#fff', cursor: 'pointer' }}>{addStepMutation.isPending ? 'Adding...' : 'Add'}</button>
                    </div>
                  </div>
                )}

                {group.steps.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>No steps configured for this service.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(focusStepId ? group.steps.filter((s: any) => s.id === focusStepId) : group.steps).map((s: any) => {
                      const isEditingThisStep = s.id === inlineEditingStepId;
                      // Replace the map inner code with the original code structure but using a placeholder to be safe:
                      // Wait, I need the full inline edit code. I'll just keep the original string.
                      return null;
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}`;

// Wait, replacing the entire render block with string concatenation is hard if I want to preserve the complex editing block.
// Let's use a smarter approach in the patch script!
