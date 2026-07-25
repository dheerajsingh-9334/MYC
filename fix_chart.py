import re

with open('frontend/app/admin/AdminDashboard.tsx', 'r') as f:
    content = f.read()

# 1. Add state variables
state_vars = """  const [adminTaskTab, setAdminTaskTab] = useState<'all' | 'active' | 'completed' | 'rejected' | 'problems'>('active');
  const [chartYearFilter, setChartYearFilter] = useState<string>('all');
  const [chartMonthFilter, setChartMonthFilter] = useState<string>('all');"""
content = re.sub(r'  const \[adminTaskTab, setAdminTaskTab\] = useState<\'all\' \| \'active\' \| \'completed\' \| \'rejected\' \| \'problems\'>\(\'active\'\);', state_vars, content)

# 2. Replace allTimeJoinData
data_block = """  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(allClients.map((c: any) => new Date(c.dateJoined || c.createdAt || c.addedAt || new Date()).getFullYear()))).sort().reverse();
    return [{ id: 'all', label: 'All Years' }, ...years.map(y => ({ id: y.toString(), label: y.toString() }))];
  }, [allClients]);

  const monthOptions = [
    { id: 'all', label: 'All Months' },
    ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({ id: i.toString(), label: m }))
  ];

  const allTimeJoinData = useMemo(() => {
    if (allTasks.length === 100 && allClients.length === 0) {
      return { labels: ['Jan', 'Feb', 'Mar', 'Apr'], data: [10, 20, 30, 40], clientsByMonth: {} };
    }
    
    let sorted = [...allClients].map((c: any) => {
      const date = new Date(c.dateJoined || c.createdAt || c.addedAt || new Date());
      return { ...c, parsedDate: date };
    }).sort((a: any, b: any) => a.parsedDate.getTime() - b.parsedDate.getTime());

    if (chartYearFilter !== 'all') {
      sorted = sorted.filter(c => c.parsedDate.getFullYear().toString() === chartYearFilter);
    }
    if (chartMonthFilter !== 'all') {
      sorted = sorted.filter(c => c.parsedDate.getMonth().toString() === chartMonthFilter);
    }

    const counts: { [key: string]: number } = {};
    const clientsByMonth: { [key: string]: string[] } = {};

    sorted.forEach(c => {
      let label = '';
      if (chartYearFilter === 'all' && chartMonthFilter === 'all') {
        label = format(c.parsedDate, 'MMM yy');
      } else if (chartYearFilter !== 'all' && chartMonthFilter === 'all') {
        label = format(c.parsedDate, 'MMM');
      } else {
        label = format(c.parsedDate, 'd MMM');
      }
      counts[label] = (counts[label] || 0) + 1;
      if (!clientsByMonth[label]) clientsByMonth[label] = [];
      clientsByMonth[label].push(c.brandName || c.fullName || 'Unknown');
    });

    const labels: string[] = [];
    const data: number[] = [];

    if (chartYearFilter === 'all' && chartMonthFilter === 'all') {
      const uniqueLabels = Array.from(new Set(sorted.map(c => format(c.parsedDate, 'MMM yy'))));
      if (uniqueLabels.length === 0) uniqueLabels.push(format(new Date(), 'MMM yy'));
      uniqueLabels.forEach(l => {
        labels.push(l);
        data.push(counts[l] || 0);
      });
    } else if (chartYearFilter !== 'all' && chartMonthFilter === 'all') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.forEach(m => {
        labels.push(m);
        data.push(counts[m] || 0);
      });
    } else {
      const year = chartYearFilter !== 'all' ? parseInt(chartYearFilter) : new Date().getFullYear();
      const month = chartMonthFilter !== 'all' ? parseInt(chartMonthFilter) : new Date().getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const l = format(new Date(year, month, d), 'd MMM');
        labels.push(l);
        data.push(counts[l] || 0);
      }
    }

    return { labels, data, clientsByMonth };
  }, [allClients, chartYearFilter, chartMonthFilter]);"""

content = re.sub(r'  const allTimeJoinData = useMemo\(\(\) => \{.*?(?=  const launchedLineChartData = useMemo)', data_block + '\n\n', content, flags=re.DOTALL)


# 3. Replace the chart render logic
chart_render = """            <SectionCard
              title="Client Joins"
              subtitle="Monthly client onboarding"
              padding="16px 20px"
              style={{ flexShrink: 0 }}
              action={
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 100 }}>
                    <ClientCombobox
                      value={chartYearFilter}
                      onChange={(v) => setChartYearFilter(v || 'all')}
                      options={yearOptions}
                      placeholder="All Years"
                    />
                  </div>
                  <div style={{ width: 110 }}>
                    <ClientCombobox
                      value={chartMonthFilter}
                      onChange={(v) => setChartMonthFilter(v || 'all')}
                      options={monthOptions}
                      placeholder="All Months"
                    />
                  </div>
                </div>
              }
            >
              <div style={{ width: '100%', height: 180, position: 'relative' }}>
                {(() => {
                  const { labels, data, clientsByMonth } = allTimeJoinData;
                  const maxVal = Math.max(...data, 10);
                  const minVal = 0;
                  const range = maxVal;

                  const width = 500;
                  const height = 180;
                  const padding = 35;

                  const chartWidth = width - padding * 2;
                  const chartHeight = height - padding * 2;

                  const points = data.map((val, idx) => {
                    const barWidth = Math.max(4, (chartWidth / data.length) - 4);
                    const x = padding + (idx / data.length) * chartWidth + (chartWidth / data.length - barWidth) / 2;
                    const barHeight = range > 0 ? (val / maxVal) * chartHeight : 0;
                    const y = padding + chartHeight - barHeight;
                    return { x, y, val, label: labels[idx], barWidth, barHeight };
                  });

                  return (
                    <>
                      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        {/* Grid Lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                          const y = padding + chartHeight * pct;
                          const val = Math.round(maxVal - pct * range);
                          return (
                            <g key={idx}>
                              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                              <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontWeight="600">{val}</text>
                            </g>
                          );
                        })}

                        {/* Bars */}
                        {points.map((p, idx) => (
                          <rect key={idx} x={p.x} y={p.y} width={p.barWidth} height={p.barHeight} rx={2}
                            fill={growthTooltip?.label === p.label ? 'var(--olive)' : 'var(--olive-50)'}
                            style={{ transition: 'fill 0.15s, opacity 0.15s', cursor: 'pointer' }}
                            onMouseEnter={() => setGrowthTooltip({ x: p.x + p.barWidth/2, y: p.y, label: p.label, val: p.val })}
                            onMouseLeave={() => setGrowthTooltip(null)}
                          />
                        ))}
"""

content = re.sub(r'            <SectionCard\s+title="Client Growth Over Time".*?\{/\* Data Points \*/\}.*?</svg>', chart_render + '\n                      </svg>', content, flags=re.DOTALL)


with open('frontend/app/admin/AdminDashboard.tsx', 'w') as f:
    f.write(content)
