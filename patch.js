const fs = require('fs');
const file = 'frontend/components/pipeline/ClientDetailPane.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(
  "import UpdateTaskModal from '@/components/pipeline/UpdateTaskModal';\nimport { ClientDetailSkeleton } from '@/components/ui/SkeletonLoader';",
  "import UpdateTaskModal from '@/components/pipeline/UpdateTaskModal';\nimport AssignServiceModal from '@/components/pipeline/AssignServiceModal';\nimport { ClientDetailSkeleton } from '@/components/ui/SkeletonLoader';"
);

// 2. State
content = content.replace(
  "const [showUpdateClient, setShowUpdateClient] = useState(false);\n  const [editingTask, setEditingTask] = useState<any>(null);",
  "const [showUpdateClient, setShowUpdateClient] = useState(false);\n  const [showAssignService, setShowAssignService] = useState(false);\n  const [editingTask, setEditingTask] = useState<any>(null);"
);

// 3. Action dropdown
content = content.replace(
  "{\n        label: 'Update',\n        icon: <Edit2 size={13} />,\n        onClick: () => setShowUpdateClient(true),\n      },\n      {\n        label: 'Delete',",
  "{\n        label: 'Update',\n        icon: <Edit2 size={13} />,\n        onClick: () => setShowUpdateClient(true),\n      },\n      {\n        label: 'Assign Service',\n        icon: <Plus size={13} />,\n        onClick: () => setShowAssignService(true),\n      },\n      {\n        label: 'Delete',"
);

// 4. Pipeline tracks
const oldPipelineTrack = `        {/* ── PIPELINE TRACK ──────────────────────────────────────────── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
          {/* Progress header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Current Progress</div>
              <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>
                Step {currentStepNum} of {steps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{client.currentStep?.name}</span>
              </div>
            </div>
            {/* <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>Days in current step</div>
              <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 18, fontWeight: 700, color: isOverSLA ? 'var(--red)' : 'var(--olive)' }}>
                {daysInStep} / {sla} SLA
              </div>
            </div> */}
          </div>

          {/* Dynamic pipeline track */}
          <div style={{ overflowX: 'auto', paddingBottom: 8 }} className="custom-scrollbar">
            <div style={{ display: 'grid', gridTemplateColumns: \`repeat(\${steps.length || 1}, 1fr)\`, gap: 0, position: 'relative', minWidth: 800 }}>
              {/* Connecting line */}
              <div style={{ position: 'absolute', top: 18, left: '5%', right: '5%', height: 2, background: 'var(--border)', zIndex: 0 }} />

              {steps.map((step, i) => {
                const stepNum = step.stepNumber;
                const completed = stepNum < currentStepNum;
                const current = stepNum === currentStepNum;
                const future = stepNum > currentStepNum;

                return (
                  <div key={step.id}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, cursor: isAdmin ? 'pointer' : 'default', padding: '4px 2px' }}>
                    {/* Circle */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                      background: completed ? 'var(--olive)' : current ? 'var(--surface)' : 'var(--surface)',
                      border: \`2px solid \${completed ? 'var(--olive)' : current ? 'var(--olive)' : 'var(--border)'}\`,
                      color: completed ? '#fff' : current ? 'var(--olive)' : 'var(--muted)',
                      boxShadow: current ? '0 0 0 4px var(--olive-50)' : 'none',
                    }}>
                      {completed ? '✓' : stepNum}
                    </div>

                    {/* Pulse dot for current */}
                    {current && (
                      <span style={{
                        position: 'absolute', top: 14,
                        width: 8, height: 8, background: 'var(--olive)', borderRadius: '50%',
                        animation: 'pulse 2s infinite',
                      }} />
                    )}

                    {/* Label */}
                    <div style={{
                      fontSize: 11, textAlign: 'center', lineHeight: 1.3, maxWidth: 80,
                      fontWeight: current ? 600 : 500,
                      color: current ? 'var(--olive)' : completed ? 'var(--ink-2)' : 'var(--muted)',
                    }}>
                      {step.name}
                      {durations[step.id] && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic', fontWeight: 400 }}>
                          ⏱️ {durations[step.id]}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>`;

const newPipelineTracks = `        {/* ── PIPELINE TRACKS ──────────────────────────────────────────── */}
        {client.clientServices && client.clientServices.length > 0 ? (
          client.clientServices.map((cs: any) => {
            const svc = cs.service;
            const clientSvcSteps = steps.filter((s: any) => s.serviceId === cs.serviceId || (!s.serviceId && client.serviceId === cs.serviceId));
            const svcSteps = clientSvcSteps.length > 0 ? clientSvcSteps : (svc?.steps?.filter((s: any) => s.clientId === null) || []);
            const svcCurrentStepNum = cs.currentStep?.stepNumber || 1;
            
            return (
              <div key={cs.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{svc?.name || 'Pipeline'} Progress</div>
                    <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>
                      Step {svcCurrentStepNum} of {svcSteps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{cs.currentStep?.name}</span>
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', paddingBottom: 8 }} className="custom-scrollbar">
                  <div style={{ display: 'grid', gridTemplateColumns: \`repeat(\${svcSteps.length || 1}, 1fr)\`, gap: 0, position: 'relative', minWidth: 800 }}>
                    <div style={{ position: 'absolute', top: 18, left: '5%', right: '5%', height: 2, background: 'var(--border)', zIndex: 0 }} />

                    {svcSteps.map((step: any) => {
                      const stepNum = step.stepNumber;
                      const completed = stepNum < svcCurrentStepNum;
                      const current = stepNum === svcCurrentStepNum;
                      
                      return (
                        <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, cursor: isAdmin ? 'pointer' : 'default', padding: '4px 2px' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                            background: completed ? 'var(--olive)' : current ? 'var(--surface)' : 'var(--surface)',
                            border: \`2px solid \${completed ? 'var(--olive)' : current ? 'var(--olive)' : 'var(--border)'}\`,
                            color: completed ? '#fff' : current ? 'var(--olive)' : 'var(--muted)',
                            boxShadow: current ? '0 0 0 4px var(--olive-50)' : 'none',
                          }}>
                            {completed ? '✓' : stepNum}
                          </div>
                          {current && <span style={{ position: 'absolute', top: 14, width: 8, height: 8, background: 'var(--olive)', borderRadius: '50%', animation: 'pulse 2s infinite' }} />}
                          <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.3, maxWidth: 80, fontWeight: current ? 600 : 500, color: current ? 'var(--olive)' : completed ? 'var(--ink-2)' : 'var(--muted)' }}>
                            {step.name}
                            {durations[step.id] && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic', fontWeight: 400 }}>⏱️ {durations[step.id]}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Current Progress</div>
                <div style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', fontSize: 22, color: 'var(--ink)' }}>
                  Step {currentStepNum} of {steps.length} — <span style={{ color: 'var(--olive)', fontStyle: 'italic' }}>{client.currentStep?.name}</span>
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto', paddingBottom: 8 }} className="custom-scrollbar">
              <div style={{ display: 'grid', gridTemplateColumns: \`repeat(\${steps.length || 1}, 1fr)\`, gap: 0, position: 'relative', minWidth: 800 }}>
                <div style={{ position: 'absolute', top: 18, left: '5%', right: '5%', height: 2, background: 'var(--border)', zIndex: 0 }} />

                {steps.map((step: any) => {
                  const stepNum = step.stepNumber;
                  const completed = stepNum < currentStepNum;
                  const current = stepNum === currentStepNum;

                  return (
                    <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1, cursor: isAdmin ? 'pointer' : 'default', padding: '4px 2px' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                        background: completed ? 'var(--olive)' : current ? 'var(--surface)' : 'var(--surface)',
                        border: \`2px solid \${completed ? 'var(--olive)' : current ? 'var(--olive)' : 'var(--border)'}\`,
                        color: completed ? '#fff' : current ? 'var(--olive)' : 'var(--muted)',
                        boxShadow: current ? '0 0 0 4px var(--olive-50)' : 'none',
                      }}>
                        {completed ? '✓' : stepNum}
                      </div>
                      {current && <span style={{ position: 'absolute', top: 14, width: 8, height: 8, background: 'var(--olive)', borderRadius: '50%', animation: 'pulse 2s infinite' }} />}
                      <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.3, maxWidth: 80, fontWeight: current ? 600 : 500, color: current ? 'var(--olive)' : completed ? 'var(--ink-2)' : 'var(--muted)' }}>
                        {step.name}
                        {durations[step.id] && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontStyle: 'italic', fontWeight: 400 }}>⏱️ {durations[step.id]}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}`;

content = content.replace(oldPipelineTrack, newPipelineTracks);

// 5. Add Modal rendering
content = content.replace(
  "        {editingTask && isAdmin && (\n          <UpdateTaskModal\n            open={!!editingTask}\n            onClose={() => setEditingTask(null)}\n            onSuccess={() => qc.invalidateQueries({ queryKey: ['client', id] })}\n            task={editingTask}\n            users={usersList}\n          />\n        )}\n      </div>",
  "        {editingTask && isAdmin && (\n          <UpdateTaskModal\n            open={!!editingTask}\n            onClose={() => setEditingTask(null)}\n            onSuccess={() => qc.invalidateQueries({ queryKey: ['client', id] })}\n            task={editingTask}\n            users={usersList}\n          />\n        )}\n        <AssignServiceModal\n          open={showAssignService}\n          onClose={() => setShowAssignService(false)}\n          clientId={id as string}\n        />\n      </div>"
);

// 6. Update steps mapping in add task form
content = content.replace(
  "            <option value=\"\" disabled>Select a step...</option>\n            {steps.map((s: any) => (\n              <option key={s.id} value={s.id}>Step {s.stepNumber} - {s.name}</option>\n            ))}\n          </select>",
  "            <option value=\"\" disabled>Select a step...</option>\n            {steps.map((s: any) => {\n              const svc = client?.clientServices?.find((cs: any) => cs.serviceId === s.serviceId)?.service;\n              return (\n                <option key={s.id} value={s.id}>\n                  {svc ? `[${svc.name}] ` : ''}Step {s.stepNumber} - {s.name}\n                </option>\n              );\n            })}\n          </select>"
);


fs.writeFileSync(file, content);
console.log('patched');
