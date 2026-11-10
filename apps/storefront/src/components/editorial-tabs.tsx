"use client";
/** Accessible tab switcher for the product-page editorial section. The panels are
 *  server-rendered React nodes passed in as props (RSC-serialisable), so all copy and
 *  icons render on the server — this shell only owns the active-tab state. */
import { useId, useState, type ReactNode } from "react";

export interface TabSpec {
  id: string;
  label: string;
}

export function EditorialTabs({ tabs, panels }: { tabs: TabSpec[]; panels: ReactNode[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);

  return (
    <div>
      {/* Pill switcher — the approved design's centred rounded control */}
      <div className="mb-space-lg flex justify-center">
        <div
          role="tablist"
          aria-label="Product information sections"
          className="inline-flex max-w-full overflow-x-auto rounded-full bg-surface-container p-1 shadow-sm"
        >
          {tabs.map((t, i) => {
            const selected = i === active;
            return (
              <button
                key={t.id}
                id={`${baseId}-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${t.id}`}
                onClick={() => setActive(i)}
                className={`shrink-0 rounded-full px-space-md py-2 text-label-md transition-all ${
                  selected
                    ? "bg-primary font-bold text-on-primary shadow-sm"
                    : "font-medium text-on-surface-variant transition-colors hover:text-primary"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {panels.map((panel, i) => (
        <div
          key={tabs[i]?.id ?? i}
          id={`${baseId}-panel-${tabs[i]?.id ?? i}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tabs[i]?.id ?? i}`}
          hidden={i !== active}
        >
          {i === active ? panel : null}
        </div>
      ))}
    </div>
  );
}
