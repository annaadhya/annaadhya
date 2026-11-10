"use client";
/**
 * Policy table of contents — the Stitch design's numbered TOC card with the
 * active-section state driven by an IntersectionObserver scrollspy. Plain
 * anchor links underneath, so navigation works with or without JS and after
 * direct entry to any #hash. scroll-mt on the target articles keeps headings
 * clear of the sticky announcement strip + header.
 */
import { useEffect, useState } from "react";
import { IconChevronRight } from "@/components/icons";

export type TocItem = { id: string; label: string };

export function PolicyToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The heading closest to the top of the viewport wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [items]);

  return (
    <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-[0_2px_16px_rgba(39,24,16,0.04)]">
      <div className="mb-space-md flex items-center justify-between pb-space-xs">
        <span className="font-label-sm text-label-sm font-bold uppercase tracking-widest text-on-surface-variant">
          Policy Contents
        </span>
        <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-semibold text-primary">
          {items.length} Articles
        </span>
      </div>
      <nav aria-label="Table of contents" className="flex flex-col space-y-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active ? "location" : undefined}
              className={`group flex items-center justify-between rounded-lg px-space-sm py-2 transition-colors ${
                active
                  ? "bg-surface-container-low font-semibold text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface"
              }`}
            >
              <span className="truncate font-label-md text-label-md">{item.label}</span>
              <IconChevronRight
                size={16}
                aria-hidden
                className={`${active ? "text-primary" : "opacity-0 transition-opacity group-hover:opacity-100"}`}
              />
            </a>
          );
        })}
      </nav>
    </div>
  );
}
