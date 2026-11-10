"use client";
/**
 * Heritage-styled form building blocks for the product Add/Edit form
 * ("Modern Indian Heritage" design system — see DESIGN.md / the Stitch reference).
 * Inputs use the design's ring-shadow treatment (1px warm outline, 2px maroon focus)
 * instead of the legacy sand/forest controls.
 */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useId, useState } from "react";

export const CONTROL =
  "w-full rounded-lg bg-surface-container-lowest px-4 text-on-surface shadow-[0_0_0_1px_rgba(217,193,194,0.6)] transition-shadow placeholder:text-on-surface-variant/50 focus:outline-none focus:shadow-[0_0_0_2px_#541620] disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant/60";

export function HeritageInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-11 text-body-md ${CONTROL} ${className}`} {...rest} />;
}

export function HeritageTextarea({ className = "", rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`py-2.5 text-body-md ${CONTROL} ${className}`} {...rest} />;
}

export function HeritageSelect({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={`h-11 cursor-pointer appearance-none pr-10 text-body-md ${CONTROL} ${className}`} {...rest}>
        {children}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

export interface HeritageFieldProps {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

/** Label + control + helper/error line, per the design's field anatomy. */
export function HeritageField({ label, required, hint, error, children, htmlFor, className = "" }: HeritageFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-label-md font-semibold text-on-surface">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-on-surface-variant">{typeof hint === "string" ? hint : hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------ section shell ------------------------------ */

const SECTION_DOTS: Record<string, string> = {
  maroon: "bg-primary",
  green: "bg-secondary",
  gold: "bg-tertiary-fixed-dim",
  umber: "bg-primary-container",
  clay: "bg-outline",
};

/** Card shell for one form section: coloured dot + serif title + tracked section tag. */
export function SectionCard({
  dot,
  title,
  tag,
  action,
  children,
  className = "",
}: {
  dot: keyof typeof SECTION_DOTS;
  title: string;
  tag?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.04)] sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className={`h-2 w-2 rounded-full ${SECTION_DOTS[dot]}`} />
          <h2 className="font-heritage-display text-headline-sm font-medium text-on-surface">{title}</h2>
        </div>
        {action ?? (tag ? <span className="label-eyebrow text-outline">{tag}</span> : null)}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------- slug field ------------------------------- */

function LockIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.9-.9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Storefront URL slug — locked by default (canonical routing caution), unlock to edit.
 * Shows the real storefront path prefix for the deployment it runs on.
 */
export function SlugField({
  value,
  locked,
  onToggleLock,
  onChange,
  disabled,
  error,
}: {
  value: string;
  locked: boolean;
  onToggleLock: () => void;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const inputId = useId();
  const [host, setHost] = useState("annaadhya.com");
  // Real deployment host for the prefix (storefront serves at the site root).
  useEffect(() => {
    setHost(window.location.host.replace(/^admin\./, ""));
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-label-md font-semibold text-on-surface">
          Storefront URL Slug
        </label>
        <button
          type="button"
          onClick={onToggleLock}
          disabled={disabled}
          className="flex items-center gap-1 text-label-sm font-bold text-primary transition-colors hover:text-primary-container disabled:opacity-50"
        >
          <LockIcon open={!locked} />
          {locked ? "Unlock to Edit" : "Lock"}
        </button>
      </div>
      <div
        className={`flex items-center rounded-lg bg-surface-container-low px-4 shadow-[0_0_0_1px_rgba(217,193,194,0.6)] ${
          error ? "shadow-[0_0_0_2px_#ba1a1a]" : ""
        } ${locked ? "" : "bg-surface-container-lowest"}`}
      >
        <span className="select-none py-2.5 text-body-sm text-outline">{host}/product/</span>
        <input
          id={inputId}
          type="text"
          value={value}
          readOnly={locked || disabled}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          className="flex-1 bg-transparent py-2.5 text-body-sm font-medium text-primary focus:outline-none"
          aria-invalid={Boolean(error)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-xs text-outline">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M12 11v5" />
          </svg>
          Caution: modifying this slug permanently alters canonical routing and indexed search rank.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- status radio cards --------------------------- */

export type StatusOption = { value: string; title: string; badge?: string; description: string };

/** The design's stacked radio cards for the publishing lifecycle. */
export function StatusRadioCards({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  value: string;
  options: StatusOption[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${
              active
                ? "bg-secondary-container/40 shadow-[0_0_0_1.5px_#476554]"
                : "bg-surface-container-low hover:bg-surface-container"
            } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
              className="mt-1 accent-primary"
            />
            <span className="flex flex-col">
              <span className="flex items-center gap-1.5 text-label-md font-semibold text-on-surface">
                {opt.title}
                {opt.badge ? (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-on-secondary">{opt.badge}</span>
                ) : null}
              </span>
              <span className="text-xs text-on-surface-variant">{opt.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/* ------------------------------- SERP preview ------------------------------ */

/** Live Google search-result mock for the SEO section. */
export function SerpPreview({ url, title, description }: { url: string; title: string; description: string }) {
  return (
    <div className="mt-4 rounded-xl bg-surface-container-low p-4">
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-primary font-heritage-display text-[10px] text-on-primary">
          A
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-xs text-on-surface">Annaadhya Products</span>
          <span className="text-[11px] leading-tight text-on-surface-variant">{url}</span>
        </span>
      </div>
      <h3 className="cursor-pointer font-heritage-display text-lg leading-snug text-primary hover:underline">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{description}</p>
    </div>
  );
}
