"use client";
/**
 * Drawer — right-side slide-over panel (the customers detail surface per the approved
 * design). Same behaviours as Dialog: conditional render, overlay click + Escape close,
 * body scroll locked while open. Slides in via a CSS transition on mount — the panel
 * starts translated off-canvas and settles on the next frame.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Sticky panel header (identity block). */
  title: ReactNode;
  children: ReactNode;
  /** Sticky action bar pinned to the bottom of the panel. */
  footer?: ReactNode;
}

export function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  // Mount-transition state: start slightly off-canvas, then settle — gives the
  // slide-in feel without any animation library or global CSS changes.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/40 backdrop-blur-xs">
      {/* Overlay click target — clicking anywhere outside the panel closes. */}
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full max-w-xl flex-col bg-surface-container-lowest shadow-xl ring-1 ring-outline-variant/40 transition-transform duration-200 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 px-5 py-4">
          {title}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded p-1.5 text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-outline-variant/40 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
