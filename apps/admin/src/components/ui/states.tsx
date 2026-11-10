"use client";
/** EmptyState + ErrorState with retry — used by every list/detail view. */
import { Button } from "./button";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-primary">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 7h18M3 12h18M3 17h10" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="font-display text-base font-semibold text-on-surface">{title}</p>
      {description ? <p className="max-w-sm text-sm text-on-surface-variant/90">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  status,
}: {
  message: string;
  onRetry?: () => void;
  status?: number;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 9v4m0 4h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="font-display text-base font-semibold text-on-surface">
        {status === 403 ? "Not allowed" : status === 401 ? "Session expired" : "Something went wrong"}
      </p>
      <p className="max-w-md text-sm text-on-surface-variant/90">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
