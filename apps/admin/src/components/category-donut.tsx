"use client";
/**
 * CategoryDonut — dependency-free SVG donut for the dashboard Category Sales card.
 * Slices are real paid-order line-revenue shares by catalogue category; colours cycle
 * through the brand palette (maroon → gold → forest → terracotta → umber).
 */
import { formatINRRounded } from "@/lib/format";
import type { DashboardCategorySale } from "@/lib/types";

const SLICE_COLORS = ["#38020d", "#d3a955", "#476554", "#867273", "#B66D50"];

/** Flat top-5 + "Everything else" bucket so the donut always sums to the total. */
export function donutSlices(rows: DashboardCategorySale[]): { name: string; revenuePaise: number; color: string }[] {
  const top = rows.slice(0, 5).map((r, i) => ({ name: r.name, revenuePaise: r.revenuePaise, color: SLICE_COLORS[i % SLICE_COLORS.length] }));
  const rest = rows.slice(5).reduce((s, r) => s + r.revenuePaise, 0);
  if (rest > 0) top.push({ name: "Other categories", revenuePaise: rest, color: "#A89F94" });
  return top;
}

export function CategoryDonut({
  rows,
  centerCaption = "paid-order items",
  emptyTitle = "No category sales yet",
  emptyDescription = "Shares appear once paid orders land in the selected range — nothing is estimated.",
}: {
  rows: DashboardCategorySale[];
  /** Caption under the centre total (the dashboard says "paid-order items"). */
  centerCaption?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const slices = donutSlices(rows);
  const total = slices.reduce((s, x) => s + x.revenuePaise, 0);
  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <p className="font-display text-base font-semibold text-primary">{emptyTitle}</p>
        <p className="max-w-xs text-sm text-ink/60">{emptyDescription}</p>
      </div>
    );
  }

  // Donut geometry: r=38 on a 100 viewBox, stroke width 12, rotated -90° so 0% starts at 12 o'clock.
  const C = 2 * Math.PI * 38;
  let offset = 0;

  return (
    <div>
      <div className="relative mx-auto my-2 flex w-44 items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-44 w-44 -rotate-90" role="img" aria-label={`Share by category, total ${formatINRRounded(total)}`}>
          <circle cx="50" cy="50" r="38" fill="transparent" stroke="#faddcf" strokeWidth="12" />
          {slices.map((s) => {
            const len = (s.revenuePaise / total) * C;
            const el = (
              <circle
                key={s.name}
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${s.name} · ${formatINRRounded(s.revenuePaise)} · ${Math.round((s.revenuePaise / total) * 100)}%`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-semibold text-primary">{formatINRRounded(total)}</span>
          <span className="text-[10px] font-semibold tracking-wider text-outline uppercase">{centerCaption}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {slices.map((s) => {
          const pct = Math.round((s.revenuePaise / total) * 100);
          return (
            <div key={s.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 text-on-surface">
                  {formatINRRounded(s.revenuePaise)} <span className="font-normal text-outline">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
