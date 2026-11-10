"use client";
/**
 * RevenueChart — dependency-free inline SVG for the dashboard Revenue Overview.
 * Maroon area/line = daily net revenue (₹, IST buckets); gold bars = order volume
 * (independent scale, visual only). Peak day is highlighted; every day exposes a
 * native <title> tooltip with exact figures. Replaces the old sales-trend chart.
 * Colors follow the supplied Stitch chart: #38020d curve, #d3a955 volume bars.
 */
import { formatINR, formatNumber } from "@/lib/format";

export interface RevenuePoint {
  date: string;
  netSalesPaise: number;
  orders: number;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 10, bottom: 26, left: 56 };

/** Smooth quadratic curve through the midpoints of the daily points. */
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

/** "2026-02-05" → "05 Feb" for axis milestones (IST dates stay dates — no tz math needed). */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? m}`;
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const maxRevenue = Math.max(...points.map((p) => p.netSalesPaise), 0);
  const maxOrders = Math.max(...points.map((p) => p.orders), 0);
  if (points.length === 0 || (maxRevenue === 0 && maxOrders === 0)) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink/50">
        No paid orders recorded in this range yet — the curve appears with the first sale.
      </div>
    );
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(14, slot * 0.42));
  const yMax = maxRevenue || 1;
  const x = (i: number) => PAD.left + i * slot + slot / 2;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const linePts = points.map((p, i) => ({ x: x(i), y: y(p.netSalesPaise) }));
  const line = smoothPath(linePts);
  const area = `${line} L ${linePts[linePts.length - 1].x} ${PAD.top + innerH} L ${linePts[0].x} ${PAD.top + innerH} Z`;

  // Peak revenue day (ties → earliest).
  let peakIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].netSalesPaise > 0 && (peakIdx === -1 || points[i].netSalesPaise > points[peakIdx].netSalesPaise)) peakIdx = i;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const barBase = PAD.top + innerH;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-56 w-full sm:h-64"
        role="img"
        aria-label={`Daily net revenue over ${points.length} days; best day ${peakIdx >= 0 ? formatINR(points[peakIdx].netSalesPaise) : "none"}`}
      >
        <defs>
          <linearGradient id="revAreaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#38020d" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38020d" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="revBarGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d3a955" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#d3a955" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* grid + y axis (₹) */}
        {yTicks.map((t) => {
          const ty = PAD.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={ty} y2={ty} className="stroke-outline-variant/60" strokeDasharray="3 4" strokeWidth="1" />
              <text x={PAD.left - 8} y={ty + 3} textAnchor="end" className="fill-outline" fontSize="10">
                {formatINR(yMax * t).replace(".00", "")}
              </text>
            </g>
          );
        })}

        {/* order volume bars (gold, own scale capped so the line stays readable) */}
        {maxOrders > 0
          ? points.map((p, i) => {
              const h = (p.orders / maxOrders) * innerH * 0.55;
              if (p.orders === 0) return null;
              return (
                <rect
                  key={`bar-${p.date}`}
                  x={x(i) - barW / 2}
                  y={barBase - h}
                  width={barW}
                  height={h}
                  rx={Math.min(3, barW / 2)}
                  fill="url(#revBarGrad)"
                />
              );
            })
          : null}

        {/* revenue area + curve */}
        {maxRevenue > 0 ? (
          <>
            <path d={area} fill="url(#revAreaGrad)" />
            <path d={line} fill="none" stroke="#38020d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : null}

        {/* peak marker */}
        {peakIdx >= 0 ? (
          <>
            <line x1={x(peakIdx)} x2={x(peakIdx)} y1={y(points[peakIdx].netSalesPaise) + 6} y2={barBase} className="stroke-[#38020d]/40" strokeDasharray="2 3" strokeWidth="1.2" />
            <circle cx={x(peakIdx)} cy={y(points[peakIdx].netSalesPaise)} r="4.5" fill="#38020d" stroke="#ffffff" strokeWidth="2" />
          </>
        ) : null}

        {/* per-day hover targets with native tooltips */}
        {points.map((p, i) => (
          <rect key={`hit-${p.date}`} x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" className="cursor-pointer">
            <title>{`${shortDate(p.date)} · ${formatINR(p.netSalesPaise)} · ${formatNumber(p.orders)} ${p.orders === 1 ? "order" : "orders"}`}</title>
          </rect>
        ))}

        {/* x axis milestones */}
        {points.length > 1
          ? [0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
              const i = Math.round(t * (points.length - 1));
              return (
                <text key={idx} x={x(i)} y={HEIGHT - 8} textAnchor={idx === 0 ? "start" : idx === 4 ? "end" : "middle"} className="fill-outline" fontSize="10">
                  {shortDate(points[i].date)}
                </text>
              );
            })
          : null}
      </svg>
    </div>
  );
}
