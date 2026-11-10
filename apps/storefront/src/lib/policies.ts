/**
 * Policy content — the four customer-facing policy documents, typed and
 * maintainable. Presentation lives in components/policy/*; this file is the
 * single place the business edits wording.
 *
 * TRUTH RULES (hard requirement from the owner):
 *  - every claim must be supportable from the repository: the approved draft
 *    policies, real checkout/settings behaviour, or the published FAQ lines.
 *  - figures the owner configures in Admin → Settings (shipping fee, free
 *    threshold) are rendered LIVE from public settings, never hardcoded.
 *  - the DRAFT status is honest: these documents still need business/legal
 *    review, and the pages say so.
 *  - invented specifics from the design mockups (concierge email, phone
 *    numbers, courier names, SMS automation, per-method refund SLAs, court
 *    regimes beyond the draft's own caveat) are deliberately absent.
 */

export type PolicyIconKey =
  | "truck"
  | "package"
  | "shield"
  | "lock"
  | "pen"
  | "calendar"
  | "headset"
  | "circleCheck"
  | "circleAlert"
  | "clock"
  | "mapPin"
  | "mail"
  | "sparkles"
  | "leaf"
  | "sprout"
  | "droplet"
  | "flower"
  | "wallet"
  | "badgeCheck"
  | "landmark"
  | "idCard"
  | "recycle"
  | "sun"
  | "house"
  | "refresh"
  | "gift"
  | "xCircle"
  | "alert";

/** A "tone" only shifts the accent colour of a card icon — meaning is always
 *  carried by text, never colour alone. */
export type PolicyTone = "primary" | "secondary" | "gold";

export type PolicyBlock =
  /** Paragraph; **bold** spans render with the established inline renderer. */
  | { type: "p"; text: string }
  | { type: "list"; icon?: "check" | "plain"; items: { title?: string; text: string }[] }
  | {
      type: "cards";
      cols: 2 | 3;
      items: { icon: PolicyIconKey; title: string; text: string; tone?: PolicyTone }[];
    }
  | { type: "note"; icon: PolicyIconKey; title?: string; text: string }
  | { type: "table"; head: string[]; rows: string[][]; footnote?: string }
  | { type: "steps"; title: string; intro: string; items: { label: string; text: string }[] }
  | { type: "banner"; icon: PolicyIconKey; title: string; text: string }
  /** Shipping tiers rendered LIVE from public settings (never hardcoded figures). */
  | { type: "shippingTiers" }
  /** Closing support panel; routes to the real contact workflow. */
  | { type: "contactPanel"; text: string };

export type PolicySection = {
  /** Stable anchor id (TOC + scroll targets). */
  id: string;
  /** Small caps kicker above the heading, e.g. "01 • Charter". */
  eyebrow: string;
  title: string;
  /** Optional short label for the table of contents; falls back to the title. */
  toc?: string;
  blocks: PolicyBlock[];
};

export type PolicyDoc = {
  slug: "shipping" | "returns" | "privacy" | "terms";
  title: string;
  /** Label on the shared policy-switcher chips. */
  shortLabel: string;
  /** Meta description + sibling-card summary. */
  description: string;
  /** Editorial paragraph under the H1. */
  lede: string;
  /** Eyebrow topic, e.g. "Our Policies • Shipping". */
  eyebrowTopic: string;
  /** Repository review date of the draft. */
  updated: string;
  /** Aside help card (title, kicker, body) — differences are intentional. */
  help: { title: string; kicker: string; text: string };
  /** Aside single-origin assurance note (grounded per policy). */
  assurance: { icon: PolicyIconKey; text: string };
  /** Bottom related-policies band title — differs per design. */
  relatedTitle: string;
  /** Preselect for the real contact form deep link, if useful. */
  contactEnquiry?: string;
  sections: PolicySection[];
};

const DRAFT_UPDATED = "2026-10-19";

export const POLICIES: Record<string, PolicyDoc> = {
  shipping: {
    slug: "shipping",
    title: "Shipping & Dispatch Policy",
    shortLabel: "Shipping Policy",
    description:
      "How Annaadhya orders are prepared for dispatch, what delivery estimates mean, what shipping costs, and where to get help with a shipment.",
    lede: "Find information about how orders are prepared for dispatch, how delivery information is shared, and where to look for help with a shipment.",
    eyebrowTopic: "Shipping",
    updated: DRAFT_UPDATED,
    help: {
      title: "Need Dispatch Help?",
      kicker: "Shipping desk",
      text: "Have a question about a parcel in transit, or a special note for your delivery? Write to us and we will pick it up from there.",
    },
    assurance: {
      icon: "package",
      text: "Natural goods are packed to withstand normal transit conditions — honey can crystallise in cold weather and dry fruits are sensitive to heat, so cushioning matters.",
    },
    relatedTitle: "Related Safeguards & Support",
    contactEnquiry: "Shipping and Delivery",
    sections: [
      {
        id: "overview",
        eyebrow: "01 • Charter",
        title: "Dispatch Overview",
        toc: "1. Dispatch Overview",
        blocks: [
          {
            type: "p",
            text: "We currently ship across India. Every order is prepared after your payment is confirmed, and parcels leave us within **2–3 working days** — a window we publish openly rather than promise secretly.",
          },
          {
            type: "p",
            text: "Because these are natural pantry goods, we pack to withstand normal transit conditions. This policy explains how orders move from confirmation to your doorstep, what the delivery estimates mean, and what to do if something goes wrong.",
          },
          {
            type: "cards",
            cols: 3,
            items: [
              {
                icon: "clock",
                title: "Honest Timelines",
                text: "Delivery estimates are planning figures — guidance, not guarantees.",
                tone: "primary",
              },
              {
                icon: "package",
                title: "Protective Packing",
                text: "Parcels are packed to withstand normal transit conditions.",
                tone: "secondary",
              },
              {
                icon: "mapPin",
                title: "Pre-Payment Checks",
                text: "If a pincode cannot be served, checkout tells you before you pay.",
                tone: "gold",
              },
            ],
          },
        ],
      },
      {
        id: "order-processing",
        eyebrow: "02 • Preparation",
        title: "Order Processing & Packing",
        toc: "2. Order Processing & Packing",
        blocks: [
          { type: "p", text: "Here is what happens between the moment you pay and the moment your parcel is handed to a courier partner:" },
          {
            type: "list",
            icon: "check",
            items: [
              {
                title: "Payment Confirmation:",
                text: "an order is accepted when we confirm it after successful payment verification. Until then nothing is packed or charged for dispatch.",
              },
              {
                title: "Preparation & Dispatch:",
                text: "orders are dispatched within **2–3 working days** of payment confirmation.",
              },
              {
                title: "Cancellation Window:",
                text: "you may cancel an unpaid or not-yet-dispatched order from your account page or by contacting support — the window closes when the parcel is dispatched.",
              },
            ],
          },
          {
            type: "note",
            icon: "leaf",
            title: "Natural batch variation:",
            text: "our products are natural and vary from batch to batch in colour, texture and aroma. Product pages state what is verified and what is pending verification — packing never changes what is inside the jar.",
          },
        ],
      },
      {
        id: "shipping-delivery-info",
        eyebrow: "03 • Logistics & Transit",
        title: "Shipping & Delivery Timelines",
        toc: "3. Shipping Timelines & Pan-India",
        blocks: [
          {
            type: "p",
            text: "Delivery is handled by our courier partners. The windows below are the honest planning figures we publish — they depend on your pincode and carrier conditions.",
          },
          {
            type: "table",
            head: ["Stage", "Window"],
            rows: [
              ["Dispatch preparation", "2–3 working days from payment confirmation"],
              ["Carrier transit", "3–7 working days after dispatch, depending on your pincode"],
            ],
            footnote:
              "*Estimates are a planning figure shown as guidance only, not a guarantee. They commence from dispatch, not from checkout.",
          },
        ],
      },
      {
        id: "shipping-charges",
        eyebrow: "04 • Tariffs & Complimentary Tier",
        title: "Shipping Charges & Complimentary Tier",
        toc: "4. Rates & Complimentary Tier",
        blocks: [
          {
            type: "p",
            text: "We believe in honest, upfront pricing with no surprise fees at checkout. The figures below are read **live from the store's settings** — the same values that power the cart progress card and checkout, so this page can never drift from what you actually pay.",
          },
          { type: "shippingTiers" },
        ],
      },
      {
        id: "shipment-tracking",
        eyebrow: "05 • Transparency",
        title: "Shipment Tracking & Notifications",
        toc: "5. Tracking & Notifications",
        blocks: [
          {
            type: "p",
            text: "We do not run automated SMS or email dispatch alerts — so we will not pretend you will get one. What you get instead is a tracking reference that lives on your order, where it can always be found:",
          },
          {
            type: "cards",
            cols: 2,
            items: [
              {
                icon: "circleCheck",
                title: "Tracking on Your Order Page",
                text: "Once a shipment is booked, its courier reference (AWB) is recorded on your order in Your Account, with a Track Shipment button that opens the courier's public tracking page.",
              },
              {
                icon: "refresh",
                title: "Corrections Stay Current",
                text: "If the courier reference is ever corrected or added late, the tracking link on your order page always opens the latest one — no stale numbers.",
              },
            ],
          },
          {
            type: "p",
            text: "You can also paste the AWB number directly into the carrier's own tracking site — the link on your order page goes to exactly that public page.",
          },
        ],
      },
      {
        id: "delivery-issues",
        eyebrow: "06 • Address & Coverage",
        title: "Delivery Issues & Non-Serviceable PIN Codes",
        toc: "6. Remote & Non-Serviceable Hubs",
        blocks: [
          {
            type: "p",
            text: "We endeavour to deliver across India, but occasional local courier conditions mean some remote pincodes may not be serviceable. A few practical habits prevent most delivery issues:",
          },
          {
            type: "list",
            icon: "plain",
            items: [
              {
                title: "PIN Code Pre-Check:",
                text: "enter your accurate 6-digit PIN code at checkout — if it cannot be served, checkout tells you before payment.",
              },
              {
                title: "Address Accuracy:",
                text: "double-check the full delivery address and an active phone number before paying; couriers use them to reach you.",
              },
              {
                title: "Parcels Not Arriving:",
                text: "if your parcel has not arrived within the estimated window, contact us with your order number and we will check with the courier partner.",
              },
            ],
          },
        ],
      },
      {
        id: "damaged-deliveries",
        eyebrow: "07 • Transit Guarantee",
        title: "Incorrect or Damaged Deliveries",
        toc: "7. Transit Damages (48-Hr Protocol)",
        blocks: [
          {
            type: "p",
            text: "We honour the sanctity of food. Parcels are packed to withstand normal transit conditions, but rough handling can occasionally occur. If your parcel arrives damaged, here is the path we publish:",
          },
          {
            type: "steps",
            title: "The 48-Hour Notification Protocol",
            intro:
              "If your parcel arrives damaged, contact us **within 48 hours of delivery** — this is the window our returns policy commits to:",
            items: [
              {
                label: "Step 01 • Document",
                text: "Capture clear photographs of the outer carton, the shipping label, and the damaged item.",
              },
              {
                label: "Step 02 • Transmit",
                text: "Send them with your order number through our contact page — every enquiry is recorded and reviewed.",
              },
              {
                label: "Step 03 • Resolution",
                text: "Approved cases are refunded in full, including shipping — refunds are recorded through the original payment provider.",
              },
            ],
          },
          {
            type: "p",
            text: "Kindly keep the original container and shipping box until our team confirms the case is closed.",
          },
        ],
      },
      {
        id: "contact-support",
        eyebrow: "08 • Direct Touchpoint",
        title: "Contact and Support",
        toc: "8. Support & Estate Concierge",
        blocks: [
          {
            type: "p",
            text: "Have a special request, a gifting inquiry, a bulk dispatch schedule, or a question about an order in transit? Our team is one message away:",
          },
          {
            type: "contactPanel",
            text: "Every enquiry is recorded, and we reply within one working day, Monday to Saturday. Shipping questions arrive pre-tagged so they reach the right desk first.",
          },
        ],
      },
    ],
  },

  returns: {
    slug: "returns",
    title: "Returns & Refunds Policy",
    shortLabel: "Returns & Refunds",
    description:
      "Cancellation rules, when returns are accepted for food-safety reasons, how to raise a damaged-item claim within 48 hours, and how refunds are processed.",
    lede: "Learn how to find information about returns, intact packaging, temperature-sensitive goods, and refund timelines for our single-origin harvests.",
    eyebrowTopic: "Returns & Refunds",
    updated: DRAFT_UPDATED,
    help: {
      title: "Immediate Assistance",
      kicker: "Resolution desk",
      text: "Our team can explain the resolution steps, help you locate your order number, or look into a delivery that has gone quiet.",
    },
    assurance: {
      icon: "badgeCheck",
      text: "Approved returns are refunded in full — including shipping. Refunds are recorded through the original payment provider.",
    },
    relatedTitle: "Complementary Guidelines",
    contactEnquiry: "Return or Refund",
    sections: [
      {
        id: "overview",
        eyebrow: "01 • Charter",
        title: "Overview & Food-Safety Commitment",
        toc: "1. Overview & Commitment",
        blocks: [
          {
            type: "p",
            text: "These are food products, so our returns rules are built around **food safety first**. We accept returns only for genuine quality issues, damaged shipments or wrong items — and we say so plainly instead of hiding it in a footnote.",
          },
          {
            type: "p",
            text: "Cancellations work the other way around: while an order is unpaid or not yet dispatched, cancelling it is always available and painless.",
          },
          {
            type: "cards",
            cols: 3,
            items: [
              {
                icon: "clock",
                title: "48 Hours",
                text: "Contact us with photographs within 48 hours of delivery for damage claims.",
                tone: "primary",
              },
              {
                icon: "badgeCheck",
                title: "Full Refund",
                text: "Approved returns are refunded fully, including shipping.",
                tone: "secondary",
              },
              {
                icon: "wallet",
                title: "5–7 Working Days",
                text: "Refunds are recorded through the original payment provider.",
                tone: "gold",
              },
            ],
          },
        ],
      },
      {
        id: "return-eligibility",
        eyebrow: "02 • Standards",
        title: "Return Eligibility & Food Safety Standards",
        toc: "2. Eligibility & Food Safety",
        blocks: [
          {
            type: "p",
            text: "In compliance with basic food-safety logic — and out of respect for every customer who receives a parcel after yours — the following rules apply:",
          },
          {
            type: "list",
            icon: "check",
            items: [
              {
                title: "Quality issues, damage or wrong items:",
                text: "these are exactly what returns exist for. Contact us within 48 hours of delivery with your order number and photographs.",
              },
              {
                title: "No change-of-mind returns on opened food:",
                text: "we cannot accept returns for change of mind on opened food products — this protects every customer's food safety.",
              },
              {
                title: "Approved returns:",
                text: "refunded fully, including shipping.",
              },
            ],
          },
        ],
      },
      {
        id: "damaged-items",
        eyebrow: "03 • Resolution",
        title: "Damaged, Defective, or Incorrect Items",
        toc: "3. Damaged or Incorrect Items",
        blocks: [
          {
            type: "p",
            text: "Our goods travel in protective transit packaging, but couriers are not gentle everywhere. If something reaches you broken, leaking or simply not what you ordered:",
          },
          {
            type: "list",
            icon: "check",
            items: [
              {
                title: "Photographs:",
                text: "capture clear photographs of the outer carton and the affected items — these carry your claim.",
              },
              {
                title: "48-hour window:",
                text: "contact us within 48 hours of marked delivery with your order number and the photographs.",
              },
            ],
          },
          {
            type: "note",
            icon: "package",
            text: "Please keep the original container, seals and shipping box until we confirm the case is closed — they are part of the record.",
          },
        ],
      },
      {
        id: "resolution-request",
        eyebrow: "04 • Procedure",
        title: "How to Submit a Resolution Request",
        toc: "4. Submitting a Request",
        blocks: [
          {
            type: "p",
            text: "To ensure timely review by our team, please complete these four straightforward steps within 48 hours of marked delivery:",
          },
          {
            type: "steps",
            title: "The Resolution Sequence",
            intro: "Four steps, in this order:",
            items: [
              {
                label: "Step 01 • Document",
                text: "Capture 2–3 clear photographs: outer carton, shipping label, and the item as it arrived.",
              },
              {
                label: "Step 02 • Locate",
                text: "Find your order number in Your Account → Orders — every order carries its own reference.",
              },
              {
                label: "Step 03 • Contact",
                text: "Send everything through our contact page with the 'Return or Refund' enquiry type — it arrives pre-tagged for the right desk.",
              },
              {
                label: "Step 04 • Review",
                text: "We review the claim against the published policy and confirm the outcome. A submitted request is a claim under review, not an automatic approval — we will not pretend otherwise.",
              },
            ],
          },
        ],
      },
      {
        id: "refund-timelines",
        eyebrow: "05 • Timelines",
        title: "Refund Review & Processing Timelines",
        toc: "5. Refund Timelines",
        blocks: [
          {
            type: "p",
            text: "Refunds are recorded through the original payment provider. Depending on your bank, refunds reflect in **5–7 working days** — one honest window, not a menu of promises we cannot keep:",
          },
          {
            type: "table",
            head: ["How you paid", "Where the refund goes", "Window"],
            rows: [
              ["Prepaid (payment gateway)", "Original payment method", "5–7 working days"],
              ["Cash on delivery (when enabled)", "Bank transfer to the account you nominate", "5–7 working days"],
            ],
            footnote:
              "*Gateway processing times apply on top of our recording step. Prepaid orders cancelled before dispatch are refunded in full to the original payment method.",
          },
        ],
      },
      {
        id: "cancellation",
        eyebrow: "06 • Cancellation",
        title: "Order Cancellation Parameters",
        toc: "6. Cancellation Rules",
        blocks: [
          {
            type: "p",
            text: "We aim to dispatch quickly, so the cancellation window is real but bounded — here is exactly how it behaves:",
          },
          {
            type: "list",
            icon: "check",
            items: [
              {
                title: "Unpaid or not-yet-dispatched orders:",
                text: "cancel any time from your account page, or by contacting support.",
              },
              {
                title: "Prepaid orders cancelled before dispatch:",
                text: "refunded in full to the original payment method within 5–7 working days.",
              },
              {
                title: "After dispatch:",
                text: "the parcel is on its way — use the 48-hour damage path above if anything is wrong on arrival, or contact us and we will help.",
              },
            ],
          },
        ],
      },
      {
        id: "special-conditions",
        eyebrow: "07 • Nuances",
        title: "Items with Special Conditions & Gifting",
        toc: "7. Special Cases & Gifting",
        blocks: [
          { type: "p", text: "Certain presents and seasonal harvests carry their own considerations, stated here rather than discovered at checkout:" },
          {
            type: "cards",
            cols: 2,
            items: [
              {
                icon: "gift",
                title: "Gift Orders",
                text: "Our curated gift collection is in preparation. Gifting enquiries — including business gifting — are handled through the contact page with the gifting enquiry type.",
                tone: "primary",
              },
              {
                icon: "sun",
                title: "Seasonal Batches",
                text: "Natural products vary from batch to batch in colour, texture and aroma; product pages state what is verified and what is pending verification.",
                tone: "gold",
              },
            ],
          },
        ],
      },
      {
        id: "support-escalation",
        eyebrow: "08 • Direct Touchpoint",
        title: "Direct Support",
        toc: "8. Direct Support",
        blocks: [
          {
            type: "p",
            text: "Should a resolution need a human conversation, start with the contact page — there is no hidden escalation maze to navigate:",
          },
          {
            type: "contactPanel",
            text: "Every enquiry is recorded, and we reply within one working day, Monday to Saturday. Return and refund questions arrive pre-tagged so nothing gets lost in a shared inbox.",
          },
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    shortLabel: "Privacy Policy",
    description:
      "What Annaadhya collects, how orders and support use it, which services process it, and the choices you have over your data.",
    lede: "This document explains what information the Annaadhya storefront handles when you shop with us, why it is needed, and the choices you have.",
    eyebrowTopic: "Privacy",
    updated: DRAFT_UPDATED,
    help: {
      title: "Privacy Questions?",
      kicker: "Data requests",
      text: "Ask anything about the data described here, or request changes to your profile and data — the message form records every request.",
    },
    assurance: {
      icon: "shield",
      text: "We do not sell your personal data. Ever.",
    },
    relatedTitle: "Companion Charters",
    contactEnquiry: "General Enquiry",
    sections: [
      {
        id: "respect",
        eyebrow: "01 • Charter",
        title: "Respect for Person, Disclosure and Data Integrity",
        toc: "1. Respect & Data Integrity",
        blocks: [
          {
            type: "p",
            text: "We collect the minimum needed to run an honest shop: **your name, contact details, delivery addresses and order history** — only what is needed to fulfil your orders and support you.",
          },
          {
            type: "p",
            text: "This policy is a draft pending business and legal review; the review markers you see on this page are deliberate, and the final version will be reviewed against applicable Indian law before launch.",
          },
        ],
      },
      {
        id: "information-collected",
        eyebrow: "02 • Sources & Data Types",
        title: "Information We Collect",
        toc: "2. Information We Collect",
        blocks: [
          {
            type: "cards",
            cols: 2,
            items: [
              {
                icon: "idCard",
                title: "Identity & Delivery Data",
                text: "Your name, contact details and delivery addresses — entered by you, used to fulfil your orders.",
                tone: "primary",
              },
              {
                icon: "wallet",
                title: "Order History",
                text: "What you bought, when, and how it was paid — kept for support and statutory accounting.",
                tone: "gold",
              },
            ],
          },
          {
            type: "note",
            icon: "lock",
            text: "We never store passwords. Sign-in is handled by Google Firebase Authentication — when you sign in with Google or by email, we receive your verified identifier and basic profile.",
          },
        ],
      },
      {
        id: "how-used",
        eyebrow: "03 • Purpose Limitation",
        title: "How Information Is Used",
        toc: "3. How Information Is Used",
        blocks: [
          {
            type: "list",
            icon: "check",
            items: [
              { title: "Orders:", text: "to process orders, arrange delivery and provide support." },
              { title: "Trust & safety:", text: "to prevent fraud and keep accounts secure." },
              {
                title: "Occasional product news:",
                text: "only with your explicit opt-in — and you can opt out anytime from your account.",
              },
            ],
          },
          {
            type: "p",
            text: "Nothing on this list is a hidden purpose. If a future feature needs data differently, this page is where the change gets recorded first.",
          },
        ],
      },
      {
        id: "disclosures",
        eyebrow: "04 • Transfers",
        title: "Disclosures and Transfers",
        toc: "4. Disclosures & Transfers",
        blocks: [
          {
            type: "p",
            text: "We share data only with the services that make the shop work: **payment gateways** (to process payments), **courier partners** (to deliver), and **infrastructure providers** (Firebase, hosting).",
          },
          { type: "p", text: "That is the entire list. No data brokers, no advertising exchanges." },
        ],
      },
      {
        id: "accounts-auth",
        eyebrow: "05 • Authentication",
        title: "Accounts and Authentication",
        toc: "5. Accounts & Authentication",
        blocks: [
          {
            type: "p",
            text: "Sign-in runs on **Google Firebase Authentication** with two methods only: Google sign-in and email-password. There is deliberately no phone-number registration and no OTP flow — fewer identifiers collected, fewer to protect.",
          },
          {
            type: "p",
            text: "Session handling is delegated to Firebase; our own servers never see or store your password.",
          },
        ],
      },
      {
        id: "cookies",
        eyebrow: "06 • Browser Storage",
        title: "Cookies and Similar Technologies",
        toc: "6. Cookies & Browser Storage",
        blocks: [
          {
            type: "p",
            text: "We keep this section short because our usage is short. The storefront uses only the browser storage it needs to function:",
          },
          {
            type: "list",
            icon: "plain",
            items: [
              { title: "Your cart and wishlist:", text: "stored locally in your own browser — they are not uploaded anywhere until you sign in and place an order." },
              { title: "Your sign-in session:", text: "handled by Firebase Authentication." },
            ],
          },
          {
            type: "note",
            icon: "xCircle",
            text: "We do not run advertising trackers or third-party analytics on this site. If that ever changes, this section will describe it before it happens.",
          },
        ],
      },
      {
        id: "third-party-services",
        eyebrow: "07 • Processors",
        title: "Third-Party Services",
        toc: "7. Third-Party Services",
        blocks: [
          {
            type: "cards",
            cols: 3,
            items: [
              {
                icon: "shield",
                title: "Google Firebase",
                text: "Authentication and data storage for business records.",
                tone: "primary",
              },
              {
                icon: "wallet",
                title: "Payment Gateway",
                text: "Processes payments when live; today the store runs in sandbox demo mode until launch approval.",
                tone: "gold",
              },
              {
                icon: "truck",
                title: "Courier Partners",
                text: "Receive the delivery details needed to bring a parcel to your door.",
                tone: "secondary",
              },
            ],
          },
        ],
      },
      {
        id: "non-sale",
        eyebrow: "08 • Pledge",
        title: "Our Strict Non-Sale of Person Data Pledge",
        toc: "8. Non-Sale Pledge",
        blocks: [
          {
            type: "banner",
            icon: "shield",
            title: "We do not sell your personal data. Ever.",
            text: "Not to advertisers, not to data brokers, not to 'partners'. The services listed above receive only what their job requires — nobody receives you.",
          },
        ],
      },
      {
        id: "data-security",
        eyebrow: "09 • Safeguards",
        title: "Data Security",
        toc: "9. Data Security",
        blocks: [
          {
            type: "p",
            text: "Business records are stored in **Google Cloud Firestore**. Access to order records is limited to the team that fulfils your orders and supports you.",
          },
          {
            type: "p",
            text: "We describe our practices plainly instead of making security certifications we have not earned; the draft review before launch includes exactly these claims.",
          },
        ],
      },
      {
        id: "retention",
        eyebrow: "10 • Retention",
        title: "Data Retention Schedules",
        toc: "10. Retention Schedules",
        blocks: [
          {
            type: "p",
            text: "We keep order records for statutory accounting periods — businesses in India must, and pretending otherwise would be false comfort.",
          },
          {
            type: "p",
            text: "Your profile and non-transactional data are different: you may request deletion of those from your account page, subject to identity verification.",
          },
        ],
      },
      {
        id: "your-choices",
        eyebrow: "11 • Your Rights",
        title: "Your Choices and Legal Requests",
        toc: "11. Your Choices",
        blocks: [
          {
            type: "cards",
            cols: 3,
            items: [
              {
                icon: "pen",
                title: "Access & Correction",
                text: "Your profile and address book are editable from your account page at any time.",
                tone: "primary",
              },
              {
                icon: "mail",
                title: "Deletion Requests",
                text: "Request deletion of your profile and non-transactional data via the contact page, subject to identity verification.",
                tone: "secondary",
              },
              {
                icon: "circleAlert",
                title: "Marketing Opt-Out",
                text: "Opt out of occasional product news anytime from your account.",
                tone: "gold",
              },
            ],
          },
        ],
      },
      {
        id: "childrens-privacy",
        eyebrow: "12 • Minors",
        title: "Children's Privacy",
        toc: "12. Children's Privacy",
        blocks: [
          {
            type: "p",
            text: "Placing an order requires you to be at least **18 years old**. If you believe a child has provided us personal data, contact us and we will delete it.",
          },
        ],
      },
      {
        id: "policy-updates",
        eyebrow: "13 • Change Control",
        title: "Policy Updates",
        toc: "13. Policy Updates",
        blocks: [
          {
            type: "p",
            text: "This page is currently a **draft pending business and legal review** — the chips at the top say so on purpose. When the final wording is approved, the review date at the top of this page is where changes will be recorded.",
          },
        ],
      },
      {
        id: "contact-privacy",
        eyebrow: "14 • Direct Touchpoint",
        title: "Contact & Privacy Requests",
        toc: "14. Contact & Requests",
        blocks: [
          {
            type: "p",
            text: "Use the message form on our contact page for any privacy request — every enquiry is recorded and reviewed. Our official support address will be published there once the business confirms it.",
          },
          {
            type: "contactPanel",
            text: "Privacy requests are ordinary enquiries here: recorded, reviewed, and answered within one working day, Monday to Saturday.",
          },
        ],
      },
    ],
  },

  terms: {
    slug: "terms",
    title: "Terms & Conditions",
    shortLabel: "Terms of Service",
    description:
      "The ground rules for ordering from Annaadhya — accounts, orders, prices, payments, product information, liability and governing law.",
    lede: "These terms govern your use of the Annaadhya Products website and the orders you place through it.",
    eyebrowTopic: "Terms",
    updated: DRAFT_UPDATED,
    help: {
      title: "Questions About These Terms?",
      kicker: "Support",
      text: "If any clause below is unclear, ask us through the contact page — an honest answer costs nothing and prevents disputes.",
    },
    assurance: {
      icon: "wallet",
      text: "Prices are in Indian Rupees — the price shown at checkout is the price you pay.",
    },
    relatedTitle: "Companion Standards",
    contactEnquiry: "General Enquiry",
    sections: [
      {
        id: "acceptance",
        eyebrow: "01 • Charter",
        title: "Conclusion and Acceptance",
        toc: "1. Conclusion & Acceptance",
        blocks: [
          {
            type: "p",
            text: "These terms govern your use of the Annaadhya Products website. By placing an order you confirm you are **at least 18 years old** and providing accurate information.",
          },
          {
            type: "p",
            text: "This document is a draft pending business and legal review; the review markers on this page are deliberate and will be resolved before launch.",
          },
        ],
      },
      {
        id: "website-use",
        eyebrow: "02 • Conduct",
        title: "Website Use & Account Responsibility",
        toc: "2. Website Use & Accounts",
        blocks: [
          {
            type: "list",
            icon: "check",
            items: [
              {
                title: "Accurate details:",
                text: "keep your profile, addresses and contact details current — they are what couriers and support rely on.",
              },
              {
                title: "Your account:",
                text: "sign-in runs through Google or email; keep your own credentials safe, since actions on your account are taken as you.",
              },
              {
                title: "Fair use:",
                text: "use the storefront for ordinary shopping, not for interference, scraping at scale, or abuse of support workflows.",
              },
            ],
          },
        ],
      },
      {
        id: "artisanal-nature",
        eyebrow: "03 • Product Truth",
        title: "Artisanal Nature & Natural Variations",
        toc: "3. Natural Variations",
        blocks: [
          {
            type: "p",
            text: "We sell **honey, dry fruits and saffron** through our website. Product pages describe each item's pack sizes and price.",
          },
          {
            type: "cards",
            cols: 2,
            items: [
              {
                icon: "droplet",
                title: "Wild Forest Honey",
                text: "Raw and batch-varying — colour, texture and aroma change harvest to harvest; crystallisation in cold weather is natural.",
                tone: "gold",
              },
              {
                icon: "flower",
                title: "Kashmiri Mongra Saffron",
                text: "GI-tagged threads whose potency and hue vary by season; product pages state what is verified.",
                tone: "primary",
              },
            ],
          },
          {
            type: "p",
            text: "Natural products vary batch to batch. Product pages state what is verified and what is pending verification — read them before ordering.",
          },
        ],
      },
      {
        id: "stock-availability",
        eyebrow: "04 • Inventory",
        title: "Product Information & Stock Availability",
        toc: "4. Product Information & Stock",
        blocks: [
          {
            type: "p",
            text: "Product pages show honest stock states — **in stock, low stock, or out of stock** — computed from real inventory. We do not manufacture scarcity theatre, and we do not take payment for items we cannot ship.",
          },
        ],
      },
      {
        id: "orders",
        eyebrow: "05 • Formation",
        title: "Orders & Acceptance",
        toc: "5. Orders & Acceptance",
        blocks: [
          {
            type: "p",
            text: "An order is accepted when we confirm it after successful payment verification. Until that confirmation, nothing has been contractually accepted — this protects both of us from payment glitches.",
          },
          {
            type: "p",
            text: "In the rare case of pricing or stock errors, we will contact you and cancel with a full refund if you choose not to proceed.",
          },
        ],
      },
      {
        id: "pricing-payment",
        eyebrow: "06 • Money",
        title: "Pricing & Payment",
        toc: "6. Pricing & Payment",
        blocks: [
          {
            type: "p",
            text: "All prices are in **Indian Rupees** and include applicable taxes where stated. We may update prices; the price shown at checkout is the price you pay.",
          },
          {
            type: "list",
            icon: "check",
            items: [
              { title: "Payments:", text: "processed by our payment gateway partner; we do not store card details." },
              {
                title: "Sandbox honesty:",
                text: "payments currently run in sandbox demo mode until launch approval — the storefront says so wherever it matters.",
              },
            ],
          },
        ],
      },
      {
        id: "shipping-dispatch",
        eyebrow: "07 • Logistics",
        title: "Shipping, Packaging & Dispatch",
        toc: "7. Shipping & Dispatch",
        blocks: [
          {
            type: "p",
            text: "Orders are dispatched within **2–3 working days** of payment confirmation, with delivery estimates of 3–7 working days after dispatch. The full detail — charges, complimentary tiers, tracking — lives in the Shipping & Dispatch Policy.",
          },
          {
            type: "note",
            icon: "truck",
            text: "Shipping charges and the free-shipping threshold are configured by the business and always shown at checkout before you pay.",
          },
        ],
      },
      {
        id: "cancellations-returns",
        eyebrow: "08 • Remedies",
        title: "Cancellations, Returns & Claims",
        toc: "8. Cancellations & Returns",
        blocks: [
          {
            type: "p",
            text: "You may cancel an unpaid or not-yet-dispatched order from your account page. Returns are accepted for genuine quality issues, damaged shipments or wrong items — contacted within 48 hours of delivery with photographs.",
          },
          {
            type: "p",
            text: "Refund windows, cancellation parameters and the resolution procedure are set out in the Returns & Refunds Policy.",
          },
        ],
      },
      {
        id: "intellectual-property",
        eyebrow: "09 • Ownership",
        title: "Intellectual Property & Trademarks",
        toc: "9. Intellectual Property",
        blocks: [
          {
            type: "p",
            text: "The Annaadhya name, our logo, and the original text, photography and layout of this website belong to the business. Borrowing them without asking is not a compliment we can accept — write to us first; reasonable requests are usually fine.",
          },
        ],
      },
      {
        id: "non-medical",
        eyebrow: "10 • Boundaries",
        title: "Website Content & Non-Medical Disclaimer",
        toc: "10. Non-Medical Disclaimer",
        blocks: [
          {
            type: "banner",
            icon: "leaf",
            title: "Nothing on this site is medical advice.",
            text: "Product descriptions describe origin, handling and taste — they do not diagnose, treat or prevent anything. Traditional associations belong to tradition, not to a claim we make here.",
          },
        ],
      },
      {
        id: "third-party-links",
        eyebrow: "11 • Elsewhere",
        title: "Third-Party Services & Links",
        toc: "11. Third-Party Services & Links",
        blocks: [
          {
            type: "p",
            text: "Some links from this site lead to third parties — courier tracking pages, for example. Their content and terms are theirs; a link is not an endorsement, and their handling of your data is described in their own policies.",
          },
        ],
      },
      {
        id: "liability",
        eyebrow: "12 • Boundaries of Duty",
        title: "Limitation of Liability",
        toc: "12. Limitation of Liability",
        blocks: [
          {
            type: "p",
            text: "To the extent permitted by law, our liability for any claim relating to an order is limited to the order value. Nothing limits liability that cannot be limited by law.",
          },
          {
            type: "p",
            text: "**Draft flag:** the final strength and wording of this clause requires legal review before launch — it is marked in the launch checklist.",
          },
        ],
      },
      {
        id: "changes",
        eyebrow: "13 • Change Control",
        title: "Changes to These Terms",
        toc: "13. Changes to These Terms",
        blocks: [
          {
            type: "p",
            text: "We may update these terms as the business evolves; the price shown at checkout and the terms visible here at the time of your order govern that order. The review date at the top of this page records when the document last changed.",
          },
        ],
      },
      {
        id: "governing-law",
        eyebrow: "14 • Legal Frame",
        title: "Governing Law & Jurisdiction",
        toc: "14. Governing Law",
        blocks: [
          {
            type: "p",
            text: "These terms are governed by the laws of India; courts at **Meerut, Uttar Pradesh** have exclusive jurisdiction (to be confirmed by the business).",
          },
          {
            type: "note",
            icon: "landmark",
            text: "Draft flag: jurisdiction and dispute-resolution details are the business's decision to finalise with legal counsel — this page will not guess them.",
          },
        ],
      },
      {
        id: "contact-terms",
        eyebrow: "15 • Direct Touchpoint",
        title: "Contact & Support",
        toc: "15. Contact & Support",
        blocks: [
          {
            type: "p",
            text: "Questions about these terms, an order, or anything else on this page:",
          },
          {
            type: "contactPanel",
            text: "Every enquiry is recorded, and we reply within one working day, Monday to Saturday.",
          },
        ],
      },
    ],
  },
};

export const POLICY_ORDER = ["shipping", "returns", "privacy", "terms"] as const;

export function getPolicy(slug: string): PolicyDoc | undefined {
  return POLICIES[slug];
}
