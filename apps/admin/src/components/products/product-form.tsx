"use client";
/**
 * ProductForm — the shared Add/Edit product form per the approved Stitch design
 * ("Modern Indian Heritage", reference code.html + screen.png):
 *
 *   LEFT (8/12):  01 Basic Information · 02 Story & Provenance · Visuals & Media
 *                 (bento grid) · Variants & Tiered Pricing (table) · Category
 *                 Compliance (dynamic per category) · SEO & Search Listing
 *   RIGHT (4/12): Publishing Status · Inventory Matrix · Compliance & Details ·
 *                 Customer Storefront Card (live render)
 *   BOTTOM:       sticky action bar with unsaved-changes indicator, Discard,
 *                 Save as Draft and the primary Create/Save action.
 *
 * Data rules (unchanged from the original form):
 *  - money inputs are typed in RUPEES and converted once at submit (Math.round(r*100))
 *  - SKU conflicts (409) from the API surface inline
 *  - every mutation goes through the documented upsert API — no local-only state
 *
 * Honest-UI rules: prototype-only controls from the reference (scenario switcher,
 * free-tag collections) have no backend and are intentionally omitted rather than faked.
 * The five formerly-omitted controls — Storefront Search Visibility, Auto-Track
 * Inventory, Backorders Policy, drag-to-reorder variants and the rich-text toolbar —
 * are LIVE: the backend (contracts/api) now persists and enforces all of them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/format";
import { productUpsertSchema, zodErrorList } from "@/lib/schemas";
import { useToast } from "@/lib/toast";
import { stripHtml } from "@annaadhya/utils/rich-text";
import type { CategoryDoc, ProductSpec, ProductStatus, ProductUpsertPayload, ProductWithVariants, VariantUpsertPayload } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { HeritageField, HeritageInput, HeritageSelect, HeritageTextarea, SectionCard, SlugField, SerpPreview } from "./form-fields";
import { VariantsTable } from "./variants-table";
import { RichTextEditor } from "./rich-text-editor";
import { MediaGrid } from "./media-grid";
import { ComplianceCard, InventoryCard, PublishingCard, StorefrontPreviewCard } from "./product-sidebar";

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9\-_.]{2,40}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Local slugify (the admin is a self-contained client app — no workspace imports). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** Load the category list for the select — admin endpoint first, public endpoint as fallback. */
export function useCategories(currentCategoryId?: string): { categories: CategoryDoc[]; loading: boolean; error: string | null } {
  const { principal } = useAuth();
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let rows: CategoryDoc[];
        if (principal && can(principal, "categories:read")) {
          rows = await apiGet<CategoryDoc[]>("/admin/catalogue/categories");
        } else {
          // Roles without categories:read fall back to the public (published + ready) list.
          rows = await apiGet<CategoryDoc[]>("/categories");
        }
        if (!cancelled) setCategories(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load categories");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [principal]);

  // Keep the currently selected category selectable even if the fallback list omits it.
  const merged = useMemo(() => {
    if (!currentCategoryId || categories.some((c) => c.id === currentCategoryId)) return categories;
    return [
      ...categories,
      {
        id: currentCategoryId,
        slug: "current",
        name: `Current category (${currentCategoryId})`,
        tagline: "",
        description: "",
        sortOrder: 0,
        isReady: false,
        status: "draft" as ProductStatus,
        createdAt: 0,
        updatedAt: 0,
        isDemo: false,
      },
    ];
  }, [categories, currentCategoryId]);

  return { categories: merged, loading, error };
}

/* ------------------------------ row/state types ----------------------------- */

interface VariantRow {
  key: string;
  id?: string;
  sku: string;
  packLabel: string;
  grams: string;
  price: string; // rupees
  mrp: string; // rupees, "" = not set
  status: ProductStatus;
  stockOnHand: string;
  lowStockThreshold: string;
}

interface ImageRow {
  key: string;
  url: string;
  cloudinaryPublicId?: string;
  alt: string;
  width?: number;
  height?: number;
}

export type { VariantRow };
export type { ImageRow };

export interface ProductFormState {
  sku: string;
  name: string;
  subtitle: string;
  description: string;
  categoryId: string;
  typeLabel: string;
  status: ProductStatus;
  slug: string; // value shown in the slug input
  slugLocked: boolean; // UI-only: locked by default per the design
  origin: string;
  shelfLife: string;
  specs: ProductSpec[];
  ingredients: string;
  netQuantityLabel: string;
  storageInstructions: string;
  allergenInfo: string;
  manufacturerDetails: string;
  fssaiLicense: string;
  bestsellerRank: string;
  featuredRank: string;
  giftItem: boolean;
  searchVisible: boolean;
  trackInventory: boolean;
  backorderPolicy: "deny" | "allow" | "notify";
  seoTitle: string;
  seoDescription: string;
}

export function emptyProductForm(): ProductFormState {
  return {
    sku: "",
    name: "",
    subtitle: "",
    description: "",
    categoryId: "",
    typeLabel: "",
    status: "draft",
    slug: "",
    slugLocked: true,
    origin: "",
    shelfLife: "",
    specs: [],
    ingredients: "",
    netQuantityLabel: "",
    storageInstructions: "",
    allergenInfo: "",
    manufacturerDetails: "",
    fssaiLicense: "",
    bestsellerRank: "",
    featuredRank: "",
    giftItem: false,
    searchVisible: true,
    trackInventory: true,
    backorderPolicy: "deny",
    seoTitle: "",
    seoDescription: "",
  };
}

export function productDocToForm(doc: ProductWithVariants): ProductFormState {
  return {
    sku: doc.sku,
    name: doc.name,
    subtitle: doc.subtitle ?? "",
    description: doc.description ?? "",
    categoryId: doc.categoryId,
    typeLabel: doc.typeLabel ?? "",
    status: doc.status,
    slug: doc.slug,
    slugLocked: true,
    origin: doc.origin ?? "",
    shelfLife: doc.shelfLife ?? "",
    specs: (doc.specs ?? []).map((s) => ({ label: s.label, value: s.value })),
    ingredients: doc.ingredients ?? "",
    netQuantityLabel: doc.netQuantityLabel ?? "",
    storageInstructions: doc.storageInstructions ?? "",
    allergenInfo: doc.allergenInfo ?? "",
    manufacturerDetails: doc.manufacturerDetails ?? "",
    fssaiLicense: doc.fssaiLicense ?? "",
    bestsellerRank: doc.bestsellerRank !== undefined ? String(doc.bestsellerRank) : "",
    featuredRank: doc.featuredRank !== undefined ? String(doc.featuredRank) : "",
    giftItem: doc.giftItem,
    searchVisible: doc.searchVisible !== false,
    trackInventory: doc.trackInventory !== false,
    backorderPolicy: doc.backorderPolicy ?? "deny",
    seoTitle: doc.seo?.title ?? "",
    seoDescription: doc.seo?.description ?? "",
  };
}

export function emptyVariantRow(): VariantRow {
  return {
    key: `v${Math.random().toString(36).slice(2, 9)}`,
    sku: "",
    packLabel: "",
    grams: "",
    price: "",
    mrp: "",
    status: "published",
    stockOnHand: "0",
    lowStockThreshold: "5",
  };
}

/** Variants of an existing doc as editable rows (paise → rupee inputs). */
export function docVariantsToRows(doc: ProductWithVariants): VariantRow[] {
  return doc.variants.map((v) => ({
    key: v.id,
    id: v.id,
    sku: v.sku,
    packLabel: v.packLabel,
    grams: String(v.grams),
    price: paiseToRupeeInput(v.pricePaise),
    mrp: v.mrpPaise !== undefined ? paiseToRupeeInput(v.mrpPaise) : "",
    status: v.status,
    stockOnHand: String(v.stockOnHand),
    lowStockThreshold: String(v.lowStockThreshold),
  }));
}

/** Rows of an existing doc's images as editable rows. */
export function docImagesToRows(doc: ProductWithVariants): ImageRow[] {
  return (doc.images ?? []).map((img, i) => ({
    key: `img${i}`,
    url: img.url,
    cloudinaryPublicId: img.cloudinaryPublicId,
    alt: img.alt ?? "",
    width: img.width,
    height: img.height,
  }));
}

export function emptyImageRow(): ImageRow {
  return { key: `i${Math.random().toString(36).slice(2, 9)}`, url: "", alt: "" };
}

/** Build the upsert payload straight from a fetched doc (used by quick publish + duplicate). */
export function productDocToPayload(doc: ProductWithVariants, statusOverride?: ProductStatus): ProductUpsertPayload {
  return {
    sku: doc.sku,
    name: doc.name,
    subtitle: doc.subtitle,
    description: doc.description,
    categoryId: doc.categoryId,
    typeLabel: doc.typeLabel,
    status: statusOverride ?? doc.status,
    images: doc.images ?? [],
    slug: doc.slug,
    origin: doc.origin,
    shelfLife: doc.shelfLife,
    specs: doc.specs,
    ingredients: doc.ingredients,
    netQuantityLabel: doc.netQuantityLabel,
    storageInstructions: doc.storageInstructions,
    allergenInfo: doc.allergenInfo,
    manufacturerDetails: doc.manufacturerDetails,
    fssaiLicense: doc.fssaiLicense,
    bestsellerRank: doc.bestsellerRank,
    featuredRank: doc.featuredRank,
    giftItem: doc.giftItem,
    // Preserve the stored storefront controls on quick actions — never reset them.
    searchVisible: doc.searchVisible !== false,
    trackInventory: doc.trackInventory !== false,
    backorderPolicy: doc.backorderPolicy ?? "deny",
    seo: { title: doc.seo?.title, description: doc.seo?.description },
    variants: doc.variants.map((v, idx) => ({
      id: v.id,
      sku: v.sku,
      packLabel: v.packLabel,
      grams: v.grams,
      pricePaise: v.pricePaise,
      mrpPaise: v.mrpPaise,
      status: v.status,
      stockOnHand: v.stockOnHand,
      lowStockThreshold: v.lowStockThreshold,
      sortOrder: v.sortOrder ?? idx,
    })),
  };
}

/**
 * Payload for the Duplicate action: a DRAFT copy with a fresh product SKU AND
 * fresh variant SKUs (variant SKUs are globally unique, so copying them verbatim
 * would always 409).
 */
export function buildDuplicatePayload(doc: ProductWithVariants): ProductUpsertPayload {
  const payload = productDocToPayload(doc, "draft");
  payload.name = `${doc.name} (Copy)`.slice(0, 120);
  payload.slug = undefined; // let the API derive it from the new name
  const renameSku = (sku: string) => {
    const base = `${sku}-C`.toUpperCase().replace(/[^A-Z0-9\-_.]/g, "");
    return base.slice(0, 39) + "2";
  };
  payload.sku = renameSku(doc.sku);
  payload.variants = payload.variants.map((v) => ({ ...v, id: undefined, sku: renameSku(v.sku) }));
  return payload;
}

/* --------------------------- category spec templates ------------------------- */

export interface SpecTemplate {
  title: string;
  labels: string[];
}

/** Category-specific compliance fields (Section 05) keyed by the category slug. */
export function specTemplateFor(categorySlug: string | undefined): SpecTemplate {
  switch (categorySlug) {
    case "honey":
      return {
        title: "Category Compliance & Laboratory Testing",
        labels: ["Botanical Classification", "Moisture Level", "Purity Testing Certificate Batch ID", "Crystallization Profile"],
      };
    case "kesar":
      return {
        title: "Kashmiri Saffron Botanical Metrics & GI Verification",
        labels: ["Crocin Content (Coloring Power)", "Safranal Aroma Level", "GI Registry Authorization", "Harvest Period"],
      };
    case "dry-fruits":
      return {
        title: "Dry Fruit & Nut Sourcing Details",
        labels: ["Variety / Type", "Origin & Estate", "Preparation Details", "Grading"],
      };
    case "gift-boxes":
      return {
        title: "Hamper Configuration & Gifting Details",
        labels: ["Included Products", "Hamper Configuration", "Gift Packaging Details", "Recommended Occasions"],
      };
    default:
      return {
        title: "Category Compliance Details",
        labels: ["Batch Information", "Certifications", "Country of Origin"],
      };
  }
}

function optionalRank(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : NaN;
}

/* --------------------------------- submit hook ------------------------------- */

export interface ProductFieldErrors {
  name?: string;
  sku?: string;
  slug?: string;
  categoryId?: string;
}

export function useProductSubmit() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(
    form: ProductFormState,
    variantRows: VariantRow[],
    imageRows: ImageRow[],
    mode: "create" | "edit",
    productId?: string,
    statusOverride?: ProductStatus,
  ): Promise<ProductWithVariants | null> {
    setServerError(null);
    setSkuError(null);
    setErrors([]);
    const fieldErrors: ProductFieldErrors = {};

    // ---- client-side validation (mirrors productUpsertSchema) ----
    const problems: string[] = [];
    if (!SKU_PATTERN.test(form.sku.trim())) {
      problems.push("SKU must be 3-41 chars: A-Z, 0-9, dashes (may not start with a dash).");
      fieldErrors.sku = "3-41 chars: A-Z, 0-9, dashes.";
    }
    if (form.name.trim().length < 2) {
      problems.push("Name must be at least 2 characters.");
      fieldErrors.name = "Please enter a valid product name (at least 2 characters).";
    }
    if (stripHtml(form.description).trim().length < 10) problems.push("Description must be at least 10 characters of visible text.");
    if (!form.categoryId) {
      problems.push("Pick a category.");
      fieldErrors.categoryId = "Please choose a heritage category.";
    }

    // Slug is only submitted when the user unlocked the field and typed one.
    const customSlug = !form.slugLocked && form.slug.trim() !== "" ? form.slug.trim().toLowerCase() : undefined;
    if (customSlug !== undefined && !SLUG_PATTERN.test(customSlug)) {
      problems.push("Slug must be lowercase letters, numbers and dashes (at least 3 characters).");
      fieldErrors.slug = "Use lowercase letters, numbers and dashes — e.g. raw-wild-forest-honey.";
    }

    const bestsellerRank = optionalRank(form.bestsellerRank);
    const featuredRank = optionalRank(form.featuredRank);
    if (Number.isNaN(bestsellerRank) || (bestsellerRank !== undefined && (bestsellerRank < 1 || bestsellerRank > 1000)))
      problems.push("Bestseller rank must be an integer between 1 and 1000.");
    if (Number.isNaN(featuredRank) || (featuredRank !== undefined && (featuredRank < 1 || featuredRank > 1000)))
      problems.push("Featured rank must be an integer between 1 and 1000.");

    const variants: VariantUpsertPayload[] = [];
    variantRows.forEach((row, idx) => {
      const label = `Variant ${idx + 1} (${row.sku || "no SKU"})`;
      if (!SKU_PATTERN.test(row.sku.trim())) problems.push(`${label}: SKU must be 3-41 chars: A-Z, 0-9, dashes.`);
      if (row.packLabel.trim().length < 1) problems.push(`${label}: pack label is required.`);
      const grams = Number(row.grams);
      if (!Number.isFinite(grams) || grams <= 0) problems.push(`${label}: grams must be a positive number.`);
      const pricePaise = rupeesToPaise(row.price);
      if (Number.isNaN(pricePaise) || pricePaise <= 0) problems.push(`${label}: selling price must be greater than ₹0.`);
      let mrpPaise: number | undefined;
      if (row.mrp.trim() !== "") {
        mrpPaise = rupeesToPaise(row.mrp);
        if (Number.isNaN(mrpPaise)) problems.push(`${label}: MRP is not a valid amount.`);
      }
      const stock = Number(row.stockOnHand || "0");
      if (!Number.isInteger(stock) || stock < 0) problems.push(`${label}: stock on hand must be a whole number ≥ 0.`);
      const threshold = Number(row.lowStockThreshold || "0");
      if (!Number.isInteger(threshold) || threshold < 0) problems.push(`${label}: low-stock threshold must be a whole number ≥ 0.`);

      variants.push({
        id: row.id,
        sku: row.sku.trim().toUpperCase(),
        packLabel: row.packLabel.trim(),
        grams,
        pricePaise,
        mrpPaise,
        status: row.status,
        stockOnHand: stock,
        lowStockThreshold: threshold,
        sortOrder: idx, // row order IS the storefront display order
      });
    });

    if (problems.length > 0) {
      setErrors(problems);
      setFieldErrors(fieldErrors);
      return null;
    }

    const payload: ProductUpsertPayload = {
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      subtitle: form.subtitle.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId,
      typeLabel: form.typeLabel.trim(),
      status: statusOverride ?? form.status,
      images: imageRows
        .filter((img) => img.url.trim() !== "")
        .map((img) => ({
          url: img.url.trim(),
          cloudinaryPublicId: img.cloudinaryPublicId,
          alt: img.alt.trim(),
          width: img.width,
          height: img.height,
        })),
      slug: customSlug,
      origin: form.origin.trim() || undefined,
      shelfLife: form.shelfLife.trim() || undefined,
      specs: form.specs
        .map((s) => ({ label: s.label.trim().slice(0, 60), value: s.value.trim().slice(0, 200) }))
        .filter((s) => s.value !== ""),
      ingredients: form.ingredients.trim() || undefined,
      netQuantityLabel: form.netQuantityLabel.trim() || undefined,
      storageInstructions: form.storageInstructions.trim() || undefined,
      allergenInfo: form.allergenInfo.trim() || undefined,
      manufacturerDetails: form.manufacturerDetails.trim() || undefined,
      fssaiLicense: form.fssaiLicense.trim() || undefined,
      bestsellerRank,
      featuredRank,
      giftItem: form.giftItem,
      searchVisible: form.searchVisible,
      trackInventory: form.trackInventory,
      backorderPolicy: form.backorderPolicy,
      seo: {
        title: form.seoTitle.trim() || undefined,
        description: form.seoDescription.trim() || undefined,
      },
      variants,
    };

    // Final gate with the client-side zod mirror of productUpsertSchema — same rules as the API.
    const parsed = productUpsertSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodErrorList(parsed.error));
      return null;
    }

    setSaving(true);
    try {
      const saved =
        mode === "create"
          ? await apiPost<ProductWithVariants>("/admin/catalogue/products", payload)
          : await apiPost<ProductWithVariants>(`/admin/catalogue/products/${productId}`, payload);
      toast.success(statusOverride === "draft" ? "Draft saved" : mode === "create" ? "Product created" : "Product saved", `${saved.sku} — ${saved.name}`);
      return saved;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "conflict") {
          const isSlug = err.message.toLowerCase().startsWith("slug ");
          if (isSlug) {
            setFieldErrors({ slug: err.message });
            setErrors([err.message]);
          } else {
            setSkuError(err.message);
            setErrors([err.message]);
          }
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("Unexpected error while saving.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { submit, saving, serverError, skuError, fieldErrors, errors, setErrors };
}

/* -------------------------------- form component ------------------------------ */

function serialize(form: ProductFormState, variantRows: VariantRow[], imageRows: ImageRow[]): string {
  return JSON.stringify({ form, variantRows, imageRows });
}

function useOriginHost(): string {
  const [host, setHost] = useState("annaadhya.com");
  useEffect(() => {
    setHost(window.location.host.replace(/^admin\./, ""));
  }, []);
  return host;
}

export function ProductForm({
  mode,
  productId,
  form,
  setForm,
  variantRows,
  setVariantRows,
  imageRows,
  setImageRows,
  onSaved,
  hydrationKey,
}: {
  mode: "create" | "edit";
  productId?: string;
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  variantRows: VariantRow[];
  setVariantRows: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  imageRows: ImageRow[];
  setImageRows: React.Dispatch<React.SetStateAction<ImageRow[]>>;
  onSaved?: (product: ProductWithVariants) => void;
  /** Change this when the underlying doc re-hydrates (id + updatedAt) to re-baseline the dirty check. */
  hydrationKey?: string;
}) {
  const { principal } = useAuth();
  const canWrite = can(principal, "products:write");
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories(
    mode === "edit" ? form.categoryId : undefined,
  );
  const { submit, saving, serverError, skuError, fieldErrors, errors } = useProductSubmit();
  const host = useOriginHost();

  function update<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* ------------------------- dirty tracking / discard ------------------------ */
  const snapshotRef = useRef<string>("");
  useEffect(() => {
    // Re-baseline whenever the underlying doc (re)hydrates.
    snapshotRef.current = serialize(form, variantRows, imageRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationKey]);

  const current = serialize(form, variantRows, imageRows);
  const dirty = current !== snapshotRef.current && snapshotRef.current !== "";

  useEffect(() => {
    if (!dirty || !canWrite) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, canWrite]);

  function discard() {
    if (!dirty) return;
    if (!window.confirm("Discard unsaved changes and restore the last saved state?")) return;
    try {
      const snap = JSON.parse(snapshotRef.current) as { form: ProductFormState; variantRows: VariantRow[]; imageRows: ImageRow[] };
      setForm(snap.form);
      setVariantRows(snap.variantRows);
      setImageRows(snap.imageRows);
    } catch {
      // ignore malformed snapshot (never expected)
    }
  }

  /* ----------------------------- category change ----------------------------- */
  const template = specTemplateFor(categories.find((c) => c.id === form.categoryId)?.slug);

  function changeCategory(nextId: string) {
    const nextSlug = categories.find((c) => c.id === nextId)?.slug;
    setForm((f) => {
      const nextTemplate = specTemplateFor(nextSlug);
      // Preserve entered values when a label exists in the new template; keep any
      // previously saved non-template rows so switching never silently destroys data.
      const merged: ProductSpec[] = nextTemplate.labels.map((label) => ({
        label,
        value: f.specs.find((s) => s.label === label)?.value ?? "",
      }));
      const extras = f.specs.filter((s) => !nextTemplate.labels.includes(s.label));
      return { ...f, categoryId: nextId, specs: [...merged, ...extras] };
    });
  }

  /* --------------------------------- saving --------------------------------- */
  async function doSave(statusOverride?: ProductStatus) {
    const saved = await submit(form, variantRows, imageRows, mode, productId, statusOverride);
    if (saved) onSaved?.(saved);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSave();
  }

  /* ------------------------------ preview values ----------------------------- */
  const cheapest = variantRows
    .map((r) => ({ row: r, paise: rupeesToPaise(r.price) }))
    .filter((v) => Number.isFinite(v.paise) && v.paise > 0)
    .sort((a, b) => a.paise - b.paise)[0];
  const cheapestMrp = cheapest && cheapest.row.mrp.trim() !== "" ? rupeesToPaise(cheapest.row.mrp) : null;
  const displaySlug = form.slugLocked && mode === "create" && !dirtySlugTouched(form) ? slugify(form.name) : form.slug;
  const serpTitle = form.seoTitle.trim() || `${form.name.trim() || "Product"} | Annaadhya Products`;
  const serpDescription =
    form.seoDescription.trim() ||
    (form.subtitle.trim() || form.description.trim()).slice(0, 160) ||
    "Certified organic heritage harvest from Annaadhya Products.";
  const serpUrl = `${host} › product › ${displaySlug || slugify(form.name) || "…"}`;

  const savedSections = useMemo(() => {
    if (!dirty || snapshotRef.current === "") return null;
    try {
      const snap = JSON.parse(snapshotRef.current) as { form: ProductFormState; variantRows: VariantRow[]; imageRows: ImageRow[] };
      const parts: string[] = [];
      if (JSON.stringify(snap.form) !== JSON.stringify(form)) parts.push("product details");
      if (JSON.stringify(snap.variantRows) !== JSON.stringify(variantRows)) parts.push("package variants");
      if (JSON.stringify(snap.imageRows) !== JSON.stringify(imageRows)) parts.push("images");
      return parts.length > 0 ? parts : null;
    } catch {
      return ["product details"];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  return (
    <form id="product-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-12" noValidate>
      {/* ------------------------------ server alerts ------------------------------ */}
      <div className="lg:col-span-12 space-y-3">
        {serverError ? (
          <p role="alert" className="rounded-lg bg-error-container px-4 py-3 text-body-sm font-medium text-on-error-container">
            {serverError}
          </p>
        ) : null}
        {errors.length > 0 ? (
          <ul role="alert" className="list-inside list-disc rounded-lg bg-tertiary-fixed/50 px-4 py-3 text-body-sm text-on-tertiary-fixed">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ============================== LEFT COLUMN ============================== */}
      <div className="flex flex-col gap-6 lg:col-span-8">
        {/* 01 · Basic Information */}
        <SectionCard dot="maroon" title="Basic Information" tag="Section 01">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <HeritageField
              label="Product Name"
              required
              error={fieldErrors.name}
              className="md:col-span-8"
              htmlFor="prod-title"
            >
              <HeritageInput
                id="prod-title"
                value={form.name}
                disabled={!canWrite}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Kashmiri Mongra Saffron"
                maxLength={120}
              />
            </HeritageField>
            <HeritageField
              label="Master SKU"
              required
              error={skuError ?? fieldErrors.sku}
              className="md:col-span-4"
              htmlFor="prod-sku"
            >
              <HeritageInput
                id="prod-sku"
                value={form.sku}
                disabled={!canWrite}
                onChange={(e) => update("sku", e.target.value.toUpperCase())}
                placeholder="HON-WLD-350"
                maxLength={41}
                className="font-semibold uppercase tracking-wider"
              />
            </HeritageField>
            <div className="md:col-span-12">
              <SlugField
                value={displaySlug}
                locked={form.slugLocked}
                disabled={!canWrite}
                error={fieldErrors.slug}
                onToggleLock={() =>
                  setForm((f) =>
                    f.slugLocked && f.slug.trim() === "" && f.name.trim() !== ""
                      ? { ...f, slugLocked: false, slug: slugify(f.name) } // prefill from the name on first unlock
                      : { ...f, slugLocked: !f.slugLocked },
                  )
                }
                onChange={(next) => update("slug", next)}
              />
            </div>
            <HeritageField
              label="Primary Heritage Category"
              required
              error={categoriesError ?? fieldErrors.categoryId}
              className="md:col-span-12"
              htmlFor="prod-category"
            >
              <HeritageSelect
                id="prod-category"
                value={form.categoryId}
                disabled={!canWrite || categoriesLoading}
                onChange={(e) => changeCategory(e.target.value)}
              >
                <option value="">{categoriesLoading ? "Loading categories…" : "Select a category"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status !== "published" ? ` (${c.status === "archived" ? "archived" : "draft"})` : ""}
                  </option>
                ))}
              </HeritageSelect>
            </HeritageField>
            <HeritageField
              label="Editorial Hook / Short Summary"
              hint="The one-line hook shown under the title on the storefront."
              className="md:col-span-12"
              htmlFor="prod-summary"
            >
              <HeritageTextarea
                id="prod-summary"
                value={form.subtitle}
                disabled={!canWrite}
                rows={2}
                maxLength={180}
                onChange={(e) => update("subtitle", e.target.value)}
              />
            </HeritageField>
          </div>
        </SectionCard>

        {/* 02 · Story & Provenance */}
        <SectionCard dot="green" title="Botanical Provenance & Story" tag="Section 02">
          <HeritageField
            label="Full Product Description"
            required
            hint="Rich text — bold, lists and links render on the storefront. At least 10 characters of visible text."
            htmlFor="prod-full-desc"
          >
            <RichTextEditor
              value={form.description}
              onChange={(html) => update("description", html)}
              readOnly={!canWrite}
            />
          </HeritageField>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <HeritageField label="Floral Source / Variety" hint='e.g. "Wild Mangrove & Mustard Blossom"'>
              <HeritageInput
                value={form.typeLabel}
                disabled={!canWrite}
                maxLength={120}
                onChange={(e) => update("typeLabel", e.target.value)}
              />
            </HeritageField>
            <HeritageField label="Terroir / Geographical Origin" hint="Estate, cooperative or biosphere the harvest comes from">
              <HeritageInput
                value={form.origin}
                disabled={!canWrite}
                maxLength={200}
                onChange={(e) => update("origin", e.target.value)}
              />
            </HeritageField>
            <HeritageField label="Ingredients Statement">
              <HeritageInput
                value={form.ingredients}
                disabled={!canWrite}
                maxLength={2000}
                onChange={(e) => update("ingredients", e.target.value)}
              />
            </HeritageField>
            <HeritageField label="Shelf Life">
              <HeritageInput
                value={form.shelfLife}
                disabled={!canWrite}
                maxLength={80}
                onChange={(e) => update("shelfLife", e.target.value)}
                placeholder="e.g. 24 months from harvest date"
              />
            </HeritageField>
            <HeritageField label="Storage & Crystallization Care" className="md:col-span-2">
              <HeritageInput
                value={form.storageInstructions}
                disabled={!canWrite}
                maxLength={1000}
                onChange={(e) => update("storageInstructions", e.target.value)}
              />
            </HeritageField>
          </div>
        </SectionCard>

        {/* Visuals & Media */}
        <SectionCard
          dot="gold"
          title="Product Visuals & Media"
          action={<span className="text-label-sm font-medium text-outline">{`${imageRows.length} of 10 Uploaded`}</span>}
        >
          <MediaGrid rows={imageRows} setRows={setImageRows} disabled={!canWrite} />
        </SectionCard>

        {/* Variants & Tiered Pricing */}
        <SectionCard dot="umber" title="Variants & Tiered Pricing">
          <VariantsTable rows={variantRows} setRows={setVariantRows} canWrite={canWrite} />
        </SectionCard>

        {/* 04 · Category-specific compliance */}
        <SectionCard dot="maroon" title={template.title} tag="Section 04">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {template.labels.map((label) => {
              const row = form.specs.find((s) => s.label === label) ?? { label, value: "" };
              return (
                <HeritageField key={label} label={label}>
                  <HeritageInput
                    value={row.value}
                    disabled={!canWrite}
                    maxLength={200}
                    onChange={(e) =>
                      setForm((f) => {
                        const exists = f.specs.some((s) => s.label === label);
                        const specs = exists
                          ? f.specs.map((s) => (s.label === label ? { ...s, value: e.target.value } : s))
                          : [...f.specs, { label, value: e.target.value }];
                        return { ...f, specs };
                      })
                    }
                  />
                </HeritageField>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-outline">
            Fields adapt to the selected category. Entries are saved with the product and travel with it when the category changes.
          </p>
        </SectionCard>

        {/* SEO & Search Listing */}
        <SectionCard
          dot="clay"
          title="Search Engine Listing & Metadata"
          action={
            <span className="flex items-center gap-1 text-label-sm font-semibold text-secondary">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="m8.4 12.3 2.4 2.4 4.8-5" />
              </svg>
              {form.seoTitle.trim() ? "Optimized" : "Preview"}
            </span>
          }
        >
          <SerpPreview url={serpUrl} title={serpTitle} description={serpDescription} />
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="seo-title-input" className="text-label-md font-semibold text-on-surface">
                  SEO Meta Title
                </label>
                <span className={`text-label-sm font-semibold ${form.seoTitle.length > 60 ? "text-tertiary" : "text-secondary"}`}>
                  {form.seoTitle.length} / 60 chars
                </span>
              </div>
              <HeritageInput
                id="seo-title-input"
                value={form.seoTitle}
                disabled={!canWrite}
                maxLength={180}
                onChange={(e) => update("seoTitle", e.target.value)}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="seo-desc-input" className="text-label-md font-semibold text-on-surface">
                  SEO Meta Description
                </label>
                <span className={`text-label-sm font-semibold ${form.seoDescription.length > 160 ? "text-tertiary" : "text-secondary"}`}>
                  {form.seoDescription.length} / 160 chars
                </span>
              </div>
              <HeritageTextarea
                id="seo-desc-input"
                value={form.seoDescription}
                disabled={!canWrite}
                rows={2}
                maxLength={320}
                onChange={(e) => update("seoDescription", e.target.value)}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ============================== RIGHT COLUMN ============================= */}
      <aside className="flex flex-col gap-6 lg:col-span-4">
        <PublishingCard
          status={form.status}
          onStatus={(s) => update("status", s)}
          giftItem={form.giftItem}
          onGiftItem={(v) => update("giftItem", v)}
          searchVisible={form.searchVisible}
          onSearchVisible={(v) => update("searchVisible", v)}
          featuredRank={form.featuredRank}
          onFeaturedRank={(v) => update("featuredRank", v)}
          bestsellerRank={form.bestsellerRank}
          onBestsellerRank={(v) => update("bestsellerRank", v)}
          disabled={!canWrite}
        />
        <InventoryCard
          variantRows={variantRows}
          trackInventory={form.trackInventory}
          onTrackInventory={(v) => update("trackInventory", v)}
          backorderPolicy={form.backorderPolicy}
          onBackorderPolicy={(v) => update("backorderPolicy", v)}
        />
        <ComplianceCard
          values={{
            netQuantityLabel: form.netQuantityLabel,
            fssaiLicense: form.fssaiLicense,
            allergenInfo: form.allergenInfo,
            manufacturerDetails: form.manufacturerDetails,
          }}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          disabled={!canWrite}
        />
        <StorefrontPreviewCard
          name={form.name}
          categoryName={categories.find((c) => c.id === form.categoryId)?.name ?? ""}
          imageUrl={imageRows.find((r) => r.url.trim() !== "")?.url}
          pricePaise={cheapest ? cheapest.paise : null}
          mrpPaise={cheapestMrp !== null && Number.isFinite(cheapestMrp) ? cheapestMrp : null}
          slug={displaySlug}
          status={form.status}
        />
      </aside>

      {/* ============================ STICKY ACTION BAR =========================== */}
      {canWrite ? (
        <div className="lg:col-span-12">
          <div className="sticky bottom-4 z-20 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface/95 px-4 py-3 shadow-[0_-2px_12px_rgba(39,24,16,0.08)] ring-1 ring-outline-variant/40 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-2">
              {dirty ? (
                <>
                  <span aria-hidden className="h-2 w-2 animate-ping rounded-full bg-error" />
                  <span className="text-body-sm font-medium text-on-surface-variant">
                    Unsaved changes{savedSections ? ` in ${savedSections.join(", ")}` : ""}
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden className="h-2 w-2 rounded-full bg-secondary" />
                  <span className="text-body-sm text-on-surface-variant">All changes saved</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={!dirty || saving}
                className="rounded-lg px-4 py-2 text-label-md font-semibold text-outline transition-colors hover:bg-surface-container hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard Changes
              </button>
              {form.status !== "draft" || mode === "create" ? (
                <Button variant="outline" size="md" onClick={() => void doSave("draft")} loading={saving}>
                  Save as Draft
                </Button>
              ) : null}
              <Button type="submit" size="md" loading={saving}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12 5 5L20 7" />
                </svg>
                {mode === "create" ? "Create Product" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/** True when the user unlocked the slug and typed a custom value (create mode preview guard). */
function dirtySlugTouched(form: ProductFormState): boolean {
  return !form.slugLocked || form.slug.trim() !== "";
}

