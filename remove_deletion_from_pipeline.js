const fs = require('fs');
const file = 'frontend/components/pipeline/ClientDetailPane.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove the deletion logic block from the header
const regex = /\{isAdmin && client\.clientServices\.length > 1 && \([\s\S]*?\}\)[\s\S]*?<\/div>\n[\s\S]*?\}/g;

const startString = `{isAdmin && client.clientServices.length > 1 && (
                    <div>`;
const fullBlock = `{isAdmin && client.clientServices.length > 1 && (
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
                  )}`;
                  
content = content.replace(fullBlock, '');

// Also try replacing the ActionDropdown version if it's there
const actionDropdownBlock = `{isAdmin && client.clientServices.length > 1 && (
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
                        <ActionDropdown
                          align="right"
                          actions={[
                            {
                              label: 'Remove Service',
                              icon: <Trash2 size={13} />,
                              onClick: () => setDeletingServiceId(cs.serviceId),
                            }
                          ]}
                        />
                      )}
                    </div>
                  )}`;
                  
content = content.replace(actionDropdownBlock, '');
fs.writeFileSync(file, content);
