/**
 * Annaadhya demo catalogue — transcribed from
 * `Annaadhya_Products_Demo_Catalogue_and_Pricing.xlsx` (created 19 Oct 2026).
 *
 * EVERY record produced from this dataset is marked `isDemo: true` with a `seedBatch`
 * identifier. Names, descriptions and prices are illustrative placeholders — never verified
 * selling prices — and must be replaced with confirmed data before launch.
 * See docs/firestore-schema.md ("Demo data boundary") and the START HERE sheet of the workbook.
 */

export interface SeedVariant {
  packLabel: string;
  grams: number;
  /** DEMO retail price in rupees (from workbook; not approved for publication). */
  priceRupees: number;
}

export interface SeedProduct {
  sku: string;
  categorySlug: "honey" | "dry-fruits" | "kesar" | "gift-boxes";
  name: string;
  subtitle: string;
  typeLabel: string;
  description: string;
  packs: SeedVariant[];
  bestsellerRank?: number;
  featuredRank?: number;
  giftItem?: boolean;
}

const HONEY_PACKS: SeedVariant[] = [
  { packLabel: "100 g", grams: 100, priceRupees: 0 },
  { packLabel: "250 g", grams: 250, priceRupees: 0 },
  { packLabel: "500 g", grams: 500, priceRupees: 0 },
  { packLabel: "1 kg", grams: 1000, priceRupees: 0 },
];

const DRY_PACKS: SeedVariant[] = HONEY_PACKS;

const KESAR_PACKS: SeedVariant[] = [
  { packLabel: "0.5 g", grams: 0.5, priceRupees: 0 },
  { packLabel: "1 g", grams: 1, priceRupees: 0 },
  { packLabel: "2 g", grams: 2, priceRupees: 0 },
  { packLabel: "5 g", grams: 5, priceRupees: 0 },
];

function honey(
  sku: string,
  name: string,
  subtitle: string,
  typeLabel: string,
  description: string,
  prices: [number, number, number, number],
  ranks?: { bestsellerRank?: number; featuredRank?: number },
): SeedProduct {
  return {
    sku,
    categorySlug: "honey",
    name,
    subtitle,
    typeLabel,
    description,
    packs: HONEY_PACKS.map((p, i) => ({ ...p, priceRupees: prices[i] })),
    ...ranks,
  };
}

function dry(
  sku: string,
  name: string,
  subtitle: string,
  typeLabel: string,
  description: string,
  prices: [number, number, number, number],
  ranks?: { bestsellerRank?: number; featuredRank?: number },
): SeedProduct {
  return {
    sku,
    categorySlug: "dry-fruits",
    name,
    subtitle,
    typeLabel,
    description,
    packs: DRY_PACKS.map((p, i) => ({ ...p, priceRupees: prices[i] })),
    ...ranks,
  };
}

function kesar(
  sku: string,
  name: string,
  subtitle: string,
  typeLabel: string,
  description: string,
  prices: [number, number, number, number],
  ranks?: { bestsellerRank?: number; featuredRank?: number; giftItem?: boolean },
): SeedProduct {
  return {
    sku,
    categorySlug: "kesar",
    name,
    subtitle,
    typeLabel,
    description,
    packs: KESAR_PACKS.map((p, i) => ({ ...p, priceRupees: prices[i] })),
    ...ranks,
  };
}

/** Gift hampers take explicit packs (box formats, not weight ladders) from the approved design. */
function gift(
  sku: string,
  name: string,
  subtitle: string,
  typeLabel: string,
  description: string,
  packs: SeedVariant[],
): SeedProduct {
  return {
    sku,
    categorySlug: "gift-boxes",
    name,
    subtitle,
    typeLabel,
    description,
    packs,
    giftItem: true,
  };
}

export const DEMO_CATEGORIES = [
  {
    slug: "honey",
    name: "Honey",
    tagline: "Golden, floral and characterful — honeys for every Indian pantry",
    description:
      "Explore Annaadhya's honey collection: floral varieties selected for everyday breakfasts, warm drinks and family recipes. Each batch's taste and colour can vary with the harvest — details are added only after supplier verification.",
    sortOrder: 1,
    isReady: true,
  },
  {
    slug: "dry-fruits",
    name: "Dry Fruits",
    tagline: "Almonds, cashews, pistachios and more — everyday nourishment",
    description:
      "Pantry staples for snacking, festive sweets and traditional recipes. Grades, sizes and origins are stated on each product page only once confirmed with suppliers.",
    sortOrder: 2,
    isReady: true,
  },
  {
    slug: "kesar",
    name: "Kesar (Saffron)",
    tagline: "Small-batch saffron for festive food and special recipes",
    description:
      "Saffron threads for kheer, biryani, sweets and gifting. Authenticity and grade documentation is essential to us — origin and grade claims are published only with supplier evidence.",
    sortOrder: 3,
    isReady: true,
  },
  {
    slug: "gift-boxes",
    name: "Gift Hampers",
    tagline: "Curated hampers for festivals, weddings and heartfelt moments",
    description:
      "Curated gift hampers that bring together our honeys, saffron and dry fruits in keepsake packaging. Hamper contents and box formats are finalised with our gifting team — reach out for custom festival, wedding or corporate orders.",
    sortOrder: 4,
    isReady: true, // live from launch of the curated hamper line (per owner instruction)
  },
] as const;

export const DEMO_PRODUCTS: SeedProduct[] = [
  honey(
    "AN-HNY-001",
    "Annaadhya Vanamrit Honey",
    "A floral honey inspired by India's wild landscapes",
    "Wild forest / multifloral honey",
    "A naturally golden honey with a rounded floral profile, suitable for everyday use in warm drinks, breakfast bowls, toast and home recipes. The final taste, colour and aroma depend on the actual harvest and supplier batch. Product origin and testing details should be added only after supplier verification.",
    [99, 199, 349, 599],
    { bestsellerRank: 1, featuredRank: 1 },
  ),
  honey(
    "AN-HNY-002",
    "Annaadhya Sarson Sugandh Honey",
    "A distinctive honey with a mustard-floral character",
    "Mustard-floral honey",
    "A honey option for customers who enjoy exploring floral varieties. Use it to sweeten tea, drizzle over curd or breakfast dishes, or add to recipes. Confirm the floral source, harvest region and batch characteristics with the supplier before publishing specific origin claims.",
    [89, 179, 319, 549],
    { bestsellerRank: 4 },
  ),
  honey(
    "AN-HNY-003",
    "Annaadhya Litchi Madhur Honey",
    "A fruit-blossom-inspired honey for everyday moments",
    "Litchi-floral honey",
    "A floral honey positioned for customers who like a lighter, fruit-blossom-style profile. Enjoy in breakfast bowls, beverages or as a drizzle over snacks. The actual flavour and floral-source claim must match the supplier's documented product details.",
    [119, 239, 429, 799],
    { featuredRank: 3 },
  ),
  honey(
    "AN-HNY-004",
    "Annaadhya Jamun Van Honey",
    "A characterful honey for curious honey lovers",
    "Jamun-floral honey",
    "A variety-led honey for customers who want to explore flavours beyond everyday table honey. Serve with toast, yoghurt or warm drinks. Publish the jamun floral-source description only when the supplier can substantiate it for the batch being sold.",
    [149, 299, 549, 999],
  ),
  honey(
    "AN-HNY-005",
    "Annaadhya Acacia Amrit Honey",
    "A delicate-style honey for simple everyday use",
    "Acacia-floral honey",
    "A premium-positioned floral honey intended for light everyday use in drinks, breakfast dishes and recipes. Its actual colour, texture and taste can vary by batch. Confirm botanical source, origin and product specifications before making specific claims on the website.",
    [159, 319, 599, 1099],
  ),
  honey(
    "AN-HNY-006",
    "Annaadhya Eucalyptus Pushp Honey",
    "A floral variety for your pantry",
    "Eucalyptus-floral honey",
    "An everyday pantry honey for sweetening beverages, spreading on toast or using in home recipes. This product name is a proposed retail name; the floral-source wording should be used only if supported by supplier records and applicable testing.",
    [99, 199, 359, 649],
    { bestsellerRank: 6 },
  ),
  honey(
    "AN-HNY-007",
    "Annaadhya Ajwain Pushp Honey",
    "A distinctive floral variety to explore",
    "Ajwain-floral honey",
    "A variety-led honey for customers interested in trying distinctive floral profiles. Use in beverages, breakfast dishes or recipes according to preference. Confirm the source and batch identity with the supplier before listing this variety as ajwain-floral honey.",
    [149, 299, 549, 999],
  ),
  honey(
    "AN-HNY-008",
    "Annaadhya Parvat Pushp Honey",
    "A mountain-floral inspired pantry favourite",
    "Mountain / mixed floral honey",
    "A proposed name for a floral honey selected for its distinctive character. Suitable for everyday sweetening and breakfast use. Do not claim a specific Himalayan or mountain origin until the supplier's source and traceability documents confirm it.",
    [169, 339, 629, 1199],
    { featuredRank: 5 },
  ),
  honey(
    "AN-HNY-009",
    "Annaadhya Ber Madhur Honey",
    "A traditional-inspired honey variety",
    "Ber-floral honey",
    "A traditional-inspired retail presentation for a honey variety associated with ber blossoms. Enjoy in drinks, on toast or in recipes. Use the ber floral-source description only when the supplier can verify the source and batch.",
    [199, 399, 749, 1399],
  ),
  honey(
    "AN-HNY-010",
    "Annaadhya Gramya Pushp Honey",
    "A floral honey made for everyday sharing",
    "Multifloral honey",
    "An everyday multifloral honey option for family breakfasts, beverages and home cooking. Natural colour and flavour may vary with floral sources and harvests. Add supplier, batch, test and origin details when verified; avoid unsupported purity, organic or health claims.",
    [109, 219, 389, 699],
    { bestsellerRank: 8 },
  ),
  dry(
    "AN-DRY-001",
    "Annaadhya Badam Shakti",
    "Almonds for everyday crunch and nourishment",
    "Almonds",
    "A versatile pantry staple for snacking, breakfast bowls, baking and traditional Indian sweets. Add the confirmed grade, size, origin and processing details after supplier verification. Store sealed in a cool, dry place and follow the final pack's storage instructions.",
    [129, 299, 569, 1099],
    { bestsellerRank: 2, featuredRank: 2 },
  ),
  dry(
    "AN-DRY-002",
    "Annaadhya Kaju Kosh",
    "Cashews for snacks, sweets and savoury cooking",
    "Cashew kernels",
    "Creamy-textured cashews for snacking, kheer, mithai, curries and home baking. The final listing should state the actual grade or count where supplied and verified. Store in a sealed pack in a cool, dry place.",
    [119, 279, 529, 999],
    { bestsellerRank: 3 },
  ),
  dry(
    "AN-DRY-003",
    "Annaadhya Pista Ratna",
    "Pistachios for a bright, nutty finish",
    "Pistachios",
    "A premium pantry choice for snacking, desserts, garnishing kheer and festive sweets. Specify whether the product is shelled or in-shell, salted or unsalted, and provide origin details only when confirmed by the supplier.",
    [179, 429, 829, 1599],
    { featuredRank: 4 },
  ),
  dry(
    "AN-DRY-004",
    "Annaadhya Akhrot Amrit",
    "Walnut kernels for snacks and recipes",
    "Walnut kernels",
    "Walnut kernels for breakfast bowls, salads, baking, chutneys and everyday snacking. Confirm the kernel grade, broken-piece ratio, origin and freshness details before finalizing the product page. Store sealed and protect from heat and moisture.",
    [169, 399, 779, 1499],
  ),
  dry(
    "AN-DRY-005",
    "Annaadhya Kishmish Noor",
    "Naturally sweet raisins for daily use",
    "Raisins",
    "Raisins for snack mixes, pulao, desserts, baking and traditional recipes. The final product page should identify the actual variety and whether stems or other processing details apply. Keep the pack sealed in a cool, dry place.",
    [69, 159, 299, 569],
    { bestsellerRank: 5 },
  ),
  dry(
    "AN-DRY-006",
    "Annaadhya Khajoor Saanjh",
    "Dates for a naturally sweet pantry staple",
    "Dates",
    "Dates for snacking, smoothies, desserts and festive recipes. Confirm the cultivar, origin, pitted status and moisture characteristics with the supplier before publication. Store according to the supplier's instructions and the final packaging requirements.",
    [89, 209, 399, 749],
  ),
  dry(
    "AN-DRY-007",
    "Annaadhya Anjeer Kesarika",
    "Fig pieces for snacks and special recipes",
    "Dried figs",
    "Dried figs for snack plates, breakfast bowls, desserts and traditional preparations. Confirm the grade, origin, stem status and pack condition with the supplier. Product appearance and size can vary naturally; final specifications should match the actual batch.",
    [199, 479, 929, 1799],
    { featuredRank: 6 },
  ),
  dry(
    "AN-DRY-008",
    "Annaadhya Makhana Manjari",
    "A light, versatile pantry snack",
    "Fox nuts / makhana",
    "Makhana for roasting at home, adding to snack mixes or using in traditional recipes. Confirm size or grade and whether the product is plain or seasoned. If sold plain, list ingredients accurately and provide suitable storage instructions.",
    [129, 309, 599, 1149],
    { bestsellerRank: 7 },
  ),
  kesar(
    "AN-KES-001",
    "Annaadhya Kesar Shringar",
    "Saffron threads for festive food and special recipes",
    "Saffron threads; origin/grade pending verification",
    "A small-batch saffron offering intended for kheer, biryani, sweets and festive recipes. Saffron authenticity and grade are essential: obtain supplier traceability and suitable test evidence before publishing origin or grade claims. Pack size and price are placeholders pending final supplier terms.",
    [199, 349, 649, 1499],
    { bestsellerRank: 9 },
  ),
  kesar(
    "AN-KES-002",
    "Annaadhya Kesar Rajat",
    "A premium saffron selection for special occasions",
    "Premium saffron threads; grade/origin pending verification",
    "A premium-positioned saffron product for festive dishes, desserts and gifting. The retail name is proposed and does not itself certify origin or grade. Publish claims such as Kashmiri, Mongra or a specific grade only after the supplier's documentation and appropriate verification support them.",
    [249, 449, 849, 1999],
    { giftItem: true },
  ),
  gift(
    "AN-GFT-001",
    "Annaadhya Royal Shahi Hamper",
    "A curated celebration hamper for weddings and festive gifting",
    "Curated gift hamper",
    "A premium keepsake hamper that brings together our honeys, saffron and premium dry fruits in decorative gift packaging. Exact box contents, packaging design and pricing are confirmed with our gifting team before dispatch — customisation is available for weddings, festivals and corporate orders.",
    [
      { packLabel: "Festive Box", grams: 900, priceRupees: 2450 },
      { packLabel: "Grand Trunk", grams: 1400, priceRupees: 3450 },
    ],
  ),
  gift(
    "AN-GFT-002",
    "Annaadhya Utsav Aarambh Hamper",
    "A festive starter hamper for heartfelt gifting",
    "Curated gift hamper",
    "A compact curated hamper for everyday celebrations and return gifting. It pairs a floral honey with seasonal dry fruits in a reusable keepsake box. Final contents are confirmed per batch with our gifting team, and bulk or branded orders can be arranged through the contact page.",
    [{ packLabel: "Classic Box", grams: 650, priceRupees: 1499 }],
  ),
];

/** Variant SKU convention: `<product sku>-<pack, uppercased, non-alnum removed>`, e.g. AN-HNY-001-250G. */
export function variantSkuFor(productSku: string, packLabel: string): string {
  return `${productSku}-${packLabel.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;
}

/** Fictional demo suppliers (clearly demo; to be replaced by real suppliers when onboarded).
 *  Extended with the Suppliers-console fields (type/status/contact/location/rates) so the
 *  demo directory exercises the real console — every rate is a fictional procurement cost. */
export const DEMO_SUPPLIERS = [
  {
    name: "DEMO — Moradhanga Forest Honey Collective",
    type: "farmer_apiarist" as const,
    contactPerson: "Demo contact — Subal M.",
    phone: "+91 90000 00001",
    email: "demo.honey@annaadhya.test",
    location: "Nadia, West Bengal (demo record)",
    city: "Nadia",
    state: "West Bengal",
    status: "active" as const,
    paymentTerms: "50% advance, balance on dispatch (demo terms)",
    notes: "Fictional demo supplier created by the seed tool. Replace with real supplier records.",
    rates: [
      { label: "Raw Forest Honey (bulk)", unitCostPaise: 38000, unit: "kg", moqQty: 500 },
      { label: "Clay Jar 500g (finished)", unitCostPaise: 24500, unit: "unit", moqQty: 250 },
    ],
    productSkus: DEMO_PRODUCTS.filter((p) => p.categorySlug === "honey").map((p) => p.sku),
  },
  {
    name: "DEMO — Kesharpur Dry Fruit Traders",
    type: "wholesaler_coop" as const,
    contactPerson: "Demo contact — Harpreet S.",
    phone: "+91 90000 00002",
    email: "demo.dryfruit@annaadhya.test",
    location: "Azadpur Mandi, Delhi (demo record)",
    city: "Delhi",
    state: "Delhi",
    status: "active" as const,
    paymentTerms: "Net 15 on POD (demo terms)",
    notes: "Fictional demo supplier created by the seed tool. Replace with real supplier records.",
    rates: [{ label: "Mamra Almonds Grade-1", unitCostPaise: 165000, unit: "kg", moqQty: 100 }],
    productSkus: DEMO_PRODUCTS.filter((p) => p.categorySlug === "dry-fruits").map((p) => p.sku),
  },
  {
    name: "DEMO — Zabarwan Saffron Growers Guild",
    type: "estate_producer" as const,
    contactPerson: "Demo contact — Ghulam M.",
    phone: "+91 90000 00003",
    email: "demo.kesar@annaadhya.test",
    location: "Pampore, J&K (demo record — origin unverified)",
    city: "Pampore",
    state: "Jammu & Kashmir",
    status: "inactive" as const,
    notes: "Fictional demo supplier created by the seed tool. Origin/grade documentation pending. Paused pending the next harvest cycle.",
    rates: [{ label: "Mongra Kesar (grade unverified)", unitCostPaise: 620000, unit: "g", moqQty: 50 }],
    productSkus: DEMO_PRODUCTS.filter((p) => p.categorySlug === "kesar").map((p) => p.sku),
  },
  {
    name: "DEMO — Gifting Studio (packaging partner)",
    type: "packaging_artisan" as const,
    contactPerson: "Demo contact — Raghunath P.",
    phone: "+91 90000 00004",
    email: "demo.gifting@annaadhya.test",
    location: "Jaipur, Rajasthan (demo record)",
    city: "Jaipur",
    state: "Rajasthan",
    status: "active" as const,
    notes: "Fictional demo packaging partner for the curated hamper line. Replace when the real gifting supplier is onboarded.",
    rates: [{ label: "Maroon keepsake hamper box", unitCostPaise: 48000, unit: "box", moqQty: 100 }],
    productSkus: DEMO_PRODUCTS.filter((p) => p.categorySlug === "gift-boxes").map((p) => p.sku),
  },
];
