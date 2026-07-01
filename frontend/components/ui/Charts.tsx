'use client';
import React, { useState } from 'react';

// ── BarChart ────────────────────────────────────────────────────────────
// Simple horizontal-bar chart. Each bar = a category (e.g. team) and its
// numeric value (e.g. active tasks). Max value auto-scales.
export function BarChart({
  data, valueLabel = '', accent = 'var(--olive)',
}: {
  data: Array<{ label: string; value: number; subLabel?: string; accent?: string }>;
  valueLabel?: string;
  accent?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        const barColor = d.accent || accent;
        return (
          <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.label}
                </span>
                {d.subLabel && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, marginLeft: 8 }}>{d.subLabel}</span>
                )}
              </div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--ink)', minWidth: 32, textAlign: 'right' }}>
              {d.value}
            </span>
          </div>
        );
      })}
      {valueLabel && (
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 4 }}>
          {valueLabel}
        </div>
      )}
    </div>
  );
}

// ── DonutChart ──────────────────────────────────────────────────────────
// SVG donut. Renders N slices whose arc lengths are proportional to value.
// Hovering a slice or legend row shows a tooltip with the segment's count and %.
export function DonutChart({
  data, size = 140, thickness = 18, centerLabel, centerValue,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {/* slices */}
        {total > 0 && data.map((d, i) => {
          const len = (d.value / total) * c;
          const isHovered = hoverIdx === i;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={isHovered ? thickness + 4 : thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
              style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            >
              <title>{`${d.label}: ${d.value} (${total > 0 ? Math.round((d.value / total) * 100) : 0}%)`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
        {total > 0 && hoverIdx !== null && data[hoverIdx] && (
          <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {data[hoverIdx].label}
          </text>
        )}
        {total > 0 && hoverIdx !== null && data[hoverIdx] && (
          <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 22, fill: 'var(--ink)', fontFamily: 'Instrument Serif, serif' }}>
            {data[hoverIdx].value}
          </text>
        )}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {centerValue !== undefined && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 26, color: 'var(--ink)', lineHeight: 1 }}>{centerValue}</div>
            {centerLabel && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{centerLabel}</div>}
          </div>
        )}
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          const isHovered = hoverIdx === i;
          return (
            <div
              key={d.label}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, padding: '3px 6px', marginLeft: -6, marginRight: -6,
                borderRadius: 4, cursor: 'pointer',
                background: isHovered ? 'var(--surface-2)' : 'transparent',
                transition: 'background 0.15s',
              }}
              title={`${d.label}: ${d.value} (${pct}%)`}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ color: 'var(--ink-2)' }}>{d.label}</span>
              </span>
              <span style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'JetBrains Mono, monospace' }}>
                {d.value}<span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── LineChart ───────────────────────────────────────────────────────────
// Lightweight line + dots chart with optional secondary fill area.
// Pass `points` as numbers; we auto-scale the Y axis.
export function LineChart({
  points, labels, height = 140, color = 'var(--olive)', fill = 'var(--olive-50)',
}: {
  points: number[];
  labels?: string[];
  height?: number;
  color?: string;
  fill?: string;
}) {
  if (points.length === 0) {
    return <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 40 }}>No data yet.</div>;
  }
  const width = 100; // % — viewBox handles scaling
  const pad = 8;
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + ((max - p) / range) * (height - pad * 2);
    return { x, y };
  });
  const pathLine = coords.map((c, i) => (i === 0 ? `M${c.x} ${c.y}` : `L${c.x} ${c.y}`)).join(' ');
  const pathArea = `${pathLine} L${coords[coords.length - 1].x} ${height - pad} L${coords[0].x} ${height - pad} Z`;

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <path d={pathArea} fill={fill} />
        <path d={pathLine} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={1.4} fill={color} />
        ))}
      </svg>
      {labels && labels.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}