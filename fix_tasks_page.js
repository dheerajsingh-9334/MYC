const fs = require('fs');
const file = 'frontend/app/tasks/TasksPageContent.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Uncomment Subtitle
content = content.replace(/\/\/     : isLeader\n\s*\/\/     \? `\$\{user\?.teamName \|\| 'Team'\} · \$\{counts\.total\} tasks`\n\s*\/\/     : tasksScope === 'all'\n\s*\/\/     \? `Org-wide · \$\{counts\.total\} tasks`\n\s*\/\/     : `\$\{user\?.fullName \|\| 'Team Member'\} · \$\{user\?.teamName \|\| ''\}`\n\s*\/\/ \}/, 
`    : isLeader
    ? \`\${user?.teamName || 'Team'} · \${counts.total} tasks\`
    : tasksScope === 'all'
    ? \`Org-wide · \${counts.total} tasks\`
    : \`\${user?.fullName || 'Team Member'} · \${user?.teamName || ''}\`
}`);

// 2. Uncomment Task Count
content = content.replace(/\{\/\* <span style=\{\{ fontSize: 25, fontWeight: 700, color: 'var\(--ink\)', background: 'var\(--surface-2\)', padding: '3px 9px', borderRadius: 6, border: '1px solid var\(--border\)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' \}\}>\n\s*\{scrollableTasks\.length\} \{scrollableTasks\.length === 1 \? 'task' : 'tasks'\}\n\s*<\/span> \*\/\}/,
`<span style={{ fontSize: 25, fontWeight: 700, color: 'var(--ink)', background: 'var(--surface-2)', padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', whiteSpace: 'nowrap' }}>
              {scrollableTasks.length} {scrollableTasks.length === 1 ? 'task' : 'tasks'}
            </span>`);

// 3. Replace Inline Filters with Dropdown Filters
const inlineFiltersStart = `            {/* Inline Filters */}`;
const inlineFiltersEnd = `              </div>\n            </div>`; // End of the inline filters flex container
const inlineFiltersRegex = /\{\/\* Inline Filters \*\/\}.*?<\/div>\s*<\/div>\n\s*\{isAdmin && \(/s;

const newFilters = `<div ref={filterRef} style={{ position: 'relative' }}>
              <button onClick={() => setShowFilters(prev => !prev)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 11.5, fontWeight: 600, background: (chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter || showFilters) ? 'var(--olive-50)' : 'var(--surface)', color: (chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter || showFilters) ? 'var(--olive-dark)' : 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Filter size={13} /> Filters
                {(chipFilter || teamFilter || clientFilter || assigneeFilter || priorityFilter) && (<span style={{ background: 'var(--olive)', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 700, padding: '1px 5px', marginLeft: 2 }}>{[chipFilter, teamFilter, clientFilter, assigneeFilter, priorityFilter].filter(Boolean).length}</span>)}
                <ChevronDown size={11} style={{ opacity: 0.6, transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </button>
              {showFilters && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 260, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 999, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)', marginBottom: 6 }}>Task Visibility</label><div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}><button onClick={() => setTasksScope('all')} style={{ flex: 1, padding: '6px 0', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'all' ? 'var(--olive)' : 'transparent', color: tasksScope === 'all' ? '#fff' : 'var(--ink-2)' }}>All Tasks</button><button onClick={() => setTasksScope('mine')} style={{ flex: 1, padding: '6px 0', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'mine' ? 'var(--olive)' : 'transparent', color: tasksScope === 'mine' ? '#fff' : 'var(--ink-2)' }}>My Tasks</button></div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)' }}>Status</div>
                    <ClientCombobox
                      value={chipFilter}
                      onChange={(val) => setChipFilter(val as ChipKind)}
                      placeholder="All Statuses"
                      searchPlaceholder="Search statuses…"
                      options={chips.map(c => ({ id: c.key, label: \`\${c.label} (\${c.count})\` }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)' }}>Team</div>
                    <ClientCombobox
                      value={teamFilter}
                      onChange={setTeamFilter}
                      placeholder="All Teams"
                      options={teamOptions.map(t => ({ id: t, label: t }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)' }}>Client</div>
                    <ClientCombobox value={clientFilter} onChange={setClientFilter} options={clientOptions} placeholder="All Clients" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, text, color: 'var(--muted)' }}>Assignee</div>
                    <ClientCombobox
                      value={assigneeFilter}
                      onChange={setAssigneeFilter}
                      placeholder="All Assignees"
                      options={assigneeOptions.map(a => ({ id: a.id, label: a.name }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--muted)' }}>Priority</div>
                    <ClientCombobox
                      value={priorityFilter}
                      onChange={setPriorityFilter}
                      placeholder="All Priorities"
                      options={[
                        { id: 'high', label: 'High Priority' },
                        { id: 'medium', label: 'Medium Priority' },
                        { id: 'low', label: 'Low Priority' }
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
            {isAdmin && (`;

content = content.replace(inlineFiltersRegex, newFilters);

fs.writeFileSync(file, content);
