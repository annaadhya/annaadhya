import type { HTMLAttributes, ReactNode } from "react";

/** Card primitives — surface-container-lowest panels with the design's soft shadow, no border. */
export function Card({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/40 px-4 py-3 sm:px-6 ${className}`}
    >
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-on-surface">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-on-surface-variant/80">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`p-4 sm:p-6 ${className}`}>{children}</div>;
}
