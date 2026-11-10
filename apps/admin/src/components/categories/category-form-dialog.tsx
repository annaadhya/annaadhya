"use client";
/**
 * Add / Edit category modal for the Categories console (heritage design language).
 *
 * One form for create and edit. Contract notes baked in:
 *  - the server keys categories by `cat_{slug}`, so the slug is DISABLED on edit —
 *    changing it would create a brand-new entity, never rename this one;
 *  - heroImage must be a FULL URL (https://…) and is omitted when empty;
 *  - seo is omitted entirely when both fields are empty;
 *  - errors keep every form value (recoverable); closing with unsaved edits asks first.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { CategoryDoc, ProductStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { MediaUploader } from "@/components/products/media-uploader";
import { SLUG_RE, slugify } from "@/components/pages/page-shared";
import { IconClose, IconTrash } from "@/components/suppliers/icons";

/** Mirrors contracts categoryUpsertSchema. */
interface CategoryUpsertPayload {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  sortOrder: number;
  isReady: boolean;
  heroImage?: string;
  status: ProductStatus;
  seo?: { title?: string; description?: string };
}

export interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null → create; present → edit this category. */
  category: CategoryDoc | null;
  onSaved: () => void;
}

export function CategoryFormDialog({ open, onClose, category, onSaved }: CategoryFormDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isReady, setIsReady] = useState(true);
  const [status, setStatus] = useState<ProductStatus>("published");
  const [heroImage, setHeroImage] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const isEdit = category !== null;

  // Fresh form whenever the dialog opens for a (different) category.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setConfirmingDiscard(false);
    setSlugTouched(isEdit);
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setTagline(category.tagline ?? "");
      setDescription(category.description ?? "");
      setSortOrder(String(category.sortOrder ?? 0));
      setIsReady(category.isReady);
      setStatus(category.status);
      setHeroImage(category.heroImage ?? "");
      setSeoTitle(category.seo?.title ?? "");
      setSeoDescription(category.seo?.description ?? "");
    } else {
      setName("");
      setSlug("");
      setTagline("");
      setDescription("");
      setSortOrder("0");
      setIsReady(true);
      setStatus("published");
      setHeroImage("");
      setSeoTitle("");
      setSeoDescription("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  // Escape closes (never while saving, asks first when dirty); body scroll locked.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !confirmingDiscard) requestClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, confirmingDiscard]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    if (category) {
      return (
        name !== category.name ||
        slug !== category.slug ||
        tagline !== (category.tagline ?? "") ||
        description !== (category.description ?? "") ||
        sortOrder !== String(category.sortOrder ?? 0) ||
        isReady !== category.isReady ||
        status !== category.status ||
        heroImage !== (category.heroImage ?? "") ||
        seoTitle !== (category.seo?.title ?? "") ||
        seoDescription !== (category.seo?.description ?? "")
      );
    }
    return (
      name !== "" ||
      tagline !== "" ||
      description !== "" ||
      sortOrder !== "0" ||
      !isReady ||
      status !== "published" ||
      heroImage !== "" ||
      seoTitle !== "" ||
      seoDescription !== ""
    );
  }, [open, name, slug, tagline, description, sortOrder, isReady, status, heroImage, seoTitle, seoDescription, category]);

  function requestClose() {
    if (isDirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2 || name.trim().length > 80) {
      return void setError("Category name must be 2–80 characters.");
    }
    const finalSlug = isEdit ? category!.slug : slugify(slug || name);
    if (!isEdit && !SLUG_RE.test(finalSlug)) {
      return void setError("Slug must be lowercase letters, numbers and single dashes (e.g. gift-boxes).");
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 999) {
      return void setError("Sort order must be a whole number between 0 and 999.");
    }
    const trimmedHero = heroImage.trim();
    if (trimmedHero && !/^https?:\/\/.+/i.test(trimmedHero)) {
      return void setError("Hero image must be a full URL starting with https:// (upload one or paste the Cloudinary link).");
    }

    const payload: CategoryUpsertPayload = {
      slug: finalSlug,
      name: name.trim(),
      tagline: tagline.trim(),
      description: description.trim(),
      sortOrder: order,
      isReady,
      status,
    };
    if (trimmedHero) payload.heroImage = trimmedHero;
    if (seoTitle.trim() || seoDescription.trim()) {
      payload.seo = {
        ...(seoTitle.trim() ? { title: seoTitle.trim() } : {}),
        ...(seoDescription.trim() ? { description: seoDescription.trim() } : {}),
      };
    }

    setSaving(true);
    try {
      const doc = isEdit
        ? await apiPost<CategoryDoc>(`/admin/catalogue/categories/${category!.id}`, payload)
        : await apiPost<CategoryDoc>("/admin/catalogue/categories", payload);
      void doc;
      onSaved();
      onClose();
    } catch (err) {
      // Recoverable: keep every form value so the user can retry or correct.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={requestClose}
        className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs"
      />
      <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? `Edit ${category?.name}` : "Add category"}
          className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest text-left shadow-2xl sm:max-w-2xl sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
            <div>
              <span className="label-eyebrow inline-block rounded-full bg-primary px-2.5 py-0.5 text-on-primary">
                {isEdit ? "Edit category" : "New storefront category"}
              </span>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-primary">
                {isEdit ? `Edit — ${category?.name}` : "Create a shop category"}
              </h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Categories move through a draft → published → archived lifecycle; unready ones show a coming-soon page.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close dialog"
              className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              {/* Identity */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Identity</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Category name" required>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. Gift Hampers"
                    />
                  </Field>
                  <Field
                    label="Slug"
                    required
                    hint={
                      isEdit
                        ? "Slugs are permanent — /category/{slug} is the live address and cat_{slug} the storage key."
                        : "Auto-filled from the name; the storefront address is /category/{slug}."
                    }
                  >
                    <Input
                      value={isEdit ? category!.slug : slugTouched ? slug : slugify(name)}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                      maxLength={96}
                      disabled={isEdit || saving}
                      className="font-mono"
                      placeholder="gift-hampers"
                    />
                  </Field>
                </div>
                <Field label="Tagline" hint="One line shown under the category title on the storefront (max 180).">
                  <Input
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    maxLength={180}
                    placeholder="e.g. Hand-built hampers for every celebration"
                  />
                </Field>
                <Field label="Description" hint="Longer editorial copy for the category page (max 4000).">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={4000}
                    rows={4}
                  />
                </Field>
              </section>

              {/* Storefront presentation */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Storefront presentation</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Sort order" hint="Lower numbers appear first.">
                    <Input
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      inputMode="numeric"
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Lifecycle status">
                    <Select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className="h-11">
                      <option value="draft">Draft — in preparation</option>
                      <option value="published">Published — live</option>
                      <option value="archived">Archived — retired</option>
                    </Select>
                  </Field>
                  <div className="flex items-end pb-1.5">
                    <Checkbox
                      label="Visible on storefront"
                      description="Unready categories show a coming-soon page."
                      checked={isReady}
                      disabled={saving}
                      onChange={(e) => setIsReady(e.target.checked)}
                    />
                  </div>
                </div>
                <Field label="Hero image" hint="Full https:// URL — shown at the top of the category page.">
                  <div className="flex items-center gap-3">
                    {heroImage.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element -- absolute CMS asset URL, mirrors the storefront
                      <img
                        src={heroImage.trim()}
                        alt="Category hero preview"
                        className="h-14 w-14 shrink-0 rounded-lg border border-outline-variant/40 object-cover"
                      />
                    ) : (
                      <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline-variant/60 text-[10px] text-outline">
                        none
                      </span>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={heroImage}
                        onChange={(e) => setHeroImage(e.target.value)}
                        maxLength={600}
                        className="font-mono text-xs"
                        placeholder="https://res.cloudinary.com/…"
                      />
                      <div className="flex items-center gap-2">
                        <MediaUploader onUploaded={(media) => setHeroImage(media.url)} disabled={saving}>
                          Upload image
                        </MediaUploader>
                        {heroImage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-error hover:bg-error-container/40"
                            onClick={() => setHeroImage("")}
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Field>
              </section>

              {/* SEO */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">SEO (optional)</h3>
                <Field label="SEO title" hint="Search-engine title; falls back to the category name (max 180).">
                  <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={180} />
                </Field>
                <Field label="SEO description" hint="Shown in search results and link previews (max 300).">
                  <Textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={300} rows={2} />
                </Field>
              </section>

              {error ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {error}
                </p>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {isEdit ? "Save changes" : "Create category"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Unsaved-changes guard */}
      {confirmingDiscard ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/50 p-4 backdrop-blur-xs">
          <div role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes" className="w-full max-w-md rounded-xl bg-surface-container-lowest p-5 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-primary">Discard unsaved changes?</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              This form has edits that have not been saved yet. Closing now will lose them.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDiscard(false)}>
                Keep editing
              </Button>
              <Button
                size="sm"
                className="bg-error text-on-error hover:bg-error/90"
                onClick={() => {
                  setConfirmingDiscard(false);
                  onClose();
                }}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
