"use client";
/** Button — hand-written primitive (no shadcn CLI in this app). */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-md hover:bg-primary-container focus-visible:outline-primary",
  secondary: "bg-secondary-container text-on-secondary-container hover:bg-secondary/20 focus-visible:outline-secondary",
  outline:
    "border border-outline-variant/70 bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container focus-visible:outline-primary",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-primary",
  danger: "bg-error text-on-error hover:bg-error/90 focus-visible:outline-error",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="9" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
