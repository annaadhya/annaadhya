"use client";

import { IconAlertTriangle } from "@/components/icons";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-gutter-mobile py-space-xl text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full bg-error-container text-on-error-container"
        aria-hidden
      >
        <IconAlertTriangle size={30} />
      </span>
      <h1 className="font-display mt-space-lg text-headline-lg-mobile font-semibold text-on-surface">
        Something went wrong
      </h1>
      <p className="mt-space-md max-w-md text-body-md leading-relaxed text-on-surface-variant">
        An unexpected error occurred while preparing this page. It has been logged — please try again.
      </p>
      <button className="btn-primary mt-space-xl px-6 py-2.5 text-label-lg" onClick={reset}>
        Try again
      </button>
      {error.digest && <p className="mt-space-md font-mono text-[0.7rem] text-on-surface-variant">ref: {error.digest}</p>}
    </div>
  );
}
