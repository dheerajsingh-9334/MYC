/**
 * sparkline.ts
 * ─────────────────────────────────────────────────────────────────
 * Pure-utility helper that turns sparse task data into a stable
 * array of N points for the <StatCard> sparkline. No chart library.
 *
 * v1: counts `status === 'complete'` tasks with `completedAt` in
 * the last 14 days, bucketed per-day. When no history is available
 * (mock mode, fresh DB, or before any task has been completed),
 * falls back to a deterministic 6-point sine wave seeded by the
 * label so renders stay stable between SSR and client hydration.
 *
 * Replace with `/api/dashboard/stats/history` when the backend
 * ships time-series data.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function decorativeWave(label: string, buckets: number): number[] {
  // Deterministic 6-point wave (sine) seeded by label. Returns
  // integers 2..6 so the sparkline always shows a small rise/fall
  // shape, never a flat line.
  const seed = hashSeed(label);
  const pts: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const phase = (i / buckets) * Math.PI * 2;
    const v = 4 + Math.sin(phase + (seed % 7)) * 1.6 + ((seed >> i) & 1) * 0.6;
    pts.push(Math.max(1, Math.round(v)));
  }
  return pts;
}

export function deriveSparkline(
  label: string,
  tasks: Array<{ completedAt?: string | null; status?: string }>,
  buckets: number = 14,
): number[] {
  if (!tasks || tasks.length === 0) return decorativeWave(label, buckets);

  const now = Date.now();
  const since = now - buckets * DAY_MS;
  const counts = new Array(buckets).fill(0);

  for (const t of tasks) {
    if (t.status !== 'complete' || !t.completedAt) continue;
    const ts = new Date(t.completedAt).getTime();
    if (Number.isNaN(ts) || ts < since || ts > now) continue;
    const bucketIdx = buckets - 1 - Math.floor((now - ts) / DAY_MS);
    if (bucketIdx >= 0 && bucketIdx < buckets) counts[bucketIdx] += 1;
  }

  // If every bucket is zero (no completions in the window), fall back
  // to a decorative wave so the card never shows a flat line.
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return decorativeWave(label, buckets);

  return counts;
}
