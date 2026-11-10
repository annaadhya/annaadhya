/**
 * Order display helpers for the Order Details page — honest status logic and the
 * Shiprocket tracking URL.
 *
 * Tracking model (no API integration): shipment details (carrier + AWB) are
 * recorded by an administrator in Annaadhya Admin via the shipped transition.
 * Live courier scans stay on Shiprocket's public tracking page — nothing here
 * fabricates tracking events or delivery dates.
 */

/* ----------------------------------- types ---------------------------------- */

/** Client-side mirror of the OrderDoc fields the order details page renders. */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  customerContact: { displayName: string; email: string; phone: string };
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: {
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
  }[];
  subtotalPaise: number;
  discountTotalPaise: number;
  shippingPaise: number;
  taxLabel?: string;
  taxPaise: number;
  totalPaise: number;
  status: string;
  paymentStatus: string;
  paymentProvider: string;
  refundStatus: string;
  refundPaise: number;
  tracking?: { carrier: string; trackingNumber: string; updatedAt: number };
  cancelledReason?: string;
  isGiftOrder?: boolean;
  /** Present only on gift orders; shippingAddress holds the recipient's delivery snapshot. */
  gift?: { recipientName: string; recipientPhone: string; message?: string };
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------- statuses ---------------------------------- */

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Payment pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Fallback label for places without the shared badge maps (account-shared). */
export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

/** Where the order sits in the fulfilment flow — drives milestone + banner logic. */
export function fulfilmentRank(status: string): number {
  const ranks: Record<string, number> = {
    pending_payment: 0,
    confirmed: 1,
    processing: 1.5,
    shipped: 2,
    delivered: 3,
    cancelled: -1,
    refunded: -1,
  };
  return ranks[status] ?? 0;
}

/* ----------------------------- shiprocket URL -------------------------------- */

// Canonical implementation lives in @annaadhya/utils (unit-tested); the exact
// specifier is aliased to the TS source in next.config.ts because a plain
// `next build` never produces workspace dist output (same pattern as rich-text).
export { shiprocketTrackingUrl } from "@annaadhya/utils/tracking";

/* ------------------------------- milestones ---------------------------------- */

export interface Milestone {
  key: "placed" | "confirmed" | "shipped" | "delivered";
  label: string;
  description: string;
  /** Only set when the order document actually records the time — never invented. */
  at: number | null;
  state: "done" | "current" | "pending";
}

/**
 * Honest milestone strip built from real fields only:
 * - placed    → createdAt
 * - confirmed → payment verified (no dedicated timestamp stored; rendered without a time)
 * - shipped   → tracking.updatedAt (set when the admin records the shipment)
 * - delivered → updatedAt (the moment the delivered status was recorded)
 * Cancelled/refunded orders return [] — the page shows a status banner instead.
 */
export function orderMilestones(order: OrderDetail): Milestone[] {
  const rank = fulfilmentRank(order.status);
  if (rank < 0) return [];
  const confirmed = rank >= 1;
  const shipped = rank >= 2;
  const delivered = rank >= 3;
  return [
    {
      key: "placed",
      label: "Order placed",
      description: "We've received your order.",
      at: order.createdAt,
      state: "done",
    },
    {
      key: "confirmed",
      label: "Payment confirmed",
      description: "Payment verified — your items are being prepared.",
      at: null,
      state: confirmed ? "done" : "current",
    },
    {
      key: "shipped",
      label: "Shipped",
      description: order.tracking
        ? `Handed to ${order.tracking.carrier || "the courier"}.`
        : "Shipment hasn't been booked yet.",
      at: shipped && order.tracking ? order.tracking.updatedAt : null,
      state: shipped ? "done" : "pending",
    },
    {
      key: "delivered",
      label: "Delivered",
      description: delivered ? "Delivered — enjoy!" : "On its way to your address.",
      at: delivered ? order.updatedAt : null,
      state: delivered ? "done" : "pending",
    },
  ];
}
