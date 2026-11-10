"use client";
/**
 * ExpenseTrendChart — dependency-free inline SVG for the Expenses console.
 * Maroon area/line = expense amount per IST bucket (day/week/month, chosen
 * server-side from the span). Peak bucket is highlighted with a drop line and a
 * filled dot; every bucket exposes a native <title> tooltip with exact figures.
 * Visual language matches the dashboard RevenueChart (#38020d curve, #d3a955 accent).
 */
import { formatINR, formatNumber } from "@/lib/format";
import type { ExpenseTrendBucket } from "@/lib/types";

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 10, bottom: 26, left: 56 };

/** Smooth quadratic curve through the midpoints of the bucket points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const midX = (pts[i - 1].x + pts[i].x) / 2;
    const midY = (pts[i - 1].y + pts[i].y) / 2;
    d += ` Q ${pts[i - 1].x} ${pts[i - 1].y} ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  d += ` T ${last.x} ${last.y}`;
  return d;
}

/** Compact axis money: ₹0 / ₹5k / ₹12.5k style (paise in, short string out). */
function axisRupee(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${Math.round(rupees / 100000)}L`;
  if (rupees >= 1000) {
    const k = rupees / 1000;
    return `₹${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return `₹${Math.round(rupees)}`;
}

export function ExpenseTrendChart({ buckets, unit }: { buckets: ExpenseTrendBucket[]; unit: "day" | "week" | "month" }) {
  const maxTotal = Math.max(...buckets.map((b) => b.totalPaise), 0);
  if (buckets.length === 0 || maxTotal === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink/50">
        No expenses recorded in this range yet — the curve appears with the first entry.
      </div>
    );
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / buckets.length;
  const yMax = maxTotal || 1;
  const x = (i: number) => PAD.left + i * slot + slot / 2;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const linePts = buckets.map((b, i) => ({ x: x(i), y: y(b.totalPaise) }));
  const line = smoothPath(linePts);
  const area = `${line} L ${linePts[linePts.length - 1].x} ${PAD.top + innerH} L ${linePts[0].x} ${PAD.top + innerH} Z`;

  // Peak bucket (ties → earliest).
  let peakIdx = -1;
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].totalPaise > 0 && (peakIdx === -1 || buckets[i].totalPaise > buckets[peakIdx].totalPaise)) peakIdx = i;
  }

  // At most ~8 x-axis milestones; the last bucket is always labelled, and an
  // earlier milestone is dropped when it would collide with the final label.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));
  const lastIndex = buckets.length - 1;
  const labelIndices = new Set<number>();
  for (let i = 0; i < buckets.length; i += labelEvery) labelIndices.add(i);
  labelIndices.add(lastIndex);
  for (const i of [...labelIndices]) {
    if (i !== lastIndex && lastIndex - i < labelEvery * 0.6) labelIndices.delete(i);
  }
  const isLabelled = (i: number) => labelIndices.has(i);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const unitLabel = unit === "day" ? "daily" : unit === "week" ? "weekly" : "monthly";
  const avg = buckets.reduce((s, b) => s + b.totalPaise, 0) / buckets.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full sm:h-64"
        role="img"
        aria-label={`${unitLabel} expense trend over ${buckets.length} ${unit} buckets; peak ${peakIdx >= 0 ? formatINR(buckets[peakIdx].totalPaise) : "none"}`}
      >
        <defs>
          <linearGradient id="expAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38020d" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38020d" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid + y axis (₹) */}
        {yTicks.map((t) => {
          const ty = PAD.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={ty} y2={ty} className="stroke-outline-variant/60" strokeDasharray="3 4" strokeWidth="1" />
              <text x={PAD.left - 8} y={ty + 3} textAnchor="end" className="fill-outline" fontSize="10">
                {axisRupee(yMax * t)}
              </text>
            </g>
          );
        })}

        {/* area + line */}
        <path d={area} fill="url(#expAreaGrad)" />
        <path d={line} fill="none" stroke="#38020d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* baseline */}
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} className="stroke-outline-variant" strokeWidth="1" />

        {/* x labels + per-bucket hit areas (native tooltips) */}
        {buckets.map((b, i) => {
          const showLabel = i % labelEvery === 0 || i === buckets.length - 1;
          const isPeak = i === peakIdx;
          return (
            <g key={b.start}>
              {isPeak ? (
                <>
                  <line x1={x(i)} x2={x(i)} y1={y(b.totalPaise)} y2={PAD.top + innerH} className="stroke-primary/40" strokeDasharray="2 3" strokeWidth="1" />
                  <circle cx={x(i)} cy={y(b.totalPaise)} r="5" fill="#38020d" stroke="#fff8f5" strokeWidth="2" />
                </>
              ) : b.totalPaise > 0 ? (
                <circle cx={x(i)} cy={y(b.totalPaise)} r="3" fill="#fff8f5" stroke="#38020d" strokeWidth="1.6" />
              ) : null}
              {showLabel ? (
                <text
                  x={x(i)}
                  y={PAD.top + innerH + 16}
                  textAnchor="middle"
                  className={isPeak ? "fill-primary font-bold" : "fill-outline"}
                  fontSize="10"
                >
                  {b.label}
                </text>
              ) : null}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent">
                <title>{`${b.label} · ${formatINR(b.totalPaise)} · ${formatNumber(b.count)} ${b.count === 1 ? "entry" : "entries"}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-[11px] text-outline">
        {unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)} spending · average{" "}
        <span className="font-bold text-on-surface-variant">{formatINR(Math.round(avg))}</span> per {unit}
      </p>
    </div>
  );
}
