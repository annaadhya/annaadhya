"use client";
/**
 * Add / Edit navigation link dialog — one form for both modes.
 *
 * - Destination kinds mirror the API's navigationItemUpsertSchema: home, shop,
 *   category (validated against the live catalogue), page (published CMS pages)
 *   and href (site path or absolute http(s) URL). Only the destination key that
 *   matches the selected kind is sent — the server rejects unknown combos.
 * - Category picker requires categories:read; without it the slug is a plain
 *   text input (the server still validates existence and surfaces 422s).
 * - sortOrder defaults to max+1 within the chosen location so new links append
 *   instead of fighting for position.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { CategoryDoc, NavLocation, NavigationItemDoc, PageDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { storefrontUrlForPageSlug } from "./page-urls";

export const NAV_LOCATIONS: { value: NavLocation; label: string }[] = [
  { value: "header", label: "Header navigation" },
  { value: "footer-care", label: "Footer — Customer Care" },
  { value: "footer-legal", label: "Footer — Legal" },
];

const KIND_OPTIONS: { value: NavigationItemDoc["kind"]; label: string }[] = [
  { value: "home", label: "Homepage" },
  { value: "shop", label: "Shop All" },
  { value: "category", label: "Category page" },
  { value: "page", label: "CMS page" },
  { value: "href", label: "Custom URL" },
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The upsert body the API expects (mirrors contracts NavigationItemUpsertDto). */
export type NavigationItemUpsertPayload = Omit<NavigationItemDoc, "id" | "createdAt" | "updatedAt" | "isDemo" | "seedBatch">;

export interface NavLinkFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null → create; present → edit this item. */
  editing: NavigationItemDoc | null;
  /** All items — used to suggest the next free sortOrder within a location. */
  items: NavigationItemDoc[];
  categories: CategoryDoc[];
  /** False → the category picker degrades to a plain slug input. */
  canReadCategories: boolean;
  /** PUBLISHED pages only (the public navigation drops anything else). */
  pages: PageDoc[];
  /** Section preselected when creating (per-card "Add link" buttons). */
  initialLocation?: NavLocation;
  onSaved: () => void;
}

function maxSortOrderIn(items: NavigationItemDoc[], location: NavLocation): number {
  return items.reduce((max, i) => (i.location === location ? Math.max(max, i.sortOrder) : max), -1);
}

export function NavLinkFormDialog({
  open,
  onClose,
  editing,
  items,
  categories,
  canReadCategories,
  pages,
  initialLocation = "header",
  onSaved,
}: NavLinkFormDialogProps) {
  const [location, setLocation] = useState<NavLocation>("header");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<NavigationItemDoc["kind"]>("home");
  const [categorySlug, setCategorySlug] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [href, setHref] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form whenever the dialog opens for a (different) item.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    if (editing) {
      setLocation(editing.location);
      setLabel(editing.label);
      setKind(editing.kind);
      setCategorySlug(editing.categorySlug ?? "");
      setPageSlug(editing.pageSlug ?? "");
      setHref(editing.href ?? "");
      setSortOrder(String(editing.sortOrder));
      setEnabled(editing.enabled);
    } else {
      setLocation(initialLocation);
      setLabel("");
      setKind("home");
      setCategorySlug("");
      setPageSlug("");
      setHref("");
      setSortOrder(String(maxSortOrderIn(items, initialLocation) + 1));
      setEnabled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function handleLocationChange(next: NavLocation) {
    setLocation(next);
    // When creating, keep the suggested "append at end" order for the new location.
    if (!editing) setSortOrder(String(maxSortOrderIn(items, next) + 1));
  }

  const selectedCategory = useMemo(() => categories.find((c) => c.slug === categorySlug) ?? null, [categories, categorySlug]);
  const selectedPage = useMemo(() => pages.find((p) => p.slug === pageSlug) ?? null, [pages, pageSlug]);

  /** Page slug saved on this item but no longer published — keep it selectable so edits never silently rewrite it. */
  const unpublishedPageSlug =
    editing?.kind === "page" && editing.pageSlug && !pages.some((p) => p.slug === editing.pageSlug) ? editing.pageSlug : null;

  /** Category slug saved on this item but missing from the loaded catalogue list. */
  const missingCategorySlug =
    editing?.kind === "category" && editing.categorySlug && !categories.some((c) => c.slug === editing.categorySlug)
      ? editing.categorySlug
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedLabel = label.trim();
    if (trimmedLabel.length < 1) return void setError("Enter a link label.");
    if (trimmedLabel.length > 60) return void setError("The label must be 60 characters or fewer.");

    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0 || order > 999) {
      return void setError("Sort order must be a whole number between 0 and 999.");
    }

    const payload: NavigationItemUpsertPayload = {
      location,
      label: trimmedLabel,
      kind,
      sortOrder: order,
      enabled,
    };
    if (kind === "category") {
      const slug = categorySlug.trim();
      if (!slug) return void setError("Choose a category for this link.");
      if (!SLUG_RE.test(slug)) return void setError("Category slug must be lowercase letters, numbers and dashes.");
      payload.categorySlug = slug;
    } else if (kind === "page") {
      const slug = pageSlug.trim();
      if (!slug) return void setError("Choose a CMS page for this link.");
      if (!SLUG_RE.test(slug)) return void setError("Page slug must be lowercase letters, numbers and dashes.");
      payload.pageSlug = slug;
    } else if (kind === "href") {
      const url = href.trim();
      if (!url) return void setError("Enter a destination path or URL.");
      if (url.length > 600) return void setError("The URL must be 600 characters or fewer.");
      if (!(url.startsWith("/") || /^https?:\/\/.+/i.test(url))) {
        return void setError("The URL must be a site path (/…) or an absolute http(s):// URL.");
      }
      payload.href = url;
    }

    setSaving(true);
    try {
      await apiPost<NavigationItemDoc>(
        editing ? `/admin/content/navigation/${editing.id}` : "/admin/content/navigation",
        payload,
      );
      onSaved();
      onClose();
    } catch (err) {
      // Recoverable: keep every form value so the user can retry or correct.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      title={editing ? `Edit link — ${editing.label}` : "Add a navigation link"}
      description={
        editing
          ? "Changes apply to the storefront navigation after save."
          : "New links append to the end of their section — reorder with the arrows afterwards."
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Section" required hint="Where the link renders on the storefront">
            <Select
              value={location}
              onChange={(e) => handleLocationChange(e.target.value as NavLocation)}
              disabled={saving}
              aria-label="Navigation section"
            >
              {NAV_LOCATIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label" required hint="Shown to shoppers — 1 to 60 characters">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Gift Hampers"
              disabled={saving}
            />
          </Field>
        </div>

        <Field label="Destination" required hint="Where the link points">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as NavigationItemDoc["kind"])}
            disabled={saving}
            aria-label="Destination kind"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        {kind === "category" ? (
          canReadCategories && categories.length > 0 ? (
            <Field
              label="Category"
              required
              hint={
                selectedCategory
                  ? `Renders at /category/${selectedCategory.slug}`
                  : "The server verifies the category exists — invalid slugs are rejected"
              }
            >
              <Select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                disabled={saving}
                aria-label="Category"
              >
                <option value="">Choose a category…</option>
                {missingCategorySlug ? (
                  <option value={missingCategorySlug}>{missingCategorySlug} (missing from catalogue)</option>
                ) : null}
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field
              label="Category slug"
              required
              hint={
                canReadCategories
                  ? "No categories loaded — type the exact catalogue slug (e.g. gift-hampers)"
                  : "Type the exact catalogue slug (category list needs categories:read)"
              }
            >
              <Input
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value.toLowerCase())}
                maxLength={96}
                placeholder="gift-hampers"
                className="font-mono"
                disabled={saving}
              />
            </Field>
          )
        ) : null}

        {kind === "page" ? (
          <Field
            label="CMS page"
            required
            hint={selectedPage ? `Renders at ${storefrontUrlForPageSlug(selectedPage.slug)}` : "Published pages only — drafts never go live"}
          >
            <Select value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} disabled={saving} aria-label="CMS page">
              <option value="">Choose a published page…</option>
              {unpublishedPageSlug ? (
                <option value={unpublishedPageSlug}>{unpublishedPageSlug} (currently unpublished)</option>
              ) : null}
              {pages.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title} · {storefrontUrlForPageSlug(p.slug)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {kind === "href" ? (
          <Field label="URL" required hint="Site path (/shop) or absolute http(s):// URL">
            <Input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              maxLength={600}
              placeholder="/shop or https://…"
              className="font-mono"
              disabled={saving}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sort order" hint="Lower numbers appear first within the section">
            <Input
              type="number"
              min={0}
              max={999}
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="font-mono"
              disabled={saving}
            />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              label="Enabled"
              description="Disabled links stay in this list but never render publicly."
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saving}
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-outline-variant/40 pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Save changes" : "Add link"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
