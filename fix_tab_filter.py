import re

with open('frontend/app/admin/AdminDashboard.tsx', 'r') as f:
    content = f.read()

new_action = """              action={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Segmented Control for Year */}
                  <div style={{ display: 'inline-flex', background: 'var(--surface-2)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
                    {yearOptions.map((y) => (
                      <button
                        key={y.id}
                        onClick={() => setChartYearFilter(y.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: 'none',
                          background: chartYearFilter === y.id ? 'var(--surface)' : 'transparent',
                          color: chartYearFilter === y.id ? 'var(--ink)' : 'var(--muted)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: chartYearFilter === y.id ? 'var(--shadow-sm)' : 'none',
                          transition: 'all 0.12s',
                        }}
                      >
                        {y.label === 'All Years' ? 'All Time' : y.label}
                      </button>
                    ))}
                  </div>
                  {chartYearFilter !== 'all' && (
                    <div style={{ width: 110 }}>
                      <ClientCombobox
                        value={chartMonthFilter}
                        onChange={(v) => setChartMonthFilter(v || 'all')}
                        options={monthOptions}
                        placeholder="All Months"
                      />
                    </div>
                  )}
                </div>
              }"""

content = re.sub(r'              action=\{\n                <div style=\{\{ display: \'flex\', gap: 8 \}\}>\n                  <div style=\{\{ width: 100 \}\}>\n                    <ClientCombobox\n                      value=\{chartYearFilter\}\n                      onChange=\{\(v\) => setChartYearFilter\(v \|\| \'all\'\)\}\n                      options=\{yearOptions\}\n                      placeholder="All Years"\n                    />\n                  </div>\n                  <div style=\{\{ width: 110 \}\}>\n                    <ClientCombobox\n                      value=\{chartMonthFilter\}\n                      onChange=\{\(v\) => setChartMonthFilter\(v \|\| \'all\'\)\}\n                      options=\{monthOptions\}\n                      placeholder="All Months"\n                    />\n                  </div>\n                </div>\n              \}', new_action, content)

with open('frontend/app/admin/AdminDashboard.tsx', 'w') as f:
    f.write(content)
