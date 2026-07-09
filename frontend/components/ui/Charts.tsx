import React from 'react';

export function SVGLineChart({ labels, datasets }: { labels: string[]; datasets: { label: string; data: number[]; color: string; dashed?: boolean }[] }) {
  const allData = datasets.flatMap(d => d.data);
  const maxVal = Math.max(...allData) || 10;
  const width = 450;
  const height = 160;
  const paddingX = 40;
  const paddingY = 25;
  const pointsCount = labels.length;
  const stepX = (width - paddingX * 2) / (pointsCount - 1 || 1);
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.03))' }}>
        <defs>
          {datasets.map((ds, idx) => (
            <linearGradient key={`grad-${idx}`} id={`fill-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ds.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={ds.color} stopOpacity="0.0" />
            </linearGradient>
          ))}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = paddingY + (height - paddingY * 2) * (1 - ratio);
          const gridVal = Math.round(maxVal * ratio);
          return (
            <g key={idx}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
              <text x={paddingX - 12} y={y + 3} fontSize="10" fontWeight="500" textAnchor="end" fill="var(--soft)" style={{ fontVariantNumeric: 'tabular-nums' }}>{gridVal}</text>
            </g>
          );
        })}

        {/* X Axis Labels */}
        {labels.map((label, idx) => {
          const x = paddingX + idx * stepX;
          const labelShort = label.split('-').slice(1).join('/');
          return (
            <text key={idx} x={x} y={height - 2} fontSize="10" fontWeight="600" textAnchor="middle" fill="var(--soft)">{labelShort}</text>
          );
        })}

        {/* Lines, Fills, Dots */}
        {datasets.map((ds, dsIdx) => {
          const points = ds.data.map((val, idx) => {
            const x = paddingX + idx * stepX;
            const y = paddingY + (height - paddingY * 2) * (1 - val / maxVal);
            return `${x},${y}`;
          }).join(' ');
          const fillPoints = ds.dashed ? '' : `${paddingX},${height - paddingY} ` + points + ` ${paddingX + (pointsCount - 1) * stepX},${height - paddingY}`;
          return (
            <g key={dsIdx} style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              {!ds.dashed && fillPoints && (
                <polygon fill={`url(#fill-${dsIdx})`} points={fillPoints} />
              )}
              <polyline 
                fill="none" 
                stroke={ds.color} 
                strokeWidth={ds.dashed ? "2" : "3.5"} 
                strokeDasharray={ds.dashed ? "5 5" : undefined} 
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points} 
                filter={!ds.dashed ? "url(#glow)" : undefined}
              />
              {ds.data.map((val, idx) => {
                const x = paddingX + idx * stepX;
                const y = paddingY + (height - paddingY * 2) * (1 - val / maxVal);
                return (
                  <circle 
                    key={idx} cx={x} cy={y} r={ds.dashed ? "3" : "5"} 
                    fill="#fff" stroke={ds.color} strokeWidth={ds.dashed ? "1.5" : "3"} 
                    style={{ transition: 'r 0.2s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.setAttribute('r', ds.dashed ? '5' : '7'); }}
                    onMouseLeave={(e) => { e.currentTarget.setAttribute('r', ds.dashed ? '3' : '5'); }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        {datasets.map((ds, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, padding: '6px 14px', background: 'var(--surface-2)', borderRadius: 999, border: '1px solid var(--border)' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: ds.color, opacity: ds.dashed ? 0.6 : 1 }} />
            <span style={{ color: 'var(--ink)' }}>{ds.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SVGFunnelChart({ steps }: { steps: { name: string; clientCount: number; avgDuration: number }[] }) {
  const maxClients = Math.max(...steps.map(s => s.clientCount)) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', marginTop: 16 }}>
      {steps.map((step, idx) => {
        const pct = (step.clientCount / maxClients) * 100;
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16 }} className="funnel-row">
            <div style={{ width: 110, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {step.name}
            </div>
            <div style={{ flex: 1, height: 28, background: 'var(--surface-2)', borderRadius: 8, position: 'relative', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${pct}%`, 
                  background: 'linear-gradient(90deg, var(--olive-light) 0%, var(--olive) 100%)', 
                  borderRadius: 8, 
                  transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 8px rgba(95, 111, 82, 0.4)'
                }} 
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: pct > 15 ? '#fff' : 'var(--ink)', textShadow: pct > 15 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none' }}>
                {step.clientCount} active
              </span>
            </div>
            <div style={{ width: 75, fontSize: 12, fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>
              Avg {step.avgDuration}d
            </div>
          </div>
        );
      })}
    </div>
  );
}