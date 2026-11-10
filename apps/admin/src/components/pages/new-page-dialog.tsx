"use client";
/**
 * "New page" dialog for the Pages console. Creates a DRAFT page with empty
 * starter content, then routes to the full editor. Slug collisions surface the
 * server's 409 message inline — the form keeps every value on failure.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiPost } from "@/lib/api";
import type { PageDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { SLUG_RE, slugify, starterContent } from "./page-shared";

export interface NewPageDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewPageDialog({ open, onClose }: NewPageDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pageType, setPageType] = useState<"document" | "faq">("document");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setPageType("document");
    setSaving(false);
    setError(null);
  }, [open]);

  // Escape closes (never while a save is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const effectiveSlug = slugTouched ? slugify(slug) : autoSlug;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 2) return void setError("Title must be at least 2 characters.");
    if (!SLUG_RE.test(effectiveSlug)) {
      return void setError("Slug must be lowercase letters, numbers and single dashes (e.g. gift-guide-2026).");
    }

    setSaving(true);
    try {
      const doc = await apiPost<PageDoc>("/admin/content/pages", {
        slug: effectiveSlug,
        title: title.trim(),
        pageType,
        status: "draft",
        content: starterContent(pageType),
      });
      onClose();
      router.push(`/pages/${doc.id}/edit`);
    } catch (err) {
      // Recoverable: keep every value so the slug can be corrected and retried.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div aria-hidden onClick={saving ? undefined : onClose} className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs" />
      <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New page"
          className="w-full rounded-t-2xl bg-surface-container-lowest text-left shadow-2xl sm:max-w-lg sm:rounded-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
            <div>
              <span className="label-eyebrow inline-block rounded-full bg-primary px-2.5 py-0.5 text-on-primary">New storefront page</span>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-primary">Create a custom page</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                The page starts as a draft with empty content — the editor opens next.
              </p>
            </div>
            <button
              type="button"
              onClick={saving ? undefined : onClose}
              aria-label="Close dialog"
              className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="space-y-4 px-5 py-5 sm:px-6">
              <Field label="Title" required hint="2–160 characters — shown as the page heading on the storefront.">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. Festive Gifting Guide"
                  autoFocus
                />
              </Field>
              <Field
                label="Slug"
                required
                error={undefined}
                hint={
                  slugTouched
                    ? `Live URL will be /p/${effectiveSlug || "…"}`
                    : "Auto-filled from the title — edit it if you want a different address."
                }
              >
                <Input
                  value={slugTouched ? slug : autoSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  maxLength={96}
                  className="font-mono"
                  placeholder="festive-gifting-guide"
                />
              </Field>
              <Field label="Page type" required hint="Fixed after creation — a page cannot switch between document and FAQ.">
                <Select value={pageType} onChange={(e) => setPageType(e.target.value as "document" | "faq")}>
                  <option value="document">Document — free-form sections &amp; blocks</option>
                  <option value="faq">FAQ — grouped questions &amp; answers</option>
                </Select>
              </Field>

              {error ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Create draft &amp; edit
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
