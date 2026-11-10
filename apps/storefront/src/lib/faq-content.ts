/**
 * FAQ content — data separate from presentation.
 *
 * Truth rules for every answer (see the site-wide honesty conventions):
 *  - Only claim what a published policy, the storefront, or admin-configured
 *    settings actually establish. Where the source is a policy, link it.
 *  - No invented emails, phone numbers, support hours, courier names,
 *    delivery guarantees, refund windows beyond the policy's own figures,
 *    certifications, or authentication methods we don't support.
 *  - Support email is rendered from admin settings (server-side, placeholder
 *    guarded) — never hardcoded here.
 *
 * Answer text supports inline internal links with `[label](/href)` tokens,
 * parsed by the explorer. Keep the link set limited to real routes:
 *   /shop, /category/{honey|dry-fruits|kesar|gift-boxes}, /contact,
 *   /account, /account/orders, /account/login,
 *   /policies/{shipping|returns}.
 */

export type FaqCategoryId =
  | "orders"
  | "shipping"
  | "payments"
  | "products"
  | "returns"
  | "gifts"
  | "account";

export interface FaqCategory {
  id: FaqCategoryId;
  /** Pill label (matches the approved design). */
  label: string;
  /** Group heading shown above the accordion rows. */
  heading: string;
}

export interface FaqEntry {
  /** Stable identifier — used for DOM ids, aria wiring and expansion state. */
  id: string;
  category: FaqCategoryId;
  question: string;
  /** Plain text with optional [label](/href) internal links. Searchable as-is. */
  answer: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "orders", label: "Orders", heading: "Orders & Consignments" },
  { id: "shipping", label: "Shipping & Delivery", heading: "Shipping & Delivery" },
  { id: "payments", label: "Payments", heading: "Payments & Transactions" },
  { id: "products", label: "Products", heading: "Products & Provenance" },
  { id: "returns", label: "Returns & Refunds", heading: "Returns & Replacements" },
  { id: "gifts", label: "Gifts & Hampers", heading: "Gifts & Hampers" },
  { id: "account", label: "Account & Website", heading: "Account & Security" },
];

export const FAQ_ENTRIES: FaqEntry[] = [
  // ------------------------------------------------------------- Orders (4)
  {
    id: "orders-place",
    category: "orders",
    question: "How can I place an order?",
    answer:
      "Browse [the shop](/shop), pick a product and the pack size you want, then add it to your bag and check out. Totals are calculated on our servers — the price you see at checkout is the price you pay — and the moment your order is confirmed you'll have an order number and the full details saved under [Account → Orders](/account/orders).",
  },
  {
    id: "orders-details",
    category: "orders",
    question: "Where can I find my order details?",
    answer:
      "Every order lives under [Account → Orders](/account/orders): status, items, totals and — once it's shipped — the courier's tracking link, kept current as the parcel moves. If you checked out as a guest, your confirmation page holds the order details; if you've lost it, [contact us](/contact) with your order number and we'll help.",
  },
  {
    id: "orders-change",
    category: "orders",
    question: "Can I change or cancel an order after placing it?",
    answer:
      "You can cancel an unpaid or not-yet-dispatched order from [your account](/account) or by [contacting us](/contact) with your order number; prepaid orders cancelled before dispatch are refunded in full to the original payment method within 5–7 working days (gateway processing times apply). For changes to items or the delivery address, reach out as early as you can — what's possible depends on how far the order has already gone.",
  },
  {
    id: "orders-confirmation",
    category: "orders",
    question: "I haven't received an order confirmation. What should I do?",
    answer:
      "You don't have to wait on an email: your order number, status and items are recorded under [Account → Orders](/account/orders) the moment checkout completes. If the order isn't showing there at all — or you ordered as a guest and lost the confirmation page — [contact us](/contact) with the payment reference and we'll track it down.",
  },

  // -------------------------------------------------- Shipping & Delivery (4)
  {
    id: "shipping-info",
    category: "shipping",
    question: "Where can I find information about shipping and delivery?",
    answer:
      "Our [shipping & delivery policy](/policies/shipping) has the full detail. In short: orders dispatch within 2–3 working days of payment confirmation, delivery typically takes 3–7 working days after dispatch depending on your pincode, and any shipping charge — or the free-shipping threshold — is shown at checkout before you pay. If a pincode isn't serviceable, checkout tells you before payment.",
  },
  {
    id: "shipping-track",
    category: "shipping",
    question: "How can I track my order?",
    answer:
      "Once your order is shipped, the courier's tracking link and the current status appear on the order under [Account → Orders](/account/orders). That page is always the fastest place to check where your parcel is. If tracking hasn't appeared within the 2–3 working day dispatch window, [contact us](/contact) with your order number.",
  },
  {
    id: "shipping-delayed",
    category: "shipping",
    question: "What should I do if my delivery is delayed?",
    answer:
      "Delivery estimates are planning figures, not guarantees — weather, holiday backlogs and remote-pincode routing can add delays outside our control. Start with the tracking link on your order under [Account → Orders](/account/orders). If the parcel looks stuck or is well past the estimated window, [contact us](/contact) with your order number and we'll follow it up with the courier.",
  },
  {
    id: "shipping-damaged",
    category: "shipping",
    question: "What should I do if my package arrives damaged?",
    answer:
      "We pack to withstand normal transit, but if a parcel arrives damaged, contact us within 48 hours of delivery with your order number and photographs of the outer carton and the damaged items. Approved cases are put right in full — including shipping — under our [returns & refunds policy](/policies/returns).",
  },

  // ------------------------------------------------------------ Payments (3)
  {
    id: "payments-methods",
    category: "payments",
    question: "How can I pay for my order?",
    answer:
      "Checkout offers online payment through our secure payment gateway (UPI, cards, net banking and wallets once Razorpay is live) and Cash on Delivery where it's enabled. Right now the store runs a simulated gateway in demo mode: orders complete end-to-end but no real money moves, and Razorpay switches on automatically once its API keys are configured. Card details are handled entirely by the gateway — we never see or store them.",
  },
  {
    id: "payments-failed",
    category: "payments",
    question: "What should I do if my payment fails?",
    answer:
      "If an authorisation fails, your items stay in your bag. Check with your bank app, then retry or pick a different payment method — and avoid repeat attempts if your bank shows the money leaving, so you don't get charged twice. Still stuck after a couple of tries? [Contact us](/contact) with what you're seeing and we'll help you sort it out.",
  },
  {
    id: "payments-deducted",
    category: "payments",
    question: "My payment was deducted, but my order status is unclear. What should I do?",
    answer:
      "Don't place a duplicate order yet. Note the transaction reference from your bank or UPI app (the UTR or reference number), then [contact us](/contact) with it and the amount — we'll check it against our payment records and confirm your order status. We reply within one working day, Monday to Saturday.",
  },

  // ------------------------------------------------------------- Products (4)
  {
    id: "products-range",
    category: "products",
    question: "What kinds of products does Annaadhya Products offer?",
    answer:
      "Our pantry is built around [honey](/category/honey), [dry fruits](/category/dry-fruits) and [kesar (saffron)](/category/kesar), with a growing [gift hampers](/category/gift-boxes) line for festivals and gifting. Every product page states its pack sizes, price and an honest description of the batch on sale — including what's verified and what's still pending verification.",
  },
  {
    id: "products-learn",
    category: "products",
    question: "How can I learn more about a product?",
    answer:
      "Each [product page](/shop) says exactly what is known about the batch being sold — and what is still pending. We don't use words like 'pure' or 'organic' as marketing labels: when a batch has test documentation, the page states what was tested and by whom. If something isn't clear, choose Product Question in our [contact form](/contact) and we'll follow up.",
  },
  {
    id: "products-availability",
    category: "products",
    question: "How can I check product availability?",
    answer:
      "Stock is shown plainly on each product page — variants are marked in stock or out of stock, low batches are flagged, and sold-out sizes can't be added to the bag. There are no artificial countdowns or scarcity theatre; what the [shop](/shop) shows is what's genuinely on sale.",
  },
  {
    id: "products-certs",
    category: "products",
    question: "Where can I find product-specific certifications?",
    answer:
      "We publish quality information on the product page itself — what has been tested, by whom, and what documentation is still pending — and we don't claim certifications we can't show. Licence and certification details are being finalised with the business and will be published as they're confirmed. Questions about a specific batch? Choose Product Question in the [contact form](/contact).",
  },

  // -------------------------------------------------- Returns & Refunds (3)
  {
    id: "returns-policy",
    category: "returns",
    question: "What is the return policy?",
    answer:
      "Because we sell food, returns are accepted only for genuine quality issues, damaged shipments or wrong items — not for change of mind on opened products. Contact us within 48 hours of delivery with your order number and photographs; approved returns are refunded fully, including shipping. The complete wording is in our [returns & refunds policy](/policies/returns).",
  },
  {
    id: "returns-refund",
    category: "returns",
    question: "How can I ask about a refund?",
    answer:
      "Prepaid orders cancelled before dispatch are refunded in full to the original payment method within 5–7 working days (gateway processing times apply), and approved returns are refunded the same way, including shipping. To ask about a refund, [contact us](/contact) with your order number and what happened — we'll review it against the [returns policy](/policies/returns) and reply within one working day, Monday to Saturday.",
  },
  {
    id: "returns-wrong-item",
    category: "returns",
    question: "What should I do if I receive the wrong item?",
    answer:
      "We're sorry when that happens. Contact us within 48 hours of delivery with your order number and a photo of what arrived; wrong items fall under approved returns, so they're refunded fully including shipping under our [returns & refunds policy](/policies/returns).",
  },

  // -------------------------------------------------- Gifts & Hampers (2)
  {
    id: "gifts-browse",
    category: "gifts",
    question: "Can I explore gift hampers?",
    answer:
      "Yes — our [Gift Hampers](/category/gift-boxes) collection brings together our honeys, saffron and dry fruits in keepsake packaging for festivals, weddings and heartfelt moments. Exact contents and box formats are finalised with our gifting team, so for custom orders, [enquire about gifting](/contact?enquiry=Gifting%20or%20Business%20Enquiry) with the occasion, budget and quantity.",
  },
  {
    id: "gifts-bulk",
    category: "gifts",
    question: "How can I ask about gifting or bulk enquiries?",
    answer:
      "Choose Gifting or Business Enquiry in our [contact form](/contact?enquiry=Gifting%20or%20Business%20Enquiry) and tell us the occasion, the budget per gift and the quantity — we respond with what we can genuinely offer, within one working day, Monday to Saturday.",
  },

  // -------------------------------------------------- Account & Website (3)
  {
    id: "account-required",
    category: "account",
    question: "Do I need an account to shop?",
    answer:
      "No — guest checkout is available, so you can order without signing in. A free account still makes life easier: your address book, order history and courier tracking sit in one place under [Account](/account), which makes reordering and support quicker. You can create one from the [sign-in page](/account/login) whenever you like.",
  },
  {
    id: "account-access",
    category: "account",
    question: "How can I access my account?",
    answer:
      "Use the person icon in the header or go straight to the [sign-in page](/account/login). You can continue with Google, or sign in with the email address and password you registered — sign-in is handled by Google Firebase Authentication and we never store passwords.",
  },
  {
    id: "account-issues",
    category: "account",
    question: "I'm having trouble signing in. What should I do?",
    answer:
      "Double-check the email address you registered with first. If you use Continue with Google, make sure your browser isn't blocking pop-ups — the Google sign-in window opens in one. Still locked out? [Contact us](/contact) with the email you're trying and we'll help you get back in.",
  },
];

/** Search chips shown under the search field — every term MUST produce real
 *  matches in the entries above (verified against question + answer text). */
export const FAQ_POPULAR_SEARCHES = ["saffron", "track", "refund", "UPI"] as const;

/** Strip [label](href) tokens down to their label — the searchable text. */
export function faqAnswerPlainText(answer: string): string {
  return answer.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}
