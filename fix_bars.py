import re

with open('frontend/app/admin/AdminDashboard.tsx', 'r') as f:
    content = f.read()

# 1. Update data generation to group by Week for month view
month_gen = """    sorted.forEach(c => {
      let label = '';
      if (chartYearFilter === 'all' && chartMonthFilter === 'all') {
        label = format(c.parsedDate, 'MMM yy');
      } else if (chartYearFilter !== 'all' && chartMonthFilter === 'all') {
        label = format(c.parsedDate, 'MMM');
      } else {
        const d = c.parsedDate.getDate();
        if (d <= 7) label = 'Week 1';
        else if (d <= 14) label = 'Week 2';
        else if (d <= 21) label = 'Week 3';
        else if (d <= 28) label = 'Week 4';
        else label = 'Week 5';
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
      const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
      weeks.forEach(w => {
        labels.push(w);
        data.push(counts[w] || 0);
      });
    }"""

content = re.sub(r'    sorted\.forEach\(c => \{.*?data\.push\(counts\[l\] \|\| 0\);\n      \}\n    \}', month_gen, content, flags=re.DOTALL)


# 2. Change colors of bars
bars_render = """                        {/* Bars */}
                        {points.map((p, idx) => (
                          <rect key={idx} x={p.x} y={p.y} width={p.barWidth} height={p.barHeight} rx={4}
                            fill={growthTooltip?.label === p.label ? '#0077A3' : '#0096C7'}
                            style={{ transition: 'fill 0.15s, opacity 0.15s', cursor: 'pointer' }}
                            onMouseEnter={() => setGrowthTooltip({ x: p.x + p.barWidth/2, y: p.y, label: p.label, val: p.val })}
                            onMouseLeave={() => setGrowthTooltip(null)}
                          />
                        ))}"""
content = re.sub(r'                        \{/\* Bars \*/\}.*?</rect>\n                        \)\)}', bars_render, content, flags=re.DOTALL)

with open('frontend/app/admin/AdminDashboard.tsx', 'w') as f:
    f.write(content)
