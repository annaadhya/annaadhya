/** Business state machines and enumerations shared by API, admin and storefront. */

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

/**
 * Allowed order status transitions (enforced server-side; admin UI mirrors this map).
 * `confirmed` is reached only through verified payment, never by manual edit of an unpaid order.
 */
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

/** Allowed payment status transitions. */
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["pending", "succeeded", "failed", "cancelled"],
  pending: ["succeeded", "failed", "cancelled"],
  succeeded: ["refunded"],
  failed: [],
  cancelled: [],
  refunded: [],
};

export const INVENTORY_MOVEMENT_TYPES = [
  "received", // stock received into the warehouse (from a purchase)
  "sold", // stock sold (reservation committed at payment success)
  "damaged", // written off as damaged
  "manual_adjustment", // counted correction, must include a reason
  "returned", // customer return re-entering stock
  "reserved", // held for an in-flight checkout
  "released", // reservation expired / payment failed / cancelled
  "other", // explicitly labelled other movement
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const ADMIN_ROLES = ["owner", "manager", "inventory", "orders_support", "reports"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AccountStatus = "active" | "suspended";
export type ProductStatus = "draft" | "published" | "archived";
export type SupplierQuoteStatus = "new" | "negotiating" | "accepted" | "rejected";
export type PurchaseStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

/**
 * Supplier-payment settlement state, kept deliberately SEPARATE from the purchase /
 * receiving status (a purchase can be fully received but unpaid, and vice versa).
 * Derived server-side from persisted payment records — never declared by the client.
 */
export const PURCHASE_PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid"] as const;
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number];

/** How a supplier payment was settled (free-form proof lives in `reference`). */
export const PURCHASE_PAYMENT_METHODS = ["cash", "bank_transfer", "upi", "cheque", "other"] as const;
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];

/** Settlement state of an operating expense (Purchases/Inventory never auto-create these). */
export const EXPENSE_STATUSES = ["paid", "pending", "partially_paid"] as const;
export type ExpenseStatusEnum = (typeof EXPENSE_STATUSES)[number];

/** How an expense was (or will be) settled. */
export const EXPENSE_PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"] as const;
export type ExpensePaymentMethodEnum = (typeof EXPENSE_PAYMENT_METHODS)[number];
export type ExportJobStatus = "queued" | "running" | "completed" | "failed" | "expired";
export type RefundStatus = "none" | "initiated" | "completed" | "failed";

/** Enquiry routing options shown on the storefront contact form — validated server-side. */
export const CONTACT_ENQUIRY_TYPES = [
  "General Enquiry",
  "Product Question",
  "Order Support",
  "Shipping and Delivery",
  "Return or Refund",
  "Gifting or Business Enquiry",
  "Other",
] as const;
export type ContactEnquiryType = (typeof CONTACT_ENQUIRY_TYPES)[number];
