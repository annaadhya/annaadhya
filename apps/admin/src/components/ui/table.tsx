import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** Table primitives — horizontally scrollable wrapper for small screens. */
export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full min-w-max border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-outline-variant/40 bg-surface-container-low label-eyebrow text-on-surface-variant">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-outline-variant/30">{children}</tbody>;
}

export function TR({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`transition-colors hover:bg-surface-container-low ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-2.5 py-3 font-bold whitespace-nowrap ${className}`} {...rest} />;
}

export function TD({ className = "", ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-2.5 py-3.5 align-middle whitespace-nowrap ${className}`} {...rest} />;
}
