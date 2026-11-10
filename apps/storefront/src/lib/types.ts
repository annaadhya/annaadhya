/** Client-safe types mirroring @annaadhya/contracts domain shapes (keeps the client bundle lean). */

export interface CategoryDoc {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  isReady: boolean;
  heroImage?: string;
}

/** Response of GET /categories/overview — categories + sellable counts in one roundtrip. */
export interface CategoryOverview {
  categories: Array<CategoryDoc & { productCount: number }>;
  totalProducts: number;
}

export interface ProductImage {
  url: string;
  alt: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  packLabel: string;
  grams: number;
  pricePaise: number;
  mrpPaise?: number;
  status: "draft" | "published" | "archived";
  stockOnHand: number;
  reservedQty: number;
  lowStockThreshold: number;
  sortOrder?: number;
}

export interface ProductDoc {
  id: string;
  sku: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  categoryId: string;
  typeLabel: string;
  images: ProductImage[];
  ingredients?: string;
  netQuantityLabel?: string;
  storageInstructions?: string;
  allergenInfo?: string;
  manufacturerDetails?: string;
  bestsellerRank?: number;
  featuredRank?: number;
  giftItem: boolean;
  searchVisible?: boolean; // false = hidden from storefront search results
  trackInventory?: boolean; // false = sold without stock limits
  backorderPolicy?: "deny" | "allow" | "notify"; // behaviour when tracked stock runs out
  seo?: { title?: string; description?: string };
}

export type ProductWithVariantsShape = ProductDoc & { variants: ProductVariant[] };

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CheckoutQuote {
  quoteId: string;
  items: { variantId: string; qty: number; unitPricePaise: number; lineTotalPaise: number; backorderedQty?: number }[];
  subtotalPaise: number;
  discountTotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  unavailable: { variantId: string; reason: string }[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  items: { name: string; variantLabel: string; qty: number; lineTotalPaise: number; image?: string }[];
  createdAt: number;
  shippingAddress?: { fullName: string; line1: string; city: string; pincode: string };
  customerPaymentPayload?: Record<string, unknown>;
}

export interface CustomerDoc {
  id: string;
  uid: string;
  displayName: string;
  email?: string;
  phone?: string;
  /** Real sign-in providers recorded by the API (google / password). Phone OTP is
   *  not offered on any storefront surface — this only mirrors the stored record. */
  providers?: string[];
  marketingOptIn?: boolean;
  /** Epoch millis — data-core stamps these on every stored doc. */
  createdAt?: number;
  updatedAt?: number;
  defaultAddressId?: string;
  addresses: {
    id: string;
    label: string;
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    /** Canonical destination country. Absent only on entries written before
     *  India-only delivery was enforced — treated as "India" everywhere. */
    country?: string;
    isDefault: boolean;
  }[];
}

export interface Principal {
  uid: string;
  email?: string;
  displayName?: string;
  /** Profile photo from the verified identity provider (Google account picture). */
  photoUrl?: string;
  role: string;
  isStaff: boolean;
}

/** Whitelisted public projection of the global settings (GET /settings/public) —
 *  mirrors PublicStoreSettings from @annaadhya/contracts. Never contains GSTIN,
 *  licences or payment internals. */
export interface PublicStoreSettings {
  store: {
    name: string;
    supportEmail: string;
    supportPhone: string;
    addressLines: string[];
    socialLinks: { instagram?: string; facebook?: string; whatsapp?: string };
    announcement: { enabled: boolean; message: string; href?: string };
  };
  storefront: {
    newsletterEnabled: boolean;
    giftCollectionEnabled: boolean;
    /** Owner-controlled hero copy. Empty string = the storefront renders its
     *  approved design default (mirrors PublicStoreSettings from contracts). */
    heroHeadline: string;
    heroHeadlineAccent: string;
    heroSubcopy: string;
    heroImage?: string;
    heroCtaHref: string;
    heroCtaLabel?: string;
  };
  shipping: {
    mode: "flat_rate" | "free_shipping" | "disabled";
    flatRatePaise: number;
    freeAbovePaise: number | null;
  };
}

/* --------------------------------------- CMS ------------------------------------ */

/** Mirrors CmsDocumentBlock from @annaadhya/contracts. CMS text is structured
 *  data — the storefront renders it as React elements (never raw HTML). */
export type CmsDocumentBlock =
  | { type: "heading"; text: string; level?: 2 | 3 }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: { title?: string; text: string }[]; ordered?: boolean; icon?: "check" | "plain" }
  | { type: "cards"; cols?: 2 | 3; items: { icon?: string; title: string; text: string }[] }
  | { type: "note"; title?: string; text: string }
  | { type: "table"; head: string[]; rows: string[][]; footnote?: string }
  | { type: "steps"; title: string; intro: string; items: { label: string; text: string }[] }
  | { type: "banner"; title: string; text: string }
  | { type: "quote"; text: string; attribution?: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "cta"; label: string; href: string; note?: string }
  | { type: "divider" }
  | { type: "shippingTiers" };

export interface CmsSection {
  id?: string;
  eyebrow?: string;
  title?: string;
  toc?: string;
  blocks: CmsDocumentBlock[];
}

export type PageContent =
  | { kind: "document"; lede?: string; sections: CmsSection[] }
  | { kind: "faq"; intro?: string; entries: { category: string; question: string; answer: string }[] };

/** Response of GET /pages/:slug — published pages only. */
export interface PublicPageDoc {
  slug: string;
  title: string;
  builtIn: boolean;
  pageType: "document" | "faq";
  status: "draft" | "published" | "archived";
  updatedAt: number;
  content: PageContent;
  seo?: { title?: string; description?: string; socialImage?: string };
  /** True once an admin saved published content over the shipped default —
   *  bespoke built-in pages (Our Story) render the CMS document only then. */
  adminEdited?: boolean;
}

export interface PublicNavigationItem {
  label: string;
  href: string;
  location: "header" | "footer-care" | "footer-legal";
  sortOrder: number;
}

/** Response of GET /homepage — section overrides; empty = approved default. */
export interface HomepageDoc {
  collections: {
    enabled: boolean;
    heading?: string;
    items: { categorySlug: string; eyebrow?: string; title?: string; description?: string; image?: string }[];
  };
  trust: { enabled: boolean; items: { title: string; description: string }[] };
  story: {
    enabled: boolean;
    eyebrow?: string;
    title?: string;
    quote?: string;
    text?: string;
    image?: string;
    ctaHref?: string;
    ctaLabel?: string;
  };
  gifting: {
    enabled: boolean;
    eyebrow?: string;
    title?: string;
    copy?: string;
    image?: string;
    ctaHref?: string;
    ctaLabel?: string;
    productSlug?: string;
  };
}
