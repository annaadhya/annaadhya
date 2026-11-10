/**
 * Fictional demo customers, orders and a demo admin owner for the seed dataset.
 * All records are isDemo. Names, phones and emails are invented placeholder identities.
 */
import type { CustomerDoc, OrderDoc, ProductVariantDoc } from "@annaadhya/contracts";
import { newId, stableId, sumPaise, toPaise } from "@annaadhya/utils";

export const DEMO_CUSTOMERS: Omit<CustomerDoc, "id" | "createdAt" | "updatedAt" | "isDemo" | "seedBatch">[] = [
  {
    uid: "demo-cust-asha",
    displayName: "Asha Verma (demo)",
    email: "asha.demo@example.com",
    phone: "9876500001",
    providers: ["password"],
    accountStatus: "active",
    addresses: [
      {
        id: "addr-asha-1",
        label: "Home",
        fullName: "Asha Verma",
        phone: "9876500001",
        line1: "12/3 Civil Lines",
        line2: "Near Block Park",
        city: "Meerut",
        state: "Uttar Pradesh",
        pincode: "250001",
        isDefault: true,
      },
    ],
    marketingOptIn: false,
    notes: "Fictional demo customer created by the seed tool.",
  },
  {
    uid: "demo-cust-rohan",
    displayName: "Rohan Iyer (demo)",
    email: "rohan.demo@example.com",
    phone: "9876500002",
    providers: ["google"],
    accountStatus: "active",
    addresses: [
      {
        id: "addr-rohan-1",
        label: "Home",
        fullName: "Rohan Iyer",
        phone: "9876500002",
        line1: "402 Lakeview Residency",
        line2: "HSR Layout Sector 3",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560102",
        isDefault: true,
      },
    ],
    marketingOptIn: true,
    notes: "Fictional demo customer created by the seed tool.",
  },
  {
    uid: "demo-cust-neha",
    displayName: "Neha Kapoor (demo)",
    email: "neha.demo@example.com",
    phone: "9876500003",
    providers: ["phone"],
    accountStatus: "active",
    addresses: [
      {
        id: "addr-neha-1",
        label: "Home",
        fullName: "Neha Kapoor",
        phone: "9876500003",
        line1: "88 Green Park Extension",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110016",
        isDefault: true,
      },
    ],
    marketingOptIn: false,
    notes: "Fictional demo customer created by the seed tool.",
  },
  {
    uid: "demo-cust-arjun",
    displayName: "Arjun Menon (demo)",
    email: "arjun.demo@example.com",
    phone: "9876500004",
    providers: ["password", "google"],
    accountStatus: "active",
    addresses: [
      {
        id: "addr-arjun-1",
        label: "Home",
        fullName: "Arjun Menon",
        phone: "9876500004",
        line1: "7 Kalathil Lane",
        line2: "Kaloor",
        city: "Kochi",
        state: "Kerala",
        pincode: "682017",
        isDefault: true,
      },
    ],
    marketingOptIn: false,
    notes: "Fictional demo customer created by the seed tool.",
  },
];

export const DEMO_ADMIN_OWNER = {
  uid: "demo-owner-uid",
  displayName: "Demo Owner",
  email: "owner.demo@example.com",
  role: "owner" as const,
  status: "active" as const,
};

interface DemoOrderSpec {
  seq: number;
  customerIndex: number;
  picks: [productSku: string, packIndex: number, qty: number][];
  daysAgo: number;
  status: OrderDoc["status"];
  paymentStatus: OrderDoc["paymentStatus"];
  provider: "mock";
}

const ORDER_SPECS: DemoOrderSpec[] = [
  { seq: 1, customerIndex: 0, picks: [["AN-HNY-001", 1, 2], ["AN-DRY-001", 1, 1]], daysAgo: 27, status: "delivered", paymentStatus: "succeeded", provider: "mock" },
  { seq: 2, customerIndex: 1, picks: [["AN-DRY-002", 2, 1]], daysAgo: 25, status: "delivered", paymentStatus: "succeeded", provider: "mock" },
  { seq: 3, customerIndex: 2, picks: [["AN-KES-001", 1, 2]], daysAgo: 23, status: "delivered", paymentStatus: "succeeded", provider: "mock" },
  { seq: 4, customerIndex: 3, picks: [["AN-HNY-003", 1, 1], ["AN-HNY-010", 0, 2]], daysAgo: 21, status: "delivered", paymentStatus: "succeeded", provider: "mock" },
  { seq: 5, customerIndex: 0, picks: [["AN-DRY-005", 2, 3]], daysAgo: 18, status: "delivered", paymentStatus: "succeeded", provider: "mock" },
  { seq: 6, customerIndex: 1, picks: [["AN-HNY-005", 2, 1], ["AN-DRY-003", 0, 1]], daysAgo: 15, status: "shipped", paymentStatus: "succeeded", provider: "mock" },
  { seq: 7, customerIndex: 2, picks: [["AN-DRY-006", 1, 2], ["AN-DRY-008", 1, 1]], daysAgo: 12, status: "processing", paymentStatus: "succeeded", provider: "mock" },
  { seq: 8, customerIndex: 3, picks: [["AN-HNY-002", 1, 2]], daysAgo: 9, status: "confirmed", paymentStatus: "succeeded", provider: "mock" },
  { seq: 9, customerIndex: 0, picks: [["AN-KES-002", 2, 1]], daysAgo: 6, status: "pending_payment", paymentStatus: "created", provider: "mock" },
  { seq: 10, customerIndex: 1, picks: [["AN-DRY-004", 1, 1], ["AN-HNY-006", 0, 1]], daysAgo: 4, status: "cancelled", paymentStatus: "failed", provider: "mock" },
  { seq: 11, customerIndex: 2, picks: [["AN-HNY-009", 2, 1]], daysAgo: 2, status: "confirmed", paymentStatus: "succeeded", provider: "mock" },
  { seq: 12, customerIndex: 3, picks: [["AN-DRY-007", 1, 1], ["AN-HNY-004", 0, 1]], daysAgo: 1, status: "processing", paymentStatus: "succeeded", provider: "mock" },
];

const SHIPPING_FLAT_PAISE = toPaise(49);
const FREE_ABOVE_PAISE = toPaise(999);

/** Build demo orders with full line-item snapshots from the given variant docs. */
export function buildDemoOrders(variants: ProductVariantDoc[]): OrderDoc[] {
  const year = new Date().getFullYear();
  const out: OrderDoc[] = [];

  for (const spec of ORDER_SPECS) {
    const customer = DEMO_CUSTOMERS[spec.customerIndex];
    const createdAt = Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000;
    const items = spec.picks.map(([sku, packIndex, qty]) => {
      const variant = variants.find((v) => v.sku === `${sku}-P${packIndex + 1}`) ??
        variants.find((v) => v.sku.startsWith(sku) && v.sku.endsWith(String(packIndex + 1).padStart(2, "0") + "G")) ??
        matchVariant(variants, sku, packIndex);
      if (!variant) throw new Error(`Seed spec error: variant not found for ${sku} pack#${packIndex}`);
      const productSku = variant.sku;
      const lineTotal = variant.pricePaise * qty;
      return {
        variantId: variant.id,
        productId: variant.productId,
        sku: productSku,
        name: productNameFromVariant(variant.sku),
        variantLabel: variant.packLabel,
        image: undefined,
        unitPricePaise: variant.pricePaise,
        mrpPaise: undefined,
        qty,
        lineTotalPaise: lineTotal,
      };
    });

    const subtotal = sumPaise(items.map((i) => i.lineTotalPaise));
    const shipping = subtotal >= FREE_ABOVE_PAISE ? 0 : SHIPPING_FLAT_PAISE;
    const total = subtotal + shipping;

    out.push({
      id: stableId("order", spec.seq),
      orderNumber: `AN-${year}-${String(spec.seq).padStart(6, "0")}`,
      customerUid: customer.uid,
      customerContact: {
        displayName: customer.displayName,
        email: customer.email ?? "",
        phone: customer.phone ?? "",
      },
      shippingAddress: customer.addresses[0],
      items,
      subtotalPaise: subtotal,
      discountTotalPaise: 0,
      shippingPaise: shipping,
      taxPaise: 0, // GST handling configured with the CA before launch — never invented here
      totalPaise: total,
      status: spec.status,
      paymentStatus: spec.paymentStatus,
      paymentProvider: spec.provider,
      refundStatus: "none",
      refundPaise: 0,
      isGiftOrder: false,
      createdAt,
      updatedAt: createdAt,
      isDemo: true,
      seedBatch: "demo-2026-10-19",
    });
  }
  return out;
}

function matchVariant(variants: ProductVariantDoc[], sku: string, packIndex: number) {
  const byPackLabelOrder = ["100G", "250G", "500G", "1KG", "05G", "1G", "2G", "5G"];
  const candidates = variants.filter((v) => v.sku.startsWith(sku + "-"));
  const suffix = byPackLabelOrder[packIndex];
  return candidates.find((v) => v.sku.endsWith(suffix)) ?? candidates[packIndex] ?? candidates[0];
}

/** Demo product display names per SKU prefix (kept in sync with the demo catalogue). */
function productNameFromVariant(variantSku: string): string {
  const sku = variantSku.split("-").slice(0, 3).join("-");
  const map: Record<string, string> = {
    "AN-HNY-001": "Annaadhya Vanamrit Honey",
    "AN-HNY-002": "Annaadhya Sarson Sugandh Honey",
    "AN-HNY-003": "Annaadhya Litchi Madhur Honey",
    "AN-HNY-004": "Annaadhya Jamun Van Honey",
    "AN-HNY-005": "Annaadhya Acacia Amrit Honey",
    "AN-HNY-006": "Annaadhya Eucalyptus Pushp Honey",
    "AN-HNY-007": "Annaadhya Ajwain Pushp Honey",
    "AN-HNY-008": "Annaadhya Parvat Pushp Honey",
    "AN-HNY-009": "Annaadhya Ber Madhur Honey",
    "AN-HNY-010": "Annaadhya Gramya Pushp Honey",
    "AN-DRY-001": "Annaadhya Badam Shakti",
    "AN-DRY-002": "Annaadhya Kaju Kosh",
    "AN-DRY-003": "Annaadhya Pista Ratna",
    "AN-DRY-004": "Annaadhya Akhrot Amrit",
    "AN-DRY-005": "Annaadhya Kishmish Noor",
    "AN-DRY-006": "Annaadhya Khajoor Saanjh",
    "AN-DRY-007": "Annaadhya Anjeer Kesarika",
    "AN-DRY-008": "Annaadhya Makhana Manjari",
    "AN-KES-001": "Annaadhya Kesar Shringar",
    "AN-KES-002": "Annaadhya Kesar Rajat",
  };
  return map[sku] ?? sku;
}

/** Suppress unused-import lint for newId (kept for future order-number generation parity). */
void newId;
