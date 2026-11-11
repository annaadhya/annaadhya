"use client";
/**
 * /homepage — storefront homepage content console.
 *
 * Section content (Cards 2–5) lives in the HomepageDoc singleton:
 *  - GET  /admin/content/homepage  → HomepageDoc (server creates it on first read)
 *  - POST /admin/content/homepage  → partial update; `items` arrays are replaced
 *    wholesale, scalar fields are deep-merged server-side. Blank strings are
 *    omitted so the storefront's approved design defaults render.
 *  Each card saves independently (content:write), with its own saving state +
 *  toast, and re-syncs that section from the API response afterwards.
 *
 * Hero copy (Card 1) deliberately lives in SettingsDoc.storefront — same data
 * the Settings console edits, saved via POST /admin/settings with only the
 * storefront hero keys (the API deep-merges, so other settings never move).
 * Needs settings:read to view, settings:write to save; without read access the
 * card degrades to an honest explanation instead of fake fields.
 *
 * Newsletter + gift-collection flags are NOT duplicated here — they stay in
 * Admin → Settings → Storefront (the Gifting card only mentions the flag).
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import type { CategoryDoc, HomepageDoc, SettingsDoc } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ImageField } from "@/components/homepage/image-field";
import { IconChevronDown, IconChevronUp, IconExternal, IconInfo, IconPlus, IconSparkle, IconTrash } from "@/components/homepage/icons";

/* ------------------------------ validation ------------------------------ */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mirrors contracts cmsHrefSchema: site path or absolute http(s) URL. */
function isCmsHref(v: string): boolean {
  return v.startsWith("/") || /^https?:\/\/.+/i.test(v);
}

/** Mirrors contracts cmsImageUrlSchema: absolute URL or site-rooted path. */
function isCmsImageUrl(v: string): boolean {
  return /^https?:\/\/.+/i.test(v) || v.startsWith("/");
}

/* --------------------------------- state -------------------------------- */

interface CollectionsRow {
  key: string;
  categorySlug: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
}

interface TrustRow {
  key: string;
  title: string;
  description: string;
}

interface HomepageFormState {
  collectionsEnabled: boolean;
  collectionsHeading: string;
  collectionsRows: CollectionsRow[];
  trustEnabled: boolean;
  trustRows: TrustRow[];
  storyEnabled: boolean;
  storyEyebrow: string;
  storyTitle: string;
  storyQuote: string;
  storyText: string;
  storyImage: string;
  storyCtaHref: string;
  storyCtaLabel: string;
  giftingEnabled: boolean;
  giftingTitle: string;
  giftingCopy: string;
  giftingImage: string;
  giftingCtaHref: string;
  giftingCtaLabel: string;
  giftingProductSlug: string;
}

interface HeroFormState {
  headline: string;
  headlineAccent: string;
  subcopy: string;
  image: string;
  ctaHref: string;
  ctaLabel: string;
}

const MAX_COLLECTION_ROWS = 12; // contracts: collections.items max(12)
const MAX_TRUST_ROWS = 8; // contracts: trust.items max(8)

function newRowKey(): string {
  return `row${Math.random().toString(36).slice(2, 9)}`;
}

function collectionsFromDoc(doc: HomepageDoc): Pick<HomepageFormState, "collectionsEnabled" | "collectionsHeading" | "collectionsRows"> {
  return {
    collectionsEnabled: doc.collections?.enabled ?? true,
    collectionsHeading: doc.collections?.heading ?? "",
    collectionsRows: (doc.collections?.items ?? []).map((i) => ({
      key: newRowKey(),
      categorySlug: i.categorySlug,
      eyebrow: i.eyebrow ?? "",
      title: i.title ?? "",
      description: i.description ?? "",
      image: i.image ?? "",
    })),
  };
}

function trustFromDoc(doc: HomepageDoc): Pick<HomepageFormState, "trustEnabled" | "trustRows"> {
  return {
    trustEnabled: doc.trust?.enabled ?? true,
    trustRows: (doc.trust?.items ?? []).map((i) => ({ key: newRowKey(), title: i.title, description: i.description })),
  };
}

function storyFromDoc(doc: HomepageDoc): Pick<HomepageFormState, "storyEnabled" | "storyEyebrow" | "storyTitle" | "storyQuote" | "storyText" | "storyImage" | "storyCtaHref" | "storyCtaLabel"> {
  return {
    storyEnabled: doc.story?.enabled ?? true,
    storyEyebrow: doc.story?.eyebrow ?? "",
    storyTitle: doc.story?.title ?? "",
    storyQuote: doc.story?.quote ?? "",
    storyText: doc.story?.text ?? "",
    storyImage: doc.story?.image ?? "",
    storyCtaHref: doc.story?.ctaHref ?? "",
    storyCtaLabel: doc.story?.ctaLabel ?? "",
  };
}

function giftingFromDoc(doc: HomepageDoc): Pick<HomepageFormState, "giftingEnabled" | "giftingTitle" | "giftingCopy" | "giftingImage" | "giftingCtaHref" | "giftingCtaLabel" | "giftingProductSlug"> {
  return {
    giftingEnabled: doc.gifting?.enabled ?? true,
    giftingTitle: doc.gifting?.title ?? "",
    giftingCopy: doc.gifting?.copy ?? "",
    giftingImage: doc.gifting?.image ?? "",
    giftingCtaHref: doc.gifting?.ctaHref ?? "",
    giftingCtaLabel: doc.gifting?.ctaLabel ?? "",
    giftingProductSlug: doc.gifting?.productSlug ?? "",
  };
}

function docToForm(doc: HomepageDoc): HomepageFormState {
  return {
    ...collectionsFromDoc(doc),
    ...trustFromDoc(doc),
    ...storyFromDoc(doc),
    ...giftingFromDoc(doc),
  };
}

function settingsToHeroForm(doc: SettingsDoc): HeroFormState {
  return {
    headline: doc.storefront.heroHeadline ?? "",
    headlineAccent: doc.storefront.heroHeadlineAccent ?? "",
    subcopy: doc.storefront.heroSubcopy ?? "",
    image: doc.storefront.heroImage ?? "",
    ctaHref: doc.storefront.heroCtaHref ?? "",
    ctaLabel: doc.storefront.heroCtaLabel ?? "",
  };
}

function heroCardError(form: HeroFormState): string | null {
  if (form.image.trim() && !isCmsImageUrl(form.image.trim())) {
    return "Hero image URL must be absolute (https://…) or a site-rooted path (/…).";
  }
  return null;
}

/** Per-row image check used by collections/story/gifting cards. */
function imageRowError(url: string, label: string): string | null {
  const v = url.trim();
  if (v && !isCmsImageUrl(v)) return `${label}: image URL must be absolute (https://…) or a site-rooted path (/…).`;
  return null;
}

export default function HomepagePage() {
  usePageTitle("Homepage");
  const { principal } = useAuth();
  const toast = useToast();
  const canContentWrite = can(principal, "content:write");
  const canSettingsRead = can(principal, "settings:read");
  const canSettingsWrite = can(principal, "settings:write");
  const canReadCategories = can(principal, "categories:read");

  /* ------------------------------- queries ------------------------------ */
  const homepageQuery = useApiQuery<HomepageDoc>(() => apiGet<HomepageDoc>("/admin/content/homepage"));
  const settingsQuery = useApiQuery<SettingsDoc | null>(
    () => (canSettingsRead ? apiGet<SettingsDoc>("/admin/settings") : Promise.resolve(null)),
    [canSettingsRead],
  );
  const categoriesQuery = useApiQuery<CategoryDoc[]>(
    () => (canReadCategories ? apiGet<CategoryDoc[]>("/admin/catalogue/categories") : Promise.resolve([])),
    [canReadCategories],
  );

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  /* ------------------------------ form state ----------------------------- */
  const [form, setForm] = useState<HomepageFormState | null>(null);
  const [heroForm, setHeroForm] = useState<HeroFormState | null>(null);

  useEffect(() => {
    if (homepageQuery.data) setForm(docToForm(homepageQuery.data));
  }, [homepageQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) setHeroForm(settingsToHeroForm(settingsQuery.data));
  }, [settingsQuery.data]);

  const [savingSection, setSavingSection] = useState<"hero" | "collections" | "trust" | "story" | "gifting" | null>(null);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [trustError, setTrustError] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [giftingError, setGiftingError] = useState<string | null>(null);

  function update<K extends keyof HomepageFormState>(key: K, value: HomepageFormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  /* -------------------------- collections rows --------------------------- */
  function updateCollectionRow(key: string, patch: Partial<Omit<CollectionsRow, "key">>) {
    setForm((f) => (f ? { ...f, collectionsRows: f.collectionsRows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : f));
  }

  function addCollectionRow() {
    setForm((f) =>
      f && f.collectionsRows.length < MAX_COLLECTION_ROWS
        ? { ...f, collectionsRows: [...f.collectionsRows, { key: newRowKey(), categorySlug: "", eyebrow: "", title: "", description: "", image: "" }] }
        : f,
    );
  }

  function removeCollectionRow(key: string) {
    setForm((f) => (f ? { ...f, collectionsRows: f.collectionsRows.filter((r) => r.key !== key) } : f));
  }

  function moveCollectionRow(key: string, dir: -1 | 1) {
    setForm((f) => {
      if (!f) return f;
      const rows = [...f.collectionsRows];
      const idx = rows.findIndex((r) => r.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= rows.length) return f;
      [rows[idx], rows[to]] = [rows[to], rows[idx]];
      return { ...f, collectionsRows: rows };
    });
  }

  /* ----------------------------- trust rows ------------------------------ */
  function updateTrustRow(key: string, patch: Partial<Omit<TrustRow, "key">>) {
    setForm((f) => (f ? { ...f, trustRows: f.trustRows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : f));
  }

  function addTrustRow() {
    setForm((f) =>
      f && f.trustRows.length < MAX_TRUST_ROWS ? { ...f, trustRows: [...f.trustRows, { key: newRowKey(), title: "", description: "" }] } : f,
    );
  }

  function removeTrustRow(key: string) {
    setForm((f) => (f ? { ...f, trustRows: f.trustRows.filter((r) => r.key !== key) } : f));
  }

  function moveTrustRow(key: string, dir: -1 | 1) {
    setForm((f) => {
      if (!f) return f;
      const rows = [...f.trustRows];
      const idx = rows.findIndex((r) => r.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= rows.length) return f;
      [rows[idx], rows[to]] = [rows[to], rows[idx]];
      return { ...f, trustRows: rows };
    });
  }

  /* -------------------------------- saves -------------------------------- */

  async function saveHero(e: React.FormEvent) {
    e.preventDefault();
    if (!heroForm) return;
    setHeroError(null);
    const validation = heroCardError(heroForm);
    if (validation) return void setHeroError(validation);

    const image = heroForm.image.trim();
    setSavingSection("hero");
    try {
      const saved = await apiPost<SettingsDoc>("/admin/settings", {
        storefront: {
          heroHeadline: heroForm.headline.trim(),
          heroHeadlineAccent: heroForm.headlineAccent.trim(),
          heroSubcopy: heroForm.subcopy.trim(),
          ...(image ? { heroImage: image } : {}),
          heroCtaHref: heroForm.ctaHref.trim(),
          ...(heroForm.ctaLabel.trim() ? { heroCtaLabel: heroForm.ctaLabel.trim() } : {}),
        },
      });
      setHeroForm(settingsToHeroForm(saved));
      toast.success("Hero saved", "The storefront hero picks this up on its next read.");
    } catch (err) {
      setHeroError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setSavingSection(null);
    }
  }

  async function saveCollections(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setCollectionsError(null);

    const heading = form.collectionsHeading.trim();
    if (heading.length > 120) return void setCollectionsError("The heading must be 120 characters or fewer.");

    const kept: CollectionsRow[] = [];
    for (const [idx, row] of form.collectionsRows.entries()) {
      const allEmpty =
        row.categorySlug.trim() === "" &&
        row.eyebrow.trim() === "" &&
        row.title.trim() === "" &&
        row.description.trim() === "" &&
        row.image.trim() === "";
      if (allEmpty) continue; // fully blank line — not an error, just not sent
      const slug = row.categorySlug.trim();
      if (!SLUG_RE.test(slug)) {
        return void setCollectionsError(`Row ${idx + 1}: choose a category (lowercase-with-dashes slug).`);
      }
      const imgErr = imageRowError(row.image, `Row ${idx + 1}`);
      if (imgErr) return void setCollectionsError(imgErr);
      kept.push(row);
    }

    setSavingSection("collections");
    try {
      const saved = await apiPost<HomepageDoc>("/admin/content/homepage", {
        collections: {
          enabled: form.collectionsEnabled,
          ...(heading ? { heading } : {}),
          items: kept.map((r) => ({
            categorySlug: r.categorySlug.trim(),
            ...(r.eyebrow.trim() ? { eyebrow: r.eyebrow.trim() } : {}),
            ...(r.title.trim() ? { title: r.title.trim() } : {}),
            ...(r.description.trim() ? { description: r.description.trim() } : {}),
            ...(r.image.trim() ? { image: r.image.trim() } : {}),
          })),
        },
      });
      setForm((f) => (f ? { ...f, ...collectionsFromDoc(saved) } : f));
      toast.success("Collections saved", "Signature collection rows are live for the homepage.");
    } catch (err) {
      setCollectionsError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setSavingSection(null);
    }
  }

  async function saveTrust(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setTrustError(null);

    const kept: TrustRow[] = [];
    for (const [idx, row] of form.trustRows.entries()) {
      const title = row.title.trim();
      const description = row.description.trim();
      if (title === "" && description === "") continue; // fully blank line — skip
      if (title === "" || description === "") {
        return void setTrustError(`Card ${idx + 1}: both a title and a description are required (or leave both blank to drop the row).`);
      }
      kept.push({ ...row, title, description });
    }

    setSavingSection("trust");
    try {
      const saved = await apiPost<HomepageDoc>("/admin/content/homepage", {
        trust: {
          enabled: form.trustEnabled,
          items: kept.map((r) => ({ title: r.title, description: r.description })),
        },
      });
      setForm((f) => (f ? { ...f, ...trustFromDoc(saved) } : f));
      toast.success("Trust indicators saved", kept.length === 0 ? "Empty list — the four approved default cards render." : `${kept.length} trust card${kept.length === 1 ? "" : "s"} saved.`);
    } catch (err) {
      setTrustError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setSavingSection(null);
    }
  }

  async function saveStory(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setStoryError(null);

    const ctaHref = form.storyCtaHref.trim();
    if (ctaHref && (ctaHref.length > 600 || !isCmsHref(ctaHref))) {
      return void setStoryError("Story CTA link must be a site path (/…) or an absolute http(s) URL.");
    }
    const imgErr = imageRowError(form.storyImage, "Story image");
    if (imgErr) return void setStoryError(imgErr);

    setSavingSection("story");
    try {
      const saved = await apiPost<HomepageDoc>("/admin/content/homepage", {
        story: {
          enabled: form.storyEnabled,
          ...(form.storyEyebrow.trim() ? { eyebrow: form.storyEyebrow.trim() } : {}),
          ...(form.storyTitle.trim() ? { title: form.storyTitle.trim() } : {}),
          ...(form.storyQuote.trim() ? { quote: form.storyQuote.trim() } : {}),
          ...(form.storyText.trim() ? { text: form.storyText.trim() } : {}),
          ...(form.storyImage.trim() ? { image: form.storyImage.trim() } : {}),
          ...(ctaHref ? { ctaHref } : {}),
          ...(form.storyCtaLabel.trim() ? { ctaLabel: form.storyCtaLabel.trim() } : {}),
        },
      });
      setForm((f) => (f ? { ...f, ...storyFromDoc(saved) } : f));
      toast.success("Heritage story saved", "The story strip updates on the homepage.");
    } catch (err) {
      setStoryError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setSavingSection(null);
    }
  }

  async function saveGifting(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setGiftingError(null);

    const ctaHref = form.giftingCtaHref.trim();
    if (ctaHref && (ctaHref.length > 600 || !isCmsHref(ctaHref))) {
      return void setGiftingError("Banner CTA link must be a site path (/…) or an absolute http(s) URL.");
    }
    const productSlug = form.giftingProductSlug.trim();
    if (productSlug && !SLUG_RE.test(productSlug)) {
      return void setGiftingError("Featured product slug must be lowercase-with-dashes (e.g. royal-shahi-hamper).");
    }
    const imgErr = imageRowError(form.giftingImage, "Banner image");
    if (imgErr) return void setGiftingError(imgErr);

    setSavingSection("gifting");
    try {
      const saved = await apiPost<HomepageDoc>("/admin/content/homepage", {
        gifting: {
          enabled: form.giftingEnabled,
          ...(form.giftingTitle.trim() ? { title: form.giftingTitle.trim() } : {}),
          ...(form.giftingCopy.trim() ? { copy: form.giftingCopy.trim() } : {}),
          ...(form.giftingImage.trim() ? { image: form.giftingImage.trim() } : {}),
          ...(ctaHref ? { ctaHref } : {}),
          ...(form.giftingCtaLabel.trim() ? { ctaLabel: form.giftingCtaLabel.trim() } : {}),
          ...(productSlug ? { productSlug } : {}),
        },
      });
      setForm((f) => (f ? { ...f, ...giftingFromDoc(saved) } : f));
      toast.success("Gifting banner saved", "The banner updates on the homepage (when the gift collection flag is on).");
    } catch (err) {
      setGiftingError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setSavingSection(null);
    }
  }

  /* ------------------------------- rendering ------------------------------ */

  if (homepageQuery.loading || (homepageQuery.data && !form)) {
    return (
      <div>
        <HomepagePageHeader />
        <Card>
          <TableSkeleton rows={10} cols={4} />
        </Card>
      </div>
    );
  }

  if (homepageQuery.error || !homepageQuery.data || !form) {
    return (
      <div>
        <HomepagePageHeader />
        <Card>
          <ErrorState
            message={homepageQuery.error?.message ?? "Homepage content is not available"}
            status={homepageQuery.error?.status}
            onRetry={homepageQuery.reload}
          />
        </Card>
      </div>
    );
  }

  const heroFieldsDisabled = !canSettingsWrite;
  const cmsFieldsDisabled = !canContentWrite;
  const giftFlag = settingsQuery.data?.storefront.giftCollectionEnabled;

  return (
    <div>
      <HomepagePageHeader />

      {!canContentWrite ? (
        <Card className="mb-6 p-4 text-sm text-ink/70 sm:p-6">
          You have <strong>content:read</strong> only — every section below is read-only. Ask an owner for{" "}
          <strong>content:write</strong> to edit homepage content.
        </Card>
      ) : null}

      {/* ------------------------------ Card 1: Hero ----------------------------- */}
      <section className="mb-6">
        <Card>
          <CardHeader
            title="Hero (from Settings)"
            subtitle="Headline, subcopy and CTA over the approved hero photo — edited via Admin → Settings"
            actions={
              canSettingsRead && settingsQuery.data ? (
                <span className="text-xs text-ink/45">Last updated {formatDateTime(settingsQuery.data.updatedAt)}</span>
              ) : undefined
            }
          />
          <CardBody>
            {!canSettingsRead ? (
              <div className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-4 text-sm text-on-surface-variant">
                <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                <div>
                  <p className="font-semibold text-on-surface">Hero copy lives in Admin → Settings → Storefront</p>
                  <p className="mt-1">
                    You don&apos;t have <strong>settings:read</strong>, so the current hero fields are hidden here. Ask an owner
                    for <strong>settings:read</strong> to view them, or <strong>settings:write</strong> to edit — this console
                    shows them read-only once read access is granted.
                  </p>
                </div>
              </div>
            ) : !heroForm || settingsQuery.loading ? (
              <TableSkeleton rows={4} cols={2} />
            ) : settingsQuery.error ? (
              <ErrorState message={settingsQuery.error.message} status={settingsQuery.error.status} onRetry={settingsQuery.reload} />
            ) : (
              <form onSubmit={saveHero} noValidate className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label="Hero headline — part 1 (dark)"
                    hint="First line of the headline, dark serif. Blank = this part is skipped"
                  >
                    <Input
                      value={heroForm.headline}
                      onChange={(e) => setHeroForm({ ...heroForm, headline: e.target.value })}
                      maxLength={120}
                      disabled={heroFieldsDisabled}
                    />
                  </Field>
                  <Field
                    label="Hero headline — part 2 (wine-red italic)"
                    hint="Second line in the accent style (like “Brought Home.”). Blank = skipped; both blank = the approved design headline"
                  >
                    <Input
                      value={heroForm.headlineAccent}
                      onChange={(e) => setHeroForm({ ...heroForm, headlineAccent: e.target.value })}
                      maxLength={120}
                      disabled={heroFieldsDisabled}
                    />
                  </Field>
                  <Field label="Hero CTA label" hint="Max 40 characters — blank = “Shop All Products”">
                    <Input
                      value={heroForm.ctaLabel}
                      onChange={(e) => setHeroForm({ ...heroForm, ctaLabel: e.target.value })}
                      maxLength={40}
                      disabled={heroFieldsDisabled}
                    />
                  </Field>
                  <Field label="Hero CTA link" hint="Max 200 characters — blank = /shop">
                    <Input
                      value={heroForm.ctaHref}
                      onChange={(e) => setHeroForm({ ...heroForm, ctaHref: e.target.value })}
                      maxLength={200}
                      disabled={heroFieldsDisabled}
                    />
                  </Field>
                  <ImageField
                    label="Hero image URL"
                    value={heroForm.image}
                    onChange={(next) => setHeroForm({ ...heroForm, image: next })}
                    disabled={heroFieldsDisabled}
                    hint="Blank = the approved hero photo"
                  />
                  <Field label="Hero subcopy" className="md:col-span-2" hint="Max 240 characters — blank renders the approved design subcopy">
                    <Textarea
                      value={heroForm.subcopy}
                      onChange={(e) => setHeroForm({ ...heroForm, subcopy: e.target.value })}
                      rows={2}
                      maxLength={240}
                      disabled={heroFieldsDisabled}
                    />
                  </Field>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Blank fields render the approved design default. Saved via Admin → Settings; requires Settings write access.
                </p>
                {heroError ? (
                  <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                    {heroError}
                  </p>
                ) : null}
                {canSettingsWrite ? (
                  <div className="flex justify-end">
                    <Button type="submit" loading={savingSection === "hero"}>
                      Save hero
                    </Button>
                  </div>
                ) : (
                  <p className="text-right text-xs text-ink/50">
                    You have <strong>settings:read</strong> only — hero fields are read-only here.
                  </p>
                )}
              </form>
            )}
          </CardBody>
        </Card>
      </section>

      {/* ------------------------ Card 2: Signature Collections ------------------- */}
      <section className="mb-6">
        <Card>
          <CardHeader
            title="Signature Collections"
            subtitle="Curated category rows under the hero — each renders a storefront collection card"
          />
          <CardBody>
            <form onSubmit={saveCollections} noValidate className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Checkbox
                  label="Collections section enabled"
                  checked={form.collectionsEnabled}
                  onChange={(e) => update("collectionsEnabled", e.target.checked)}
                  disabled={cmsFieldsDisabled}
                />
              </div>
              <Field label="Section heading" hint="Optional — blank renders “Explore Our Treasures”">
                <Input
                  value={form.collectionsHeading}
                  onChange={(e) => update("collectionsHeading", e.target.value)}
                  maxLength={120}
                  placeholder="Explore Our Treasures"
                  disabled={cmsFieldsDisabled}
                />
              </Field>

              <div className="space-y-3">
                {form.collectionsRows.map((row, idx) => (
                  <fieldset
                    key={row.key}
                    className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3"
                  >
                    <legend className="px-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-on-surface-variant">
                      Collection row {idx + 1}
                    </legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {canReadCategories && categories.length > 0 ? (
                        <Field
                          label="Category"
                          required
                          hint={categories.some((c) => c.slug === row.categorySlug) || row.categorySlug === "" ? "Rows render only when the category exists in the catalogue" : "This slug is missing from the catalogue — pick a live category"}
                        >
                          <Select
                            value={row.categorySlug}
                            onChange={(e) => updateCollectionRow(row.key, { categorySlug: e.target.value })}
                            disabled={cmsFieldsDisabled}
                            aria-label={`Category for collection row ${idx + 1}`}
                          >
                            <option value="">Choose a category…</option>
                            {row.categorySlug && !categories.some((c) => c.slug === row.categorySlug) ? (
                              <option value={row.categorySlug}>{row.categorySlug} (missing from catalogue)</option>
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
                          hint={canReadCategories ? "No categories loaded — type the exact catalogue slug" : "Category list needs categories:read — type the exact slug"}
                        >
                          <Input
                            value={row.categorySlug}
                            onChange={(e) => updateCollectionRow(row.key, { categorySlug: e.target.value.toLowerCase() })}
                            maxLength={96}
                            placeholder="gift-hampers"
                            className="font-mono"
                            disabled={cmsFieldsDisabled}
                          />
                        </Field>
                      )}
                      <Field label="Eyebrow" hint="Small card badge text — optional">
                        <Input
                          value={row.eyebrow}
                          onChange={(e) => updateCollectionRow(row.key, { eyebrow: e.target.value })}
                          maxLength={120}
                          placeholder="e.g. Festive picks"
                          disabled={cmsFieldsDisabled}
                        />
                      </Field>
                      <Field label="Title" hint="CTA label override — optional">
                        <Input
                          value={row.title}
                          onChange={(e) => updateCollectionRow(row.key, { title: e.target.value })}
                          maxLength={120}
                          disabled={cmsFieldsDisabled}
                        />
                      </Field>
                      <Field label="Description" hint="Card copy — optional">
                        <Input
                          value={row.description}
                          onChange={(e) => updateCollectionRow(row.key, { description: e.target.value })}
                          maxLength={400}
                          disabled={cmsFieldsDisabled}
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <ImageField
                          label="Card image URL"
                          value={row.image}
                          onChange={(next) => updateCollectionRow(row.key, { image: next })}
                          disabled={cmsFieldsDisabled}
                          hint="Optional — blank uses the category's own hero image"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move collection row ${idx + 1} up`}
                        disabled={cmsFieldsDisabled || idx === 0}
                        onClick={() => moveCollectionRow(row.key, -1)}
                      >
                        <IconChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move collection row ${idx + 1} down`}
                        disabled={cmsFieldsDisabled || idx === form.collectionsRows.length - 1}
                        onClick={() => moveCollectionRow(row.key, 1)}
                      >
                        <IconChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:bg-error-container/40"
                        aria-label={`Remove collection row ${idx + 1}`}
                        disabled={cmsFieldsDisabled}
                        onClick={() => removeCollectionRow(row.key)}
                      >
                        <IconTrash className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCollectionRow}
                  disabled={cmsFieldsDisabled || form.collectionsRows.length >= MAX_COLLECTION_ROWS}
                >
                  <IconPlus className="h-4 w-4" />
                  Add collection row
                </Button>
                <p className="text-xs text-on-surface-variant">
                  Rows render only when the category exists in the catalogue. Saving at least one row makes the grid
                  fully yours, in your order — the three curated design cards only show while no rows are saved.
                </p>
              </div>

              {collectionsError ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {collectionsError}
                </p>
              ) : null}
              {canContentWrite ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={savingSection === "collections"}>
                    Save collections
                  </Button>
                </div>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </section>

      {/* -------------------------- Card 3: Trust Indicators --------------------- */}
      <section className="mb-6">
        <Card>
          <CardHeader title="Trust Indicators" subtitle="Small assurance cards under the collections — craft, purity, delivery" />
          <CardBody>
            <form onSubmit={saveTrust} noValidate className="space-y-4">
              <Checkbox
                label="Trust indicators enabled"
                checked={form.trustEnabled}
                onChange={(e) => update("trustEnabled", e.target.checked)}
                disabled={cmsFieldsDisabled}
              />

              <div className="space-y-3">
                {form.trustRows.map((row, idx) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 items-end gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3 sm:grid-cols-[1fr_1.6fr_auto]"
                  >
                    <Field label={`Card ${idx + 1} title`} required>
                      <Input
                        value={row.title}
                        onChange={(e) => updateTrustRow(row.key, { title: e.target.value })}
                        maxLength={120}
                        placeholder="e.g. Single-origin honey"
                        disabled={cmsFieldsDisabled}
                      />
                    </Field>
                    <Field label="Description" required>
                      <Input
                        value={row.description}
                        onChange={(e) => updateTrustRow(row.key, { description: e.target.value })}
                        maxLength={400}
                        placeholder="e.g. Raw, unheated and lab-tested from named apiaries"
                        disabled={cmsFieldsDisabled}
                      />
                    </Field>
                    <div className="flex items-center justify-end gap-1.5 pb-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move trust card ${idx + 1} up`}
                        disabled={cmsFieldsDisabled || idx === 0}
                        onClick={() => moveTrustRow(row.key, -1)}
                      >
                        <IconChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move trust card ${idx + 1} down`}
                        disabled={cmsFieldsDisabled || idx === form.trustRows.length - 1}
                        onClick={() => moveTrustRow(row.key, 1)}
                      >
                        <IconChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:bg-error-container/40"
                        aria-label={`Remove trust card ${idx + 1}`}
                        disabled={cmsFieldsDisabled}
                        onClick={() => removeTrustRow(row.key)}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTrustRow}
                  disabled={cmsFieldsDisabled || form.trustRows.length >= MAX_TRUST_ROWS}
                >
                  <IconPlus className="h-4 w-4" />
                  Add trust card
                </Button>
                <p className="text-xs text-on-surface-variant">Empty list renders the four approved default cards.</p>
              </div>

              {trustError ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {trustError}
                </p>
              ) : null}
              {canContentWrite ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={savingSection === "trust"}>
                    Save trust indicators
                  </Button>
                </div>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </section>

      {/* ------------------------ Card 4: Heritage Story Strip ------------------- */}
      <section className="mb-6">
        <Card>
          <CardHeader title="Heritage Story Strip" subtitle="The brand story band — quote, narrative and an optional CTA" />
          <CardBody>
            <form onSubmit={saveStory} noValidate className="space-y-4">
              <Checkbox
                label="Story strip enabled"
                checked={form.storyEnabled}
                onChange={(e) => update("storyEnabled", e.target.checked)}
                disabled={cmsFieldsDisabled}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Eyebrow" hint="Max 120 characters — optional">
                  <Input
                    value={form.storyEyebrow}
                    onChange={(e) => update("storyEyebrow", e.target.value)}
                    maxLength={120}
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
                <Field
                  label="Title"
                  hint="Max 200 characters — the storefront applies its approved italic styling when the default is kept"
                >
                  <Input
                    value={form.storyTitle}
                    onChange={(e) => update("storyTitle", e.target.value)}
                    maxLength={200}
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
              </div>
              <Field label="Quote" hint="Max 600 characters — the display quote inside the strip">
                <Textarea
                  value={form.storyQuote}
                  onChange={(e) => update("storyQuote", e.target.value)}
                  rows={2}
                  maxLength={600}
                  disabled={cmsFieldsDisabled}
                />
              </Field>
              <Field label="Narrative text" hint="Max 1200 characters — blank keeps the approved story copy">
                <Textarea
                  value={form.storyText}
                  onChange={(e) => update("storyText", e.target.value)}
                  rows={4}
                  maxLength={1200}
                  disabled={cmsFieldsDisabled}
                />
              </Field>
              <ImageField
                label="Story image URL"
                value={form.storyImage}
                onChange={(next) => update("storyImage", next)}
                disabled={cmsFieldsDisabled}
                hint="Blank = the approved heritage photo"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="CTA link" hint="Starts with / or https:// — blank hides the CTA">
                  <Input
                    value={form.storyCtaHref}
                    onChange={(e) => update("storyCtaHref", e.target.value)}
                    maxLength={600}
                    placeholder="/about"
                    className="font-mono"
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
                <Field label="CTA label" hint="Max 80 characters">
                  <Input
                    value={form.storyCtaLabel}
                    onChange={(e) => update("storyCtaLabel", e.target.value)}
                    maxLength={80}
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
              </div>
              <p className="text-xs text-on-surface-variant">
                Blank fields render the approved design defaults — the strip never renders broken.
              </p>
              {storyError ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {storyError}
                </p>
              ) : null}
              {canContentWrite ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={savingSection === "story"}>
                    Save story strip
                  </Button>
                </div>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </section>

      {/* --------------------------- Card 5: Gifting Banner ---------------------- */}
      <section className="mb-6">
        <Card>
          <CardHeader
            title="Gifting Banner"
            subtitle="The seasonal gifting band with an optional featured gift product"
          />
          <CardBody>
            <form onSubmit={saveGifting} noValidate className="space-y-4">
              <Checkbox
                label="Gifting banner enabled"
                checked={form.giftingEnabled}
                onChange={(e) => update("giftingEnabled", e.target.checked)}
                disabled={cmsFieldsDisabled}
              />
              <Field label="Title" hint="Max 200 characters — blank = approved banner title">
                <Input
                  value={form.giftingTitle}
                  onChange={(e) => update("giftingTitle", e.target.value)}
                  maxLength={200}
                  disabled={cmsFieldsDisabled}
                />
              </Field>
              <Field label="Copy" hint="Max 800 characters — blank = approved banner copy">
                <Textarea
                  value={form.giftingCopy}
                  onChange={(e) => update("giftingCopy", e.target.value)}
                  rows={3}
                  maxLength={800}
                  disabled={cmsFieldsDisabled}
                />
              </Field>
              <ImageField
                label="Banner image URL"
                value={form.giftingImage}
                onChange={(next) => update("giftingImage", next)}
                disabled={cmsFieldsDisabled}
                hint="Blank = the approved gifting photo"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="CTA link" hint="Starts with / or https://">
                  <Input
                    value={form.giftingCtaHref}
                    onChange={(e) => update("giftingCtaHref", e.target.value)}
                    maxLength={600}
                    placeholder="/category/gift-boxes"
                    className="font-mono"
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
                <Field label="CTA label" hint="Max 80 characters">
                  <Input
                    value={form.giftingCtaLabel}
                    onChange={(e) => update("giftingCtaLabel", e.target.value)}
                    maxLength={80}
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
                <Field
                  label="Featured product slug"
                  hint="Optional — the gift product shown on the banner; must exist in the catalogue or the product overlay silently renders nothing"
                >
                  <Input
                    value={form.giftingProductSlug}
                    onChange={(e) => update("giftingProductSlug", e.target.value.toLowerCase())}
                    maxLength={96}
                    placeholder="royal-shahi-hamper"
                    className="font-mono"
                    disabled={cmsFieldsDisabled}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3 text-sm">
                <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                <p className="text-on-surface-variant">
                  The banner also needs <strong>Settings → Storefront → giftCollectionEnabled</strong> to be ON
                  {giftFlag === undefined ? "" : giftFlag ? " — it currently is." : " — it is currently OFF, so the banner stays hidden even when enabled here."}{" "}
                  That master flag lives in Admin → Settings and is intentionally not duplicated on this page.
                </p>
              </div>
              {giftingError ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {giftingError}
                </p>
              ) : null}
              {canContentWrite ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={savingSection === "gifting"}>
                    Save gifting banner
                  </Button>
                </div>
              ) : null}
            </form>
          </CardBody>
        </Card>
      </section>

      <Card className="border border-secondary/30 bg-secondary-container/40">
        <CardBody className="flex items-start gap-3">
          <IconSparkle className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          <p className="text-sm text-on-surface-variant">
            Every section above saves independently — blank fields always fall back to the approved design defaults, and the
            storefront revalidates automatically after each save (within a minute at most).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/** Shared page heading (kept as a function so early returns stay tidy). */
function HomepagePageHeader() {
  return (
    <PageHeader
      eyebrow={
        <>
          <span>Console</span>
          <span aria-hidden>›</span>
          <span>Storefront</span>
          <span className="font-bold text-primary">Homepage</span>
        </>
      }
      title="Homepage"
      description="Edit the homepage section content — collections, trust cards, story strip and gifting banner — without touching code."
      actions={
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-4 text-sm font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconExternal className="h-4 w-4" />
          View storefront /
        </a>
      }
    />
  );
}
