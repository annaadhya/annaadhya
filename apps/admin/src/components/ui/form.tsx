"use client";
/** Input, Textarea, Select, Label, Field — hand-written form primitives. */
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

const CONTROL_CLASSES =
  "w-full rounded-md border border-sand bg-white px-3 text-sm text-ink placeholder:text-ink/40 focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20 disabled:cursor-not-allowed disabled:bg-cream disabled:text-ink/50";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-11 ${CONTROL_CLASSES} ${className}`} {...rest} />;
}

export function Textarea({ className = "", rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`py-2 ${CONTROL_CLASSES} ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`h-11 pr-8 ${CONTROL_CLASSES} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-xs font-semibold tracking-wide text-ink/80 uppercase ${className}`} {...rest} />;
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Label + control + inline error, the standard wrapper for every form control. */
export function Field({ label, htmlFor, error, hint, required, children, className = "" }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-red-700">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-ink/50">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Checkbox with label — used for toggles that are honest checkboxes (sandbox mode, COD…). */
export function Checkbox({
  label,
  description,
  id,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-sand text-forest accent-[#1E4D3B]"
        {...rest}
      />
      <div>
        <label htmlFor={inputId} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-ink/60">{description}</p> : null}
      </div>
    </div>
  );
}
