/**
 * Local mirrors of the shared contracts (packages/contracts/src) that the admin panel consumes.
 * Kept local on purpose: the admin is a self-contained browser app and must not drag the
 * workspace packages into the client bundle. Shapes mirror contracts exactly:
 * every monetary value is integer paise, epochs are millis.
 */

/* ---------------------------------- enums ---------------------------------- */

export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Mirrors contracts ORDER_TRANSITIONS — also fetched live from GET /admin/orders/state-machine. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled", "refunded"],
  processing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const PAYMENT_STATUSES = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["mock", "razorpay", "cod"] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  "received",
  "sold",
  "damaged",
  "manual_adjustment",
  "returned",
  "reserved",
  "released",
  "other",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const ADMIN_ROLES = ["owner", "manager", "inventory", "orders_support", "reports"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AccountStatus = "active" | "suspended";
export type ProductStatus = "draft" | "published" | "archived";
export type PurchaseStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";
export type RefundStatus = "none" | "initiated" | "completed" | "failed";

/* --------------------------------- api ---------------------------------- */

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "gone"
  | "unprocessable"
  | "rate_limited"
  | "internal"
  | "service_unconfigured";

export interface ApiErrorBody {
  ok: false;
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthPrincipal {
  uid: string;
  email?: string;
  phone?: string;
  displayName?: string;
  provider: string;
  role: AdminRole | "customer";
  permissions: string[];
  isStaff: boolean;
}

/* -------------------------------- domain -------------------------------- */

export interface BaseDoc {
  id: string;
  createdAt: number;
  updatedAt: number;
  isDemo: boolean;
  seedBatch?: string;
}

export interface CategoryDoc extends BaseDoc {
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

export interface ProductImage {
  url: string;
  /** Server-side storage key for self-hosted media (path under the API's media root). */
  storagePath?: string;
  alt: string;
  width?: number;
  height?: number;
}

/** Category-specific compliance/spec line (mirrors contracts ProductSpec). */
export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductDoc extends BaseDoc {
  sku: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  categoryId: string;
  typeLabel: string;
  status: ProductStatus;
  images: ProductImage[];
  origin?: string;
  shelfLife?: string;
  specs?: ProductSpec[];
  ingredients?: string;
  netQuantityLabel?: string;
  storageInstructions?: string;
  allergenInfo?: string;
  manufacturerDetails?: string;
  fssaiLicense?: string;
  bestsellerRank?: number;
  featuredRank?: number;
  giftItem: boolean;
  searchVisible?: boolean; // false = hidden from storefront search results
  trackInventory?: boolean; // false = sold without stock limits
  backorderPolicy?: "deny" | "allow" | "notify";
  seo: { title?: string; description?: string };
}

export interface ProductVariantDoc extends BaseDoc {
  productId: string;
  sku: string;
  packLabel: string;
  grams: number;
  pricePaise: number;
  mrpPaise?: number;
  status: ProductStatus;
  stockOnHand: number;
  reservedQty: number;
  lowStockThreshold: number;
  sortOrder?: number; // explicit display order (drag-reorder); missing → ordered by grams
}

export interface ProductWithVariants extends ProductDoc {
  variants: ProductVariantDoc[];
}

export interface CustomerAddress {
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
  isDefault: boolean;
}

export interface CustomerDoc extends BaseDoc {
  uid: string;
  displayName: string;
  email?: string;
  phone?: string;
  providers: string[];
  accountStatus: AccountStatus;
  defaultAddressId?: string;
  addresses: CustomerAddress[];
  notes?: string;
  marketingOptIn: boolean;
}

/* --------------------------- customers directory (admin) --------------------------- */

export type CustomerActivityFilter = "all" | "with_orders" | "no_orders" | "repeat";

export type CustomerDirectorySort =
  | "spend_desc"
  | "orders_desc"
  | "recent_order"
  | "recent_registered"
  | "name_asc";

/** Mirrors contracts CustomerDirectoryRow — customer record joined with real order metrics. */
export interface CustomerDirectoryRow extends CustomerDoc {
  orderCount: number;
  completedOrderCount: number;
  totalSpendPaise: number;
  lastOrderAt?: number;
  lastOrderId?: string;
  lastOrderNumber?: string;
}

export interface CustomerDirectorySummary {
  totalCustomers: number;
  newCustomers: number;
  newCustomersWindow: string;
  customersWithOrders: number;
  repeatCustomers: number;
  lifetimeSpendPaise: number;
  avgOrdersPerRepeat: number | null;
}

export interface CustomerDirectoryPage {
  items: CustomerDirectoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: CustomerDirectorySummary;
}

export interface OrderItemSnapshot {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  variantLabel: string;
  image?: string;
  unitPricePaise: number;
  mrpPaise?: number;
  qty: number;
  lineTotalPaise: number;
}

export interface OrderDoc extends BaseDoc {
  orderNumber: string;
  customerUid?: string;
  customerContact: { displayName: string; email: string; phone: string };
  shippingAddress: CustomerAddress;
  items: OrderItemSnapshot[];
  subtotalPaise: number;
  discountTotalPaise: number;
  shippingPaise: number;
  taxLabel?: string;
  taxPaise: number;
  totalPaise: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProviderName;
  refundStatus: RefundStatus;
  refundPaise: number;
  tracking?: { carrier: string; trackingNumber: string; updatedAt: number };
  cancelledReason?: string;
  isGiftOrder: boolean;
  /** Present only on gift orders; shippingAddress holds the recipient's delivery snapshot. */
  gift?: { recipientName: string; recipientPhone: string; message?: string };
}

/** Internal staff note (mirrors contracts OrderNoteDoc) — admin-visible only, never customer-facing. */
export interface OrderNoteDoc extends BaseDoc {
  orderId: string;
  orderNumber: string;
  note: string;
  authorUid: string;
  authorName: string;
  authorRole: AdminRole | "system";
}

/** Provider payment attempt (mirrors contracts PaymentAttemptDoc) — read-only display references. */
export interface PaymentAttemptDoc extends BaseDoc {
  orderId: string;
  orderNumber: string;
  provider: PaymentProviderName;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  amountPaise: number;
  attempts: number;
  lastError?: string;
  refundPaise: number;
  idempotencyKey?: string;
}

export interface InventoryMovementDoc extends BaseDoc {
  variantId: string;
  variantSku: string;
  type: InventoryMovementType;
  qtyDelta: number;
  reservedDelta: number;
  resultingStockOnHand: number;
  resultingReservedQty: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  performedByUid?: string;
  performedByName?: string;
}

export interface InventoryBalance {
  variantId: string;
  sku: string;
  packLabel: string;
  productId: string;
  stockOnHand: number;
  reservedQty: number;
  available: number;
  lowStockThreshold: number;
  status: ProductStatus;
}

export interface LowStockRow {
  variant: ProductVariantDoc;
  available: number;
}

/* ------------------------------ inventory console ------------------------------ */

export type InventoryStockStatus = "in_stock" | "low_stock" | "out_of_stock";
export type StockStatusFilter = "all" | InventoryStockStatus;
export type InventorySort = "name_asc" | "stock_asc" | "stock_desc" | "recently_updated";
export type StockAdjustmentMode = "add" | "remove" | "set";
/** Ledger types allowed for guided adjustments — order-lifecycle types stay server-owned. */
export type StockAdjustmentType = "received" | "returned" | "damaged" | "manual_adjustment" | "other";

/** One inventory-console row: variant balance joined with product/category display data. */
export interface InventoryLedgerRow {
  variantId: string;
  sku: string;
  packLabel: string;
  productId: string;
  productName: string;
  productSlug?: string;
  productImage?: string;
  categoryName: string;
  variantStatus: ProductStatus;
  productStatus: ProductStatus;
  stockOnHand: number;
  reservedQty: number;
  available: number;
  lowStockThreshold: number;
  pricePaise: number;
  updatedAt: number;
  stockStatus: InventoryStockStatus;
  lastMovement: { at: number; byName?: string; type: InventoryMovementType } | null;
}

export interface InventoryLedgerSummary {
  totalVariants: number;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  totalStockOnHand: number;
  /** stock × selling price — presented as "retail value at selling price", never cost. */
  retailValuePaise: number;
}

export interface InventoryLedgerPage {
  items: InventoryLedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: InventoryLedgerSummary;
}

export interface StockAdjustmentPayload {
  variantId: string;
  mode: StockAdjustmentMode;
  qty: number;
  type: StockAdjustmentType;
  reason: string;
  note?: string;
  reference?: string;
}

export interface SupplierRate {
  id: string;
  /** What the supplier calls the item, e.g. "Raw Wild Forest Honey (Grade-A bulk)". */
  label: string;
  productSku?: string;
  variantSku?: string;
  /** Negotiated purchase cost per unit, integer paise — never a selling price. */
  unitCostPaise: number;
  unit: string;
  moqQty?: number;
  notes?: string;
}

export type SupplierType = "farmer_apiarist" | "estate_producer" | "wholesaler_coop" | "packaging_artisan" | "other";
export type SupplierStatus = "active" | "inactive";
export type SupplierSort = "recently_added" | "name_asc" | "recent_purchase" | "value_desc";
export type SupplierStatusFilter = "all" | "active" | "inactive";

export interface SupplierDoc extends BaseDoc {
  name: string;
  type?: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  village?: string;
  city?: string;
  state?: string;
  pincode?: string;
  addressLines?: string;
  status?: SupplierStatus;
  paymentTerms?: string;
  licenseNumber?: string;
  notes?: string;
  productSkus: string[];
  rates?: SupplierRate[];
}

export interface SupplierLedgerRow {
  id: string;
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  location?: string;
  status: SupplierStatus;
  village?: string;
  pincode?: string;
  paymentTerms?: string;
  licenseNumber?: string;
  notes?: string;
  productSkus: string[];
  rates: SupplierRate[];
  categoryNames: string[];
  createdAt: number;
  updatedAt: number;
  purchaseCount: number;
  lastPurchaseAt: number | null;
  lastPurchaseReference: string | null;
  lastPurchaseValuePaise: number | null;
  totalPurchaseValuePaise: number;
}

export interface SupplierLedgerSummary {
  totalSuppliers: number;
  activeSuppliers: number;
  inactiveSuppliers: number;
  categoryCount: number;
  addedThisMonth: number;
  withPurchases: number;
}

export interface SupplierLedgerPage {
  items: SupplierLedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: SupplierLedgerSummary;
}

export interface PurchaseItem {
  variantSku: string;
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCostPaise: number;
  unit?: string;
  discountPaise?: number;
  taxPercent?: number;
  lineTotalPaise?: number;
  productId?: string;
  productName?: string;
  variantPackLabel?: string;
}

export type PurchasePaymentStatus = "unpaid" | "partially_paid" | "paid";
export type PurchasePaymentMethod = "cash" | "bank_transfer" | "upi" | "cheque" | "other";

/** One persisted goods-receiving event (immutable; corrections are future receipts). */
export interface PurchaseReceiptDoc {
  id: string;
  receivedAt: number;
  receivedByUid: string;
  receivedByName?: string;
  lines: { variantSku: string; qty: number; unit?: string }[];
  note?: string;
  movementIds: string[];
}

/** One recorded supplier payment (real ledger entry — never inferred from receiving). */
export interface PurchasePaymentDoc {
  id: string;
  amountPaise: number;
  method: PurchasePaymentMethod;
  reference?: string;
  paidAt: number;
  recordedByUid: string;
  recordedByName?: string;
  note?: string;
}

export interface PurchaseDoc extends BaseDoc {
  supplierId: string;
  reference: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  notes?: string;
  createdByUid: string;
  purchaseDate?: number;
  expectedDeliveryDate?: number | null;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: number | null;
  internalNotes?: string;
  createdByName?: string;
  subTotalPaise?: number;
  discountTotalPaise?: number;
  taxTotalPaise?: number;
  totalPaise?: number;
  paidPaise?: number;
  paymentStatus?: PurchasePaymentStatus;
  payments?: PurchasePaymentDoc[];
  receipts?: PurchaseReceiptDoc[];
  confirmedAt?: number | null;
  cancelledAt?: number | null;
  cancelReason?: string;
}

export type PurchaseSort = "recent_first" | "oldest_first" | "value_desc";
export type PurchaseStatusFilter = "all" | PurchaseStatus;
export type PurchasePaymentStatusFilter = "all" | PurchasePaymentStatus;

export interface PurchaseLedgerRow {
  id: string;
  reference: string;
  status: PurchaseStatus;
  paymentStatus: PurchasePaymentStatus;
  supplierId: string;
  purchaseDate: number;
  expectedDeliveryDate: number | null;
  supplierInvoiceNumber?: string;
  supplierName: string;
  supplierLocation?: string;
  supplierStatus: SupplierStatus;
  itemCount: number;
  itemsPreview: string;
  orderedUnits: number;
  receivedUnits: number;
  unitLabel: string;
  subTotalPaise: number;
  discountTotalPaise: number;
  taxTotalPaise: number;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseLedgerSummary {
  totalPurchases: number;
  draftCount: number;
  orderedCount: number;
  partiallyReceivedCount: number;
  pendingDeliveries: number;
  goodsReceived: number;
  cancelledCount: number;
  spendPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  priority: {
    id: string;
    reference: string;
    supplierName: string;
    outstandingUnits: number;
    unitLabel: string;
    expectedDeliveryDate: number | null;
    partiallyReceived: boolean;
  } | null;
}

export interface PurchaseLedgerPage {
  items: PurchaseLedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: PurchaseLedgerSummary;
}

/** Payload shapes for the purchases console (mirrors the API zod schemas). */
export interface PurchaseLineInput {
  variantSku: string;
  description: string;
  qtyOrdered: number;
  unitCostPaise: number;
  unit: string;
  discountPaise: number;
  taxPercent: number;
}

export interface PurchaseUpsertPayload {
  supplierId: string;
  reference?: string;
  status: "draft" | "ordered";
  notes?: string;
  internalNotes?: string;
  purchaseDate?: number;
  expectedDeliveryDate?: number | null;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: number | null;
  items: PurchaseLineInput[];
}

export interface PurchaseReceivePayload {
  receiptId: string;
  receipts: { variantSku: string; qty: number }[];
  note?: string;
}

export interface PurchasePaymentPayload {
  amountPaise: number;
  method: PurchasePaymentMethod;
  reference?: string;
  paidAt?: number;
  note?: string;
}

export type ExpenseStatus = "paid" | "pending" | "partially_paid";
export type ExpensePaymentMethod = "cash" | "upi" | "bank_transfer" | "card" | "other";

export const EXPENSE_STATUSES: ExpenseStatus[] = ["paid", "pending", "partially_paid"];
export const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "cash",
  "upi",
  "bank_transfer",
  "card",
  "other",
];

export interface ExpenseDoc extends BaseDoc {
  date: number;
  category: string;
  amountPaise: number;
  description: string;
  payee?: string;
  reference?: string;
  attachmentUrl?: string;
  /** Normalized server-side: legacy rows without a status read as "paid". */
  status: ExpenseStatus;
  amountPaidPaise: number;
  paymentMethod?: ExpensePaymentMethod;
  notes?: string;
  createdByUid: string;
  createdByName?: string;
  updatedByUid?: string;
  updatedByName?: string;
}

/** Authoritative aggregates over the filtered ledger — computed by the API. */
export interface ExpenseSummary {
  totalPaise: number;
  paidPaise: number;
  pendingPaise: number;
  recordCount: number;
  paidCount: number;
  pendingCount: number;
  partiallyPaidCount: number;
}

export interface ExpenseTrendBucket {
  start: number;
  end: number;
  label: string;
  totalPaise: number;
  count: number;
}

export interface ExpenseCategorySlice {
  category: string;
  totalPaise: number;
  count: number;
  pct: number;
}

export interface ExpensePage {
  items: ExpenseDoc[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: ExpenseSummary;
  trend: ExpenseTrendBucket[];
  trendUnit: "day" | "week" | "month";
  categories: ExpenseCategorySlice[];
  categoryOptions: string[];
}

export interface AdminUserDoc extends BaseDoc {
  uid: string;
  displayName: string;
  email: string;
  role: AdminRole;
  status: AccountStatus;
  invitedByUid?: string;
  lastLoginAt?: number;
}

export interface AuditLogDoc extends BaseDoc {
  actorUid: string;
  actorName: string;
  actorRole: AdminRole | "customer" | "system";
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface SettingsDoc {
  id: "global";
  updatedAt: number;
  store: {
    name: string;
    legalName: string;
    supportEmail: string;
    supportPhone: string;
    addressLines: string[];
    gstin?: string;
    fssaiLicense?: string;
    socialLinks: { instagram?: string; facebook?: string; whatsapp?: string };
    announcement: { enabled: boolean; message: string; href?: string; tagline?: string };
  };
  shipping: {
    mode: "flat_rate" | "free_shipping" | "disabled";
    flatRatePaise: number;
    freeAbovePaise: number | null;
    deliveryEstimateDays: [number, number] | null;
    serviceablePincodesNote: string;
  };
  payments: {
    provider: PaymentProviderName;
    sandboxMode: boolean;
    codEnabled: boolean;
    upiNote?: string;
  };
  reporting: {
    includeDemoDataByDefault: boolean;
  };
  storefront: {
    heroHeadline: string;
    heroHeadlineAccent: string;
    heroSubcopy: string;
    heroImage?: string;
    heroCtaHref: string;
    heroCtaLabel?: string;
    newsletterEnabled: boolean;
    giftCollectionEnabled: boolean;
  };
}

/* -------------------------------- dashboard -------------------------------- */

export interface DashboardLowStockRow {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  packLabel: string;
  available: number;
  threshold: number;
}

export interface DashboardRecentOrderRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  totalPaise: number;
  status: string;
  paymentStatus: string;
  paymentProvider: string;
  createdAt: number;
}

export interface DashboardCategorySale {
  categoryId: string;
  name: string;
  revenuePaise: number;
}

export interface DashboardComparison {
  label: string;
  ordersCount: number;
  paidCount: number;
  netSalesPaise: number;
  averageOrderValuePaise: number | null;
  unitsSold: number;
}

export interface DashboardMetrics {
  range: { from: number; to: number; label: string };
  orders: { count: number; paidCount: number };
  statusCounts: Record<string, number>;
  /** Orders in range grouped by payment status — drives the honest "payment attention" card. */
  paymentStatusCounts: Record<string, number>;
  grossSalesPaise: number;
  discountsPaise: number;
  refundsPaise: number;
  netSalesPaise: number;
  paymentsCollectedPaise: number;
  averageOrderValuePaise: number | null;
  unitsSold: number;
  comparison: DashboardComparison | null;
  profitPaise: null;
  profitNote: string;
  bestsellers: { sku: string; name: string; qty: number; revenuePaise: number }[];
  categorySales: DashboardCategorySale[];
  lowStock: DashboardLowStockRow[];
  recentOrders: DashboardRecentOrderRow[];
  salesTrend: { date: string; netSalesPaise: number; orders: number }[];
  demoDataIncluded: boolean;
}

/* ------------------------------ upsert DTO payloads ----------------------------- */

export interface VariantUpsertPayload {
  id?: string;
  sku: string;
  packLabel: string;
  grams: number;
  pricePaise: number;
  mrpPaise?: number;
  status: ProductStatus;
  stockOnHand: number;
  lowStockThreshold: number;
  sortOrder?: number;
}

export interface ProductUpsertPayload {
  sku: string;
  name: string;
  subtitle: string;
  description: string;
  categoryId: string;
  typeLabel: string;
  status: ProductStatus;
  images: ProductImage[];
  slug?: string;
  origin?: string;
  shelfLife?: string;
  specs?: ProductSpec[];
  ingredients?: string;
  netQuantityLabel?: string;
  storageInstructions?: string;
  allergenInfo?: string;
  manufacturerDetails?: string;
  fssaiLicense?: string;
  bestsellerRank?: number;
  featuredRank?: number;
  giftItem: boolean;
  searchVisible?: boolean;
  trackInventory?: boolean;
  backorderPolicy?: "deny" | "allow" | "notify";
  seo: { title?: string; description?: string };
  variants: VariantUpsertPayload[];
}

export interface SupplierUpsertPayload {
  name: string;
  type: SupplierType;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  village?: string;
  city?: string;
  state?: string;
  pincode?: string;
  addressLines?: string;
  status: SupplierStatus;
  paymentTerms?: string;
  licenseNumber?: string;
  notes?: string;
  productSkus: string[];
  rates: {
    id?: string;
    label: string;
    productSku?: string;
    variantSku?: string;
    unitCostPaise: number;
    unit: string;
    moqQty?: number;
    notes?: string;
  }[];
}

export interface ExpenseUpsertPayload {
  date: number;
  category: string;
  amountPaise: number;
  description: string;
  payee?: string;
  reference?: string;
}

/* -------------------------------- reports -------------------------------- */

export const EXPORT_TYPES = [
  "products",
  "variants",
  "orders",
  "customers",
  "inventory_balances",
  "inventory_movements",
  "suppliers",
  "purchases",
  "expenses",
  "sales_summary",
  "newsletter_subscribers",
] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

/* ---------------------------------- CMS ------------------------------------- */

/** Mirrors the CMS types in @annaadhya/contracts (client-safe subset). */

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

export interface FaqEntry {
  category: string;
  question: string;
  answer: string;
}

export type CmsPageContent =
  | { kind: "document"; lede?: string; sections: CmsSection[] }
  | { kind: "faq"; intro?: string; entries: FaqEntry[] };

export type PageStatus = "draft" | "published" | "archived";

export interface PageDoc extends BaseDoc {
  slug: string;
  title: string;
  builtIn: boolean;
  pageType: "document" | "faq";
  status: PageStatus;
  content: CmsPageContent;
  seo?: { title?: string; description?: string; socialImage?: string };
  /** True once an admin saved content over the shipped default — bespoke
   *  built-in pages (Our Story) switch from their approved designs to the
   *  CMS document from then on. */
  adminEdited?: boolean;
  updatedByName?: string;
}

export type NavLocation = "header" | "footer-care" | "footer-legal";

export interface NavigationItemDoc extends BaseDoc {
  location: NavLocation;
  label: string;
  kind: "home" | "shop" | "category" | "page" | "href";
  categorySlug?: string;
  pageSlug?: string;
  href?: string;
  sortOrder: number;
  enabled: boolean;
}

export interface HomepageDoc extends BaseDoc {
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
