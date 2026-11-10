/**
 * Shared constants + helpers for the Pages console (list + editor + dialogs).
 *
 * Everything here mirrors the API contracts exactly:
 *  - the built-in slug → storefront URL map mirrors apps/api …/content-urls.ts
 *  - the FAQ category keys mirror the storefront's FAQ explorer categories
 *  - the block factories produce objects that satisfy the server's
 *    pageUpsertSchema (packages/contracts …/dto/admin.ts) — maxlengths and
 *    array bounds below are the server's, enforced again client-side.
 */
import type { CmsDocumentBlock, CmsSection, FaqEntry, PageDoc } from "@/lib/types";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Same slugify rules everywhere (categories + pages): lowercase-dash. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/* ------------------------- storefront URL mapping ------------------------- */

/** Frozen storefront routes for built-in slugs (mirrors apps/api content-urls.ts). */
export const BUILTIN_PAGE_ROUTES: Record<string, string> = {
  "our-story": "/about",
  faq: "/faq",
  contact: "/contact",
  shipping: "/policies/shipping",
  returns: "/policies/returns",
  privacy: "/policies/privacy",
  terms: "/policies/terms",
};

/** Live URL a page renders at. Custom pages live under /p/{slug}. */
export function pageUrlFor(page: { slug: string; builtIn: boolean }): string {
  if (page.builtIn) return BUILTIN_PAGE_ROUTES[page.slug] ?? `/p/${page.slug}`;
  return `/p/${page.slug}`;
}

/* ------------------------------ FAQ categories ----------------------------- */

export const FAQ_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "orders", label: "Orders" },
  { value: "shipping", label: "Shipping & Delivery" },
  { value: "payments", label: "Payments" },
  { value: "products", label: "Products" },
  { value: "returns", label: "Returns & Refunds" },
  { value: "gifts", label: "Gifts & Hampers" },
  { value: "account", label: "Account & Website" },
];

export function emptyFaqEntry(): FaqEntry {
  return { category: "orders", question: "", answer: "" };
}

/* ------------------------------ block catalogue ---------------------------- */

export type DocumentBlockType = CmsDocumentBlock["type"];

export const BLOCK_TYPE_OPTIONS: { value: DocumentBlockType; label: string }[] = [
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Paragraph" },
  { value: "list", label: "List" },
  { value: "cards", label: "Cards" },
  { value: "note", label: "Note" },
  { value: "table", label: "Table" },
  { value: "steps", label: "Steps" },
  { value: "banner", label: "Banner" },
  { value: "quote", label: "Quote" },
  { value: "image", label: "Image" },
  { value: "cta", label: "Call to action" },
  { value: "divider", label: "Divider" },
  { value: "shippingTiers", label: "Shipping tiers (live)" },
];

export function blockTypeLabel(type: DocumentBlockType): string {
  return BLOCK_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/** Server contract limits, mirrored for the block editor's honest inputs. */
export const BLOCK_LIMITS = {
  heading: 500,
  paragraph: 8000,
  sectionEyebrow: 120,
  sectionTitle: 200,
  sectionToc: 80,
  sectionId: 96,
  lede: 600,
  seoTitle: 180,
  seoDescription: 300,
  imageAlt: 500,
  imageCaption: 500,
  faqQuestion: 300,
  faqAnswer: 4000,
} as const;

/** A fresh, empty block of the requested type (satisfies the server schema). */
export function emptyBlock(type: DocumentBlockType): CmsDocumentBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "", level: 2 };
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "list":
      return { type: "list", items: [{ text: "" }], ordered: false };
    case "cards":
      return { type: "cards", cols: 3, items: [{ title: "", text: "" }] };
    case "note":
      return { type: "note", text: "" };
    case "table":
      return { type: "table", head: ["", ""], rows: [] };
    case "steps":
      return { type: "steps", title: "", intro: "", items: [{ label: "", text: "" }] };
    case "banner":
      return { type: "banner", title: "", text: "" };
    case "quote":
      return { type: "quote", text: "" };
    case "image":
      return { type: "image", src: "", alt: "" };
    case "cta":
      return { type: "cta", label: "", href: "" };
    case "divider":
      return { type: "divider" };
    case "shippingTiers":
      return { type: "shippingTiers" };
  }
}

export function emptySection(): CmsSection {
  return { blocks: [] };
}

/** Empty starter content for a brand-new page (matches the server contract). */
export function starterContent(pageType: "document" | "faq"): PageDoc["content"] {
  return pageType === "faq" ? { kind: "faq", entries: [] } : { kind: "document", sections: [{ blocks: [] }] };
}

/**
 * Defensively normalise whatever the API returned into an editable shape —
 * a page whose stored kind disagrees with its pageType still edits safely.
 */
export function normalizeContent(page: PageDoc): PageDoc["content"] {
  const c = page.content;
  if (page.pageType === "faq") {
    return { kind: "faq", intro: c.kind === "faq" ? (c.intro ?? "") : "", entries: c.kind === "faq" ? c.entries : [] };
  }
  return {
    kind: "document",
    lede: c.kind === "document" ? (c.lede ?? "") : "",
    sections: c.kind === "document" && c.sections.length > 0 ? c.sections : [{ blocks: [] }],
  };
}
