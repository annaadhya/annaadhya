/** Shared helpers for the account surfaces (/account, /account/orders).
 *  Status labels mirror the real ORDER_STATUSES / PAYMENT_STATUSES enums from
 *  @annaadhya/contracts — no invented lifecycle states, no invented badges. */

export interface OrderItemSnapshotShape {
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

/** Client projection of GET /orders/mine items (OrderDoc from @annaadhya/contracts). */
export interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string;
  totalPaise: number;
  subtotalPaise: number;
  shippingPaise: number;
  refundPaise: number;
  createdAt: number;
  items: OrderItemSnapshotShape[];
  shippingAddress?: { fullName: string; line1: string; city: string; state: string; pincode: string };
  tracking?: { carrier: string; trackingNumber: string; updatedAt?: number };
}

/** Fulfilment badge — colour AND text (never colour alone), honest to OrderStatus. */
export const ORDER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Payment Pending", className: "bg-tertiary-fixed text-on-tertiary-fixed" },
  confirmed: { label: "Order Confirmed", className: "bg-secondary-container text-on-secondary-container" },
  processing: { label: "Processing", className: "bg-tertiary-fixed text-on-tertiary-fixed" },
  shipped: { label: "Shipped", className: "bg-primary-container text-on-primary" },
  delivered: { label: "Delivered", className: "bg-secondary-fixed text-on-secondary-fixed" },
  cancelled: { label: "Cancelled", className: "bg-error-container text-on-error-container" },
  refunded: { label: "Refunded", className: "bg-error-container text-on-error-container" },
};

export function statusBadge(status: string): { label: string; className: string } {
  return ORDER_STATUS_BADGE[status] ?? { label: status.replace(/_/g, " "), className: "bg-surface-container-high text-on-surface" };
}

/** Payment status word — kept distinct from fulfilment status. */
export function paymentLabel(order: { paymentStatus: string; paymentProvider: string }): string {
  const providerName = order.paymentProvider === "razorpay" ? "Razorpay" : order.paymentProvider === "cod" ? "Cash on Delivery" : "demo checkout";
  switch (order.paymentStatus) {
    case "succeeded":
      return `Paid via ${providerName}`;
    case "pending":
    case "created":
      return `Payment pending · ${providerName}`;
    case "failed":
      return `Payment failed · ${providerName}`;
    case "cancelled":
      return `Payment cancelled · ${providerName}`;
    case "refunded":
      return `Refunded · ${providerName}`;
    default:
      return order.paymentStatus.replace(/_/g, " ");
  }
}

export const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

export const ADDRESS_LABELS = ["Home", "Work", "Other"] as const;

export interface AddressFormState {
  label: string;
  fullName: string;
  phone: string;
  pincode: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  isDefault: boolean;
}

export const EMPTY_ADDRESS_FORM: AddressFormState = {
  label: "Home",
  fullName: "",
  phone: "",
  pincode: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Uttar Pradesh",
  isDefault: false,
};

/** Same rules the checkout form and the API's savedAddressSchema enforce —
 *  the customer sees identical validation on every surface. */
export function validateAddressForm(form: AddressFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.fullName.trim().length < 1) errors.fullName = "Full name is required";
  if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(form.phone.trim())) errors.phone = "Enter a valid 10-digit Indian mobile number";
  if (form.line1.trim().length < 3) errors.line1 = "Flat / house no. / building is required";
  if (form.city.trim().length < 2) errors.city = "City is required";
  if (form.state.trim().length < 2) errors.state = "State is required";
  if (!/^\d{6}$/.test(form.pincode.trim())) errors.pincode = "PIN code must be exactly 6 digits";
  return errors;
}

/** Formats a stored phone for display: 10-digit numbers render +91 98XXX XXXXX,
 *  anything else renders as stored. */
export function formatPhoneIN(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
}

/** Sign-in method line from the profile's real provider list — Google and
 *  email/password only; no phone provider is offered anywhere on these surfaces. */
export function signInMethodLabel(providers: string[] | undefined): string {
  const set = new Set(providers ?? []);
  const hasGoogle = set.has("google");
  const hasPassword = set.has("password");
  if (hasGoogle && hasPassword) return "Google & email/password";
  if (hasGoogle) return "Google sign-in";
  if (hasPassword) return "Email & password";
  return "Signed-in account";
}
