import type { ReactNode } from "react";

/** Standard page heading per the design: tracked eyebrow, serif display title, description, actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="label-eyebrow mb-1.5 flex items-center gap-1.5 text-secondary">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-primary">{title}</h1>
        {description ? <div className="mt-1.5 max-w-2xl text-sm text-on-surface-variant">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
