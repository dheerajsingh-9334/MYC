"use client";
import { useState, type CSSProperties, type MouseEvent } from "react";
import {
  TrendingUp,
  TrendingDown,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * StatCard
 * ─────────────────────────────────────────────────────────────────
 * Refined stat tile with a 3px left accent stripe, label, large
 * Instrument Serif value, trend row, and an inline-SVG sparkline.
 *
 * - Hover: border + shadow only. No scale transform (avoids layout
 *   shift). 200ms ease, gated by prefers-reduced-motion in globals.css.
 * - Sparkline: pure inline SVG, no library. 84×28 viewBox with a
 *   light area fill (12% alpha of the accent) + 1.5px stroke line.
 * - Cursor: pointer only when `onClick` is provided.
 */

export interface StatCardProps {
  label: string;
  value: number | string;
  accent: string;
  trend?: string;
  trendType?: "up" | "warn" | "down" | "neutral";
  sparklineData?: number[];
  icon?: LucideIcon;
  onClick?: () => void;
}

const TREND_COLOR: Record<NonNullable<StatCardProps["trendType"]>, string> = {
  up: "var(--green)",
  warn: "var(--amber)",
  down: "var(--red)",
  neutral: "var(--muted)",
};

function trendIcon(type: NonNullable<StatCardProps["trendType"]>) {
  if (type === "up") return TrendingUp;
  if (type === "down") return TrendingDown;
  if (type === "warn") return TriangleAlert;
  return null;
}

function buildSparklinePath(
  values: number[],
  w: number,
  h: number,
  padY: number,
) {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const yScale = (v: number) => h - padY - ((v - min) / range) * (h - padY * 2);

  const pts = values.map((v, i) => [i * stepX, yScale(v)] as const);
  const line = pts
    .map(
      ([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L ${w.toFixed(1)} ${h.toFixed(1)} L 0 ${h.toFixed(1)} Z`;
  return { line, area };
}

export default function StatCard({
  label,
  value,
  accent,
  trend,
  trendType = "neutral",
  sparklineData,
  icon: Icon,
  onClick,
}: StatCardProps) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick;

  const outerStyle: CSSProperties = {
    background: "var(--surface)",
    border: `1px solid ${hover ? "var(--border-strong)" : "var(--border)"}`,
    borderRadius: "var(--radius)",
    padding: "16px 18px 16px 21px",
    position: "relative",
    transition: "border-color 200ms ease, box-shadow 200ms ease",
    boxShadow: hover ? "var(--shadow)" : "none",
    cursor: interactive ? "pointer" : "default",
    overflow: "hidden",
    minHeight: 100,
  };

  const TrendIcon = trendIcon(trendType);
  const sparkValues =
    sparklineData && sparklineData.length >= 2
      ? sparklineData
      : [1, 2, 1, 3, 2, 4, 3];
  const { line, area } = buildSparklinePath(sparkValues, 84, 28, 3);

  return (
    <div
      style={outerStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Left accent stripe */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          background: accent,
          borderRadius: "8px 0 0 8px",
        }}
      />

      {/* Sparkline (top-right, absolute) */}
      {sparkValues.length >= 2 && (
        <svg
          width={84}
          height={28}
          viewBox="0 0 84 28"
          aria-hidden
          style={{ position: "absolute", top: 16, right: 14, opacity: 0.85 }}
        >
          <path d={area} fill={accent} fillOpacity={0.12} />
          <path
            d={line}
            stroke={accent}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Header: icon + label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          paddingRight: 90,
        }}
      >
        {Icon && <Icon size={12} style={{ color: "var(--muted)" }} />}
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--muted)",
            letterSpacing: "0.4px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
      </div>

      {/* Value */}
      <div
        style={{
          fontFamily: "Instrument Serif, serif",
          fontSize: 36,
          color: "var(--ink)",
          lineHeight: 1,
          letterSpacing: "-0.5px",
        }}
      >
        {value}
      </div>

      {/* Trend */}
      {trend && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 8,
            fontSize: 12,
            color: TREND_COLOR[trendType],
            fontWeight: trendType === "neutral" ? 400 : 500,
          }}
        >
          {TrendIcon && <TrendIcon size={11} />}
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
