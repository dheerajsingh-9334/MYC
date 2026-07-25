const fs = require('fs');
const file = 'frontend/app/tasks/TasksPageContent.tsx';
let content = fs.readFileSync(file, 'utf8');

const filterRegex = /<div ref=\{filterRef\} style=\{\{ position: 'relative' \}\}>[\s\S]*?<\/div>\n\s*\{\/\* showFilters && \.\.\. \*\/\}\n\s*\{\/\* Note: it was nested, we need to match properly \*\/\}/g;

// Since regex on nested divs is hard, I will do a string replace of the block.
const blockStart = `<div ref={filterRef} style={{ position: 'relative' }}>`;
const startIdx = content.indexOf(blockStart);
if (startIdx === -1) {
    console.log("Could not find blockStart");
    process.exit(1);
}

// Find the end of the <div ref={filterRef}> block
let braceCount = 0;
let endIdx = -1;
let i = startIdx;
let inside = false;
while (i < content.length) {
    if (content.substr(i, 4) === '<div') {
        braceCount++;
        inside = true;
    } else if (content.substr(i, 5) === '</div') {
        braceCount--;
    }
    
    if (inside && braceCount === 0) {
        endIdx = i + 6; // include </div>>
        break;
    }
    i++;
}

if (endIdx === -1) {
    console.log("Could not find end of block");
    process.exit(1);
}

const oldBlock = content.substring(startIdx, endIdx);

const newBlock = `
            {/* Inline Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: 30 }}>
                <button onClick={() => setTasksScope('all')} style={{ padding: '0 10px', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'all' ? 'var(--olive)' : 'var(--surface-2)', color: tasksScope === 'all' ? '#fff' : 'var(--ink-2)' }}>All Tasks</button>
                <button onClick={() => setTasksScope('mine')} style={{ padding: '0 10px', border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', background: tasksScope === 'mine' ? 'var(--olive)' : 'var(--surface-2)', color: tasksScope === 'mine' ? '#fff' : 'var(--ink-2)' }}>My Tasks</button>
              </div>

              <div style={{ width: 130 }}>
                <ClientCombobox
                  value={chipFilter}
                  onChange={(val) => setChipFilter(val as ChipKind)}
                  placeholder="Status"
                  searchPlaceholder="Search statuses…"
                  options={chips.map(c => ({ id: c.key, label: \`\${c.label} (\${c.count})\` }))}
                />
              </div>

              <div style={{ width: 130 }}>
                <ClientCombobox
                  value={teamFilter}
                  onChange={setTeamFilter}
                  placeholder="Team"
                  options={teamOptions.map(t => ({ id: t, label: t }))}
                />
              </div>

              <div style={{ width: 140 }}>
                <ClientCombobox value={clientFilter} onChange={setClientFilter} options={clientOptions} placeholder="Client" />
              </div>

              <div style={{ width: 130 }}>
                <ClientCombobox
                  value={assigneeFilter}
                  onChange={setAssigneeFilter}
                  placeholder="Assignee"
                  options={assigneeOptions.map(a => ({ id: a.id, label: a.name }))}
                />
              </div>

              <div style={{ width: 120 }}>
                <ClientCombobox
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  placeholder="Priority"
                  options={[
                    { id: 'high', label: 'High Priority' },
                    { id: 'medium', label: 'Medium Priority' },
                    { id: 'low', label: 'Low Priority' }
                  ]}
                />
              </div>
            </div>
`;

content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);

fs.writeFileSync(file, content);
console.log("Successfully replaced filter block.");
