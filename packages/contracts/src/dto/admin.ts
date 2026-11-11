/** Zod DTO schemas for admin/business endpoints. All enforce server-side validation. */
import { z } from "zod";
import { paiseSchema } from "@annaadhya/utils";
import { ADMIN_ROLES, EXPENSE_PAYMENT_METHODS, EXPENSE_STATUSES, INVENTORY_MOVEMENT_TYPES, PAYMENT_PROVIDERS, PURCHASE_PAYMENT_METHODS, type PurchaseStatus } from "../enums";

const idSchema = z.string().trim().min(1).max(128);
const skuSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9\-_.]{2,40}$/, "SKU must be 3-41 chars: A-Z, 0-9, dashes");

/* ------------------------------------ Products ---------------------------------- */

/** Absolute https(s) URLs (self-hosted media or any external host) and site-rooted paths
 *  (/demo-images/…) are both real, supported image references — the demo catalogue ships
 *  with the latter. */
const imageUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine(
    (v) => /^https?:\/\/.+/i.test(v) || v.startsWith("/"),
    "Image URL must be absolute (https://…) or a site-rooted path (/demo-images/…)",
  );

export const productImageSchema = z.object({
  url: imageUrlSchema,
  /** Server-side storage key for self-hosted media (path under the media root). */
  storagePath: z.string().max(300).optional(),
  alt: z.string().trim().max(160).default(""),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

export const variantUpsertSchema = z.object({
  id: idSchema.optional(),
  sku: skuSchema,
  packLabel: z.string().trim().min(1).max(40),
  grams: z.number().positive().max(1_000_000),
  pricePaise: paiseSchema.refine((v) => v > 0, "Selling price must be greater than zero"),
  mrpPaise: paiseSchema.optional(),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  stockOnHand: z.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(100_000).default(5),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type VariantUpsertDto = z.infer<typeof variantUpsertSchema>;

export const productUpsertSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(180).default(""),
  // Description may be plain text or rich-text HTML — the API sanitises HTML on write
  // (see sanitizeRichText in @annaadhya/utils). HTML markup inflates length, so the cap is generous.
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(20000),
  categoryId: idSchema,
  typeLabel: z.string().trim().max(120).default(""),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  images: z.array(productImageSchema).max(10).default([]),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and dashes")
    .min(3, "Slug must be at least 3 characters")
    .max(96)
    .optional(),
  origin: z.string().trim().max(200).optional(),
  shelfLife: z.string().trim().max(80).optional(),
  specs: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().max(200),
      }),
    )
    .max(12)
    .optional(),
  ingredients: z.string().trim().max(2000).optional(),
  netQuantityLabel: z.string().trim().max(80).optional(),
  storageInstructions: z.string().trim().max(1000).optional(),
  allergenInfo: z.string().trim().max(500).optional(),
  manufacturerDetails: z.string().trim().max(500).optional(),
  fssaiLicense: z.string().trim().max(80).optional(),
  bestsellerRank: z.number().int().min(1).max(1000).optional(),
  featuredRank: z.number().int().min(1).max(1000).optional(),
  giftItem: z.boolean().default(false),
  // Storefront controls — optional (not defaulted) so callers that omit them never reset
  // an existing doc; the service falls back to the stored value, then to the documented default.
  searchVisible: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  backorderPolicy: z.enum(["deny", "allow", "notify"]).optional(),
  seo: z
    .object({
      title: z.string().trim().max(180).optional(),
      description: z.string().trim().max(320).optional(),
    })
    .default({}),
  variants: z.array(variantUpsertSchema).max(20).default([]),
});
export type ProductUpsertDto = z.infer<typeof productUpsertSchema>;

export const categoryUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
    .max(96),
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(180).default(""),
  description: z.string().trim().max(4000).default(""),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isReady: z.boolean().default(false),
  heroImage: z.string().url().max(600).optional(),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  seo: z
    .object({
      title: z.string().trim().max(180).optional(),
      description: z.string().trim().max(300).optional(),
    })
    .optional(),
});
export type CategoryUpsertDto = z.infer<typeof categoryUpsertSchema>;

/* ------------------------------------ Inventory ---------------------------------- */

export const stockMovementSchema = z.object({
  variantId: idSchema,
  type: z.enum(INVENTORY_MOVEMENT_TYPES),
  qty: z
    .number()
    .int()
    .refine((v) => v !== 0, "Quantity cannot be zero")
    .refine((v) => Math.abs(v) <= 1_000_000, "Quantity out of range"),
  reason: z.string().trim().min(3, "A reason is required for every stock movement").max(300),
  referenceType: z.string().trim().max(40).optional(),
  referenceId: z.string().trim().max(128).optional(),
});
export type StockMovementDto = z.infer<typeof stockMovementSchema>;

export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(100000).optional(),
});
export type LowStockQueryDto = z.infer<typeof lowStockQuerySchema>;

/** Inventory console query: search + category + stock status + sort + pagination. */
export const INVENTORY_STOCK_STATUS_FILTERS = ["all", "in_stock", "low_stock", "out_of_stock"] as const;
export const INVENTORY_SORT_OPTIONS = ["name_asc", "stock_asc", "stock_desc", "recently_updated"] as const;

export const inventoryLedgerQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: idSchema.optional(),
  stockStatus: z.enum(INVENTORY_STOCK_STATUS_FILTERS).default("all"),
  sort: z.enum(INVENTORY_SORT_OPTIONS).default("name_asc"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type InventoryLedgerQueryDto = z.infer<typeof inventoryLedgerQuerySchema>;

/**
 * Guided stock adjustment (the inventory console drawer).
 * Modes: add (+qty), remove (−qty), set (qty becomes the new stock-on-hand total).
 * Movement type is restricted per mode so the ledger keeps honest semantics —
 * order-lifecycle types (sold/reserved/released) can never be faked from here.
 */
export const STOCK_ADJUSTMENT_MODES = ["add", "remove", "set"] as const;
export const STOCK_ADJUSTMENT_TYPES = ["received", "returned", "damaged", "manual_adjustment", "other"] as const;

export const stockAdjustmentSchema = z
  .object({
    variantId: idSchema,
    mode: z.enum(STOCK_ADJUSTMENT_MODES),
    qty: z.coerce.number().int().min(0).max(1_000_000),
    type: z.enum(STOCK_ADJUSTMENT_TYPES),
    reason: z.string().trim().min(3, "A reason is required for every stock adjustment").max(300),
    note: z.string().trim().max(300).optional(),
    reference: z.string().trim().max(128).optional(),
  })
  .refine((v) => v.mode === "set" || v.qty >= 1, {
    message: "Quantity must be a positive whole number for add/remove adjustments",
    path: ["qty"],
  });
export type StockAdjustmentDto = z.infer<typeof stockAdjustmentSchema>;

/** Bulk low-stock-threshold update for the inventory console's bulk bar. */
export const inventoryThresholdsSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: idSchema,
        lowStockThreshold: z.number().int().min(0).max(100_000),
      }),
    )
    .min(1)
    .max(200),
});
export type InventoryThresholdsDto = z.infer<typeof inventoryThresholdsSchema>;

/* ------------------------------------ Suppliers ---------------------------------- */

export const SUPPLIER_TYPES = [
  "farmer_apiarist",
  "estate_producer",
  "wholesaler_coop",
  "packaging_artisan",
  "other",
] as const;
export const SUPPLIER_SORTS = ["recently_added", "name_asc", "recent_purchase", "value_desc"] as const;
export const SUPPLIER_STATUS_FILTERS = ["all", "active", "inactive"] as const;

/** One negotiated procurement-rate line (PURCHASE cost — never a selling price). */
export const supplierRateSchema = z.object({
  id: z.string().trim().max(64).optional(),
  label: z.string().trim().min(2, "Rate label must be at least 2 characters").max(160),
  productSku: skuSchema.optional(),
  variantSku: skuSchema.optional(),
  unitCostPaise: paiseSchema,
  unit: z.string().trim().min(1).max(24),
  moqQty: z.coerce.number().min(0).max(10_000_000).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type SupplierRateDto = z.infer<typeof supplierRateSchema>;

/**
 * Supplier create/update. All new fields are additive + defaulted so legacy clients
 * (the purchases page still posts the old shape) keep working unchanged.
 */
export const supplierUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(SUPPLIER_TYPES).default("other"),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional(),
  village: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "PIN code must be exactly 6 digits")
    .optional()
    .or(z.literal("")),
  addressLines: z.string().trim().max(400).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  paymentTerms: z.string().trim().max(300).optional(),
  licenseNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  productSkus: z.array(skuSchema).max(200).default([]),
  rates: z.array(supplierRateSchema).max(50).default([]),
});
export type SupplierUpsertDto = z.infer<typeof supplierUpsertSchema>;

/** Suppliers console listing: search + type/category/status filters + sort + pagination. */
export const supplierLedgerQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(SUPPLIER_TYPES).optional(),
  categoryId: idSchema.optional(),
  status: z.enum(SUPPLIER_STATUS_FILTERS).default("all"),
  sort: z.enum(SUPPLIER_SORTS).default("recently_added"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type SupplierLedgerQueryDto = z.infer<typeof supplierLedgerQuerySchema>;

/** Status change (activate / seasonal pause). Never cascades into purchases. */
export const supplierStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});
export type SupplierStatusDto = z.infer<typeof supplierStatusSchema>;

/** Purchase line input. Money/quantities are validated; totals are recomputed server-side. */
export const purchaseItemInputSchema = z.object({
  variantSku: skuSchema,
  description: z.string().trim().max(200).default(""),
  qtyOrdered: z.number().int().min(1).max(1_000_000),
  unitCostPaise: paiseSchema,
  unit: z.string().trim().min(1).max(24).default("unit"),
  discountPaise: paiseSchema.default(0),
  taxPercent: z.coerce.number().min(0).max(50).default(0),
});
export type PurchaseItemInputDto = z.infer<typeof purchaseItemInputSchema>;

const optionalDateMillis = z.coerce.number().int().positive().max(4_102_444_800_000).optional(); // ≤ 2100-01-01

/**
 * Purchase create / draft-update. The HTTP path only accepts draft|ordered — receiving,
 * cancellation and payment settlement have their own dedicated endpoints, so a client can
 * never declare a purchase received/paid by writing its status directly.
 */
export const purchaseUpsertSchema = z
  .object({
    supplierId: idSchema,
    reference: z.string().trim().min(2).max(60).optional(),
    status: z.enum(["draft", "ordered"]).default("draft"),
    notes: z.string().trim().max(2000).optional(),
    internalNotes: z.string().trim().max(2000).optional(),
    purchaseDate: optionalDateMillis,
    expectedDeliveryDate: optionalDateMillis.nullable(),
    supplierInvoiceNumber: z.string().trim().max(80).optional(),
    supplierInvoiceDate: optionalDateMillis.nullable(),
    items: z.array(purchaseItemInputSchema).min(1).max(200),
  })
  .refine((v) => !v.expectedDeliveryDate || !v.purchaseDate || v.expectedDeliveryDate >= v.purchaseDate, {
    message: "Expected delivery cannot be before the purchase date",
    path: ["expectedDeliveryDate"],
  });
export type PurchaseUpsertDto = z.infer<typeof purchaseUpsertSchema>;

/**
 * Service-level purchase input. HTTP clients go through purchaseUpsertSchema (which only
 * accepts draft|ordered and strips received counters); internal callers (seed, fixtures)
 * may write any valid status and pre-set qtyReceived on each line. `z.input` keeps the
 * schema-defaulted fields optional here — the service applies the same defaults.
 */
export interface PurchaseUpsertInput extends Omit<z.input<typeof purchaseUpsertSchema>, "status" | "items"> {
  status?: PurchaseStatus;
  items: (z.input<typeof purchaseItemInputSchema> & { qtyReceived?: number })[];
}

/** Purchases console listing: search + supplier/status/payment/date filters + sort + pagination. */
export const PURCHASE_SORTS = ["recent_first", "oldest_first", "value_desc"] as const;
export const PURCHASE_STATUS_FILTERS = ["all", "draft", "ordered", "partially_received", "received", "cancelled"] as const;
export const PURCHASE_PAYMENT_STATUS_FILTERS = ["all", "unpaid", "partially_paid", "paid"] as const;

export const purchaseLedgerQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  supplierId: idSchema.optional(),
  status: z.enum(PURCHASE_STATUS_FILTERS).default("all"),
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUS_FILTERS).default("all"),
  dateFrom: z.coerce.number().int().positive().optional(),
  dateTo: z.coerce.number().int().positive().optional(),
  sort: z.enum(PURCHASE_SORTS).default("recent_first"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
});
export type PurchaseLedgerQueryDto = z.infer<typeof purchaseLedgerQuerySchema>;

/**
 * Goods receipt. `receiptId` is the idempotency key: the client generates it once per
 * receiving session and the server persists it with the receipt — a retry, double-click
 * or replayed request returns the unchanged purchase instead of re-applying stock.
 */
export const purchaseReceiveSchema = z.object({
  receiptId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9\-_]+$/, "Receipt id must be alphanumeric"),
  receipts: z
    .array(
      z.object({
        variantSku: skuSchema,
        qty: z.number().int().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(200),
  note: z.string().trim().max(500).optional(),
});
export type PurchaseReceiveDto = z.infer<typeof purchaseReceiveSchema>;

/** Recorded supplier payment (real ledger entry; never auto-derived from receiving). */
export const purchasePaymentSchema = z.object({
  amountPaise: paiseSchema.refine((v) => v > 0, "Payment amount must be positive"),
  method: z.enum(PURCHASE_PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  paidAt: optionalDateMillis,
  note: z.string().trim().max(300).optional(),
});
export type PurchasePaymentDto = z.infer<typeof purchasePaymentSchema>;

/** Cancellation reason (optional; when supplied it needs at least 3 characters). */
export const purchaseCancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v.length === 0 || v.length >= 3, "A cancellation reason needs at least 3 characters")
    .optional(),
});
export type PurchaseCancelDto = z.infer<typeof purchaseCancelSchema>;

/* ------------------------------------ Orders ---------------------------------- */

export const ORDER_STATUS_VALUES = [
  "pending_payment",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  reason: z.string().trim().max(300).optional(),
  tracking: z
    .object({
      carrier: z.string().trim().min(1).max(80),
      trackingNumber: z.string().trim().min(3).max(80),
    })
    .optional(),
});
export type OrderStatusUpdateDto = z.infer<typeof orderStatusUpdateSchema>;

export const orderRefundSchema = z.object({
  amountPaise: paiseSchema.refine((v) => v > 0, "Refund amount must be positive"),
  reason: z.string().trim().min(3).max(300),
});
export type OrderRefundDto = z.infer<typeof orderRefundSchema>;

/** Admin correction of shipment tracking after the shipped transition (typo'd AWB, rebooked courier). */
export const orderTrackingUpdateSchema = z.object({
  carrier: z.string().trim().min(1).max(80),
  trackingNumber: z.string().trim().min(3).max(80),
});
export type OrderTrackingUpdateDto = z.infer<typeof orderTrackingUpdateSchema>;

/** Internal staff note (never customer-visible). Stored with author identity; audited on create. */
export const orderNoteCreateSchema = z.object({
  note: z.string().trim().min(2, "A note needs at least 2 characters").max(2000),
});
export type OrderNoteCreateDto = z.infer<typeof orderNoteCreateSchema>;

export const orderListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  paymentStatus: z.enum(["created", "pending", "succeeded", "failed", "cancelled", "refunded"]).optional(),
  paymentProvider: z.enum(PAYMENT_PROVIDERS).optional(),
  // "true" → only gift orders, "false" → only non-gift orders; absent → no gift filtering.
  gift: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQueryDto = z.infer<typeof orderListQuerySchema>;

/* ------------------------------------ Expenses ---------------------------------- */

/**
 * Expense write DTO. The settlement model is validated as a whole, server-side:
 *  - paid      → the full amount is settled (amountPaidPaise is normalized to amountPaise);
 *  - pending   → nothing settled yet (amountPaidPaise is normalized to 0);
 *  - partially_paid → amountPaidPaise must be strictly between 0 and the total,
 *    so a "partially paid" record can never hide a fully- or un-paid balance.
 * amountPaidPaise may never exceed amountPaise for any status.
 */
export const expenseUpsertSchema = z
  .object({
    date: z.coerce.number().int().positive(),
    category: z.string().trim().min(2, "Category is required").max(60),
    amountPaise: paiseSchema.refine((v) => v > 0, "Expense amount must be positive"),
    description: z.string().trim().min(2).max(500),
    payee: z.string().trim().max(120).optional(),
    reference: z.string().trim().max(120).optional(),
    attachmentUrl: z.string().url().max(600).optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(EXPENSE_STATUSES).default("paid"),
    amountPaidPaise: paiseSchema.optional(),
    paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
  })
  .superRefine((dto, ctx) => {
    const paid = dto.amountPaidPaise ?? 0;
    if (dto.status === "paid" && dto.amountPaidPaise !== undefined && paid !== dto.amountPaise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountPaidPaise"],
        message: "A paid expense must have the paid amount equal to the total amount",
      });
    }
    if (dto.status === "partially_paid") {
      if (paid <= 0 || paid >= dto.amountPaise) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amountPaidPaise"],
          message: "A partially paid expense needs a paid amount strictly between ₹0 and the total",
        });
      }
    }
    if (dto.status === "pending" && dto.amountPaidPaise !== undefined && paid !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountPaidPaise"],
        message: "A pending expense cannot have a paid amount yet",
      });
    }
  });
export type ExpenseUpsertDto = z.infer<typeof expenseUpsertSchema>;

/** Ledger query: date range + category/status/method/search filters + pagination.
 *  Search matches description, vendor/payee and reference number. */
export const expenseListQuerySchema = z.object({
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  method: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type ExpenseListQueryDto = z.infer<typeof expenseListQuerySchema>;

/* -------------------------------------- Team ------------------------------------ */

export const teamInviteSchema = z.object({
  uid: z.string().trim().min(6).max(128),
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: z.enum(ADMIN_ROLES),
});
export type TeamInviteDto = z.infer<typeof teamInviteSchema>;

export const teamRoleUpdateSchema = z.object({
  role: z.enum(ADMIN_ROLES),
});
export type TeamRoleUpdateDto = z.infer<typeof teamRoleUpdateSchema>;

export const teamStatusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type TeamStatusUpdateDto = z.infer<typeof teamStatusUpdateSchema>;

export const bootstrapOwnerSchema = z.object({
  uid: z.string().trim().min(6).max(128),
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  setupKey: z.string().trim().min(8).max(200),
});
export type BootstrapOwnerDto = z.infer<typeof bootstrapOwnerSchema>;

/* ------------------------------------ Settings ---------------------------------- */

export const settingsUpdateSchema = z.object({
  store: z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      legalName: z.string().trim().max(160).optional(),
      supportEmail: z.string().trim().email().optional().or(z.literal("")),
      supportPhone: z.string().trim().max(20).optional(),
      addressLines: z.array(z.string().trim().max(160)).max(5).optional(),
      gstin: z.string().trim().max(24).optional(),
      fssaiLicense: z.string().trim().max(80).optional(),
      socialLinks: z
        .object({
          instagram: z.string().trim().max(200).optional(),
          facebook: z.string().trim().max(200).optional(),
          whatsapp: z.string().trim().max(200).optional(),
        })
        .optional(),
      announcement: z
        .object({
          enabled: z.boolean().optional(),
          message: z.string().trim().max(160).optional(),
          href: z.string().trim().max(200).optional(),
          tagline: z.string().trim().max(120).optional(),
        })
        .optional(),
    })
    .optional(),
  shipping: z
    .object({
      mode: z.enum(["flat_rate", "free_shipping", "disabled"]).optional(),
      flatRatePaise: paiseSchema.optional(),
      freeAbovePaise: paiseSchema.nullable().optional(),
      deliveryEstimateDays: z.array(z.number().int().min(0).max(60)).length(2).nullable().optional(),
      serviceablePincodesNote: z.string().trim().max(240).optional(),
    })
    .optional(),
  payments: z
    .object({
      provider: z.enum(["mock", "razorpay"]).optional(),
      sandboxMode: z.boolean().optional(),
      codEnabled: z.boolean().optional(),
      upiNote: z.string().trim().max(160).optional(),
    })
    .optional(),
  reporting: z
    .object({
      includeDemoDataByDefault: z.boolean().optional(),
    })
    .optional(),
  storefront: z
    .object({
      heroHeadline: z.string().trim().max(120).optional(),
      heroHeadlineAccent: z.string().trim().max(120).optional(),
      heroSubcopy: z.string().trim().max(240).optional(),
      heroImage: z.string().trim().max(600).optional(),
      heroCtaHref: z.string().trim().max(200).optional(),
      heroCtaLabel: z.string().trim().max(40).optional(),
      newsletterEnabled: z.boolean().optional(),
      giftCollectionEnabled: z.boolean().optional(),
    })
    .optional(),
});
export type SettingsUpdateDto = z.infer<typeof settingsUpdateSchema>;

/* ------------------------------------- Media ------------------------------------ */

/** Multipart upload target folder. Text field accompanying the file in the form. */
export const mediaUploadSchema = z.object({
  folder: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9\-_/]{1,80}$/, "Folder must be a simple path segment")
    .default("annaadhya/products"),
});
export type MediaUploadDto = z.infer<typeof mediaUploadSchema>;

/* --------------------------------- Customers directory -------------------------------- */

/** Query surface for GET /admin/customers — the admin customer directory. */
export const customerListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  activity: z.enum(["all", "with_orders", "no_orders", "repeat"]).default("all"),
  status: z.enum(["all", "active", "suspended"]).default("all"),
  /** Registration window (epoch millis, inclusive bounds). */
  registeredFrom: z.coerce.number().int().positive().optional(),
  registeredTo: z.coerce.number().int().positive().optional(),
  sort: z.enum(["spend_desc", "orders_desc", "recent_order", "recent_registered", "name_asc"]).default("spend_desc"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CustomerListQueryDto = z.infer<typeof customerListQuerySchema>;

/** Internal support notes on a customer profile — empty string clears the note. */
export const customerNoteUpdateSchema = z.object({
  note: z.string().trim().max(2000),
});
export type CustomerNoteUpdateDto = z.infer<typeof customerNoteUpdateSchema>;

/* --------------------------------------- CMS ------------------------------------ */

/** CMS inline markup text: **bold**, *italic*, [label](href) — rendered as React
 *  elements by the storefront. Raw HTML is never accepted or stored. */
const cmsText = (max: number) => z.string().trim().max(max);

const cmsHrefSchema = z
  .string()
  .trim()
  .max(600)
  .refine(
    (v) => v.startsWith("/") || /^https?:\/\/.+/i.test(v),
    "Destination must be a site path (/…) or an absolute http(s) URL",
  );

const cmsImageUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine(
    (v) => /^https?:\/\/.+/i.test(v) || v.startsWith("/"),
    "Image URL must be absolute (https://…) or a site-rooted path (/…)",
  );

export const cmsBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    text: cmsText(500),
    level: z.union([z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({ type: z.literal("paragraph"), text: cmsText(8000) }),
  z.object({
    type: z.literal("list"),
    items: z
      .array(
        z.object({
          title: cmsText(200).optional(),
          text: cmsText(2000),
        }),
      )
      .min(1)
      .max(40),
    ordered: z.boolean().optional(),
    icon: z.enum(["check", "plain"]).optional(),
  }),
  z.object({
    type: z.literal("cards"),
    cols: z.union([z.literal(2), z.literal(3)]).optional(),
    items: z
      .array(
        z.object({
          icon: cmsText(40).optional(),
          title: cmsText(200),
          text: cmsText(1200),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("note"),
    title: cmsText(200).optional(),
    text: cmsText(2000),
  }),
  z.object({
    type: z.literal("table"),
    head: z.array(cmsText(120)).min(1).max(8),
    rows: z.array(z.array(cmsText(400)).max(8)).max(60),
    footnote: cmsText(400).optional(),
  }),
  z.object({
    type: z.literal("steps"),
    title: cmsText(200),
    intro: cmsText(1000),
    items: z
      .array(z.object({ label: cmsText(160), text: cmsText(1200) }))
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("banner"),
    title: cmsText(200),
    text: cmsText(1200),
  }),
  z.object({
    type: z.literal("quote"),
    text: cmsText(1200),
    attribution: cmsText(160).optional(),
  }),
  z.object({
    type: z.literal("image"),
    src: cmsImageUrlSchema,
    alt: cmsText(500),
    caption: cmsText(500).optional(),
  }),
  z.object({
    type: z.literal("cta"),
    label: cmsText(80),
    href: cmsHrefSchema,
    note: cmsText(200).optional(),
  }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("shippingTiers") }),
]);
export type CmsBlockDto = z.infer<typeof cmsBlockSchema>;

export const cmsSectionSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Section id must be lowercase-with-dashes")
    .max(96)
    .optional(),
  eyebrow: cmsText(120).optional(),
  title: cmsText(200).optional(),
  toc: cmsText(80).optional(),
  blocks: z.array(cmsBlockSchema).max(120).default([]),
});
export type CmsSectionDto = z.infer<typeof cmsSectionSchema>;

export const cmsFaqEntrySchema = z.object({
  category: cmsText(60),
  question: cmsText(300),
  answer: cmsText(4000),
});
export type CmsFaqEntryDto = z.infer<typeof cmsFaqEntrySchema>;

export const pageContentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("document"),
    lede: cmsText(600).optional(),
    sections: z.array(cmsSectionSchema).max(30).default([]),
  }),
  z.object({
    kind: z.literal("faq"),
    intro: cmsText(600).optional(),
    entries: z.array(cmsFaqEntrySchema).max(120).default([]),
  }),
]);
export type PageContentDto = z.infer<typeof pageContentSchema>;

/** Create/update a CMS page. Drafts may be saved empty; publishing is validated
 *  server-side. `builtIn` is never accepted from the client. */
export const pageUpsertSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
    .max(96),
  title: z.string().trim().min(2).max(160),
  pageType: z.enum(["document", "faq"]).default("document"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  content: pageContentSchema,
  seo: z
    .object({
      title: cmsText(180).optional(),
      description: cmsText(300).optional(),
      socialImage: cmsImageUrlSchema.optional(),
    })
    .optional(),
});
export type PageUpsertDto = z.infer<typeof pageUpsertSchema>;

export const pageStatusUpdateSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});
export type PageStatusUpdateDto = z.infer<typeof pageStatusUpdateSchema>;

export const navigationItemUpsertSchema = z
  .object({
    location: z.enum(["header", "footer-care", "footer-legal"]),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["home", "shop", "category", "page", "href"]),
    categorySlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
      .max(96)
      .optional(),
    pageSlug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
      .max(96)
      .optional(),
    href: cmsHrefSchema.optional(),
    sortOrder: z.number().int().min(0).max(999).default(0),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "category" && !v.categorySlug) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categorySlug"], message: "Choose a category" });
    }
    if (v.kind === "page" && !v.pageSlug) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pageSlug"], message: "Choose a page" });
    }
    if (v.kind === "href" && !v.href) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["href"], message: "Enter a destination path or URL" });
    }
  });
export type NavigationItemUpsertDto = z.infer<typeof navigationItemUpsertSchema>;

export const homepageUpdateSchema = z.object({
  collections: z
    .object({
      enabled: z.boolean().optional(),
      heading: cmsText(120).optional(),
      items: z
        .array(
          z.object({
            categorySlug: z
              .string()
              .trim()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
              .max(96),
            eyebrow: cmsText(120).optional(),
            title: cmsText(120).optional(),
            description: cmsText(400).optional(),
            image: cmsImageUrlSchema.optional(),
          }),
        )
        .max(12)
        .optional(),
    })
    .optional(),
  trust: z
    .object({
      enabled: z.boolean().optional(),
      items: z
        .array(
          z.object({
            title: cmsText(120),
            description: cmsText(400),
          }),
        )
        .max(8)
        .optional(),
    })
    .optional(),
  story: z
    .object({
      enabled: z.boolean().optional(),
      eyebrow: cmsText(120).optional(),
      title: cmsText(200).optional(),
      quote: cmsText(600).optional(),
      text: cmsText(1200).optional(),
      image: cmsImageUrlSchema.optional(),
      ctaHref: cmsHrefSchema.optional(),
      ctaLabel: cmsText(80).optional(),
    })
    .optional(),
  gifting: z
    .object({
      enabled: z.boolean().optional(),
      eyebrow: cmsText(120).optional(),
      title: cmsText(200).optional(),
      copy: cmsText(800).optional(),
      image: cmsImageUrlSchema.optional(),
      ctaHref: cmsHrefSchema.optional(),
      ctaLabel: cmsText(80).optional(),
      productSlug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase-with-dashes")
        .max(96)
        .optional(),
    })
    .optional(),
});
export type HomepageUpdateDto = z.infer<typeof homepageUpdateSchema>;
