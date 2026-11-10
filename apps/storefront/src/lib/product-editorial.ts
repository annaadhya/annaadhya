/**
 * Product-page editorial layer — category-scoped content for the shared /product/[slug]
 * template, keyed by the REAL catalogue category slugs (packages/data-core/src/seed/demo-catalogue.ts).
 *
 * Rules encoded here (same discipline as category-editorial.tsx):
 *  - the supplied Stitch A+ image is stored locally as /images/aplus-honey-kitchen.webp and is
 *    used ONLY where its content is truthful — it shows honey being drizzled in an Indian
 *    kitchen, so it is scoped to the honey category. Other categories simply omit the visual
 *    until a real per-category asset exists (the section degrades gracefully).
 *  - copy is qualitative brand storytelling only. NO fabricated lab values, batch numbers,
 *    star ratings, review counts, harvest stats or discount claims anywhere — those parts of
 *    the reference design are replaced with honest equivalents (see the PDP tabs).
 *  - a category WITHOUT an entry still renders the shared template with safe generic content.
 */

export interface PdpHighlight {
  label: string;
  sub: string;
}

export interface PdpPurity {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface PdpEditorial {
  /** Small gold eyebrow above the story heading. */
  storyEyebrow: string;
  /** Serif story heading (the "Anatomy of Pure Harvest" slot). */
  storyHeading: string;
  /** Story intro paragraph. */
  storyIntro: string;
  /** Three qualitative highlight cards (replaces the reference's fabricated stat numbers). */
  storyHighlights: [PdpHighlight, PdpHighlight, PdpHighlight];
  /** A+ editorial visual — present only where the supplied image's content is truthful. */
  aplus?: { image: string; alt: string; captionTitle: string; captionBody: string };
  /** Trust banner under the gallery (replaces the reference's "NMR Lab Tested" claim). */
  purity: PdpPurity;
  /** Honest reviews empty-state note. */
  reviewsNote: string;
}

export const PRODUCT_EDITORIAL: Record<string, PdpEditorial> = {
  honey: {
    storyEyebrow: "From the Annaadhya Pantry",
    storyHeading: "Kept the Way the Hive Made It",
    storyIntro:
      "Raw honey is a living pantry substance — each harvest carries the character of its season, its flowers and its beekeepers. We list every batch only after supplier verification, describe it plainly, and never blend, heat or force it to look uniform on a shelf.",
    storyHighlights: [
      { label: "Raw & Unheated", sub: "Gently filled, never pasteurised" },
      { label: "No Added Sugar", sub: "Nothing but the harvest itself" },
      { label: "Honest Variation", sub: "Colour & taste shift with the season" },
    ],
    aplus: {
      image: "/images/aplus-honey-kitchen.webp",
      alt: "A woman in a printed kurta drizzling golden honey from a glass jar over warm flatbreads on a steel plate in a sunlit Indian kitchen",
      captionTitle: "Natural Crystallisation",
      captionBody:
        "Genuine raw honey slowly sets into a creamy form in cooler months. Rest the jar in lukewarm water to restore its flow — never the microwave.",
    },
    purity: {
      title: "Verified Before Listing",
      body: "Origin, grade and test details are published on this page only after supplier evidence is checked — never before.",
      ctaLabel: "Our sourcing promise",
      ctaHref: "/about",
    },
    reviewsNote:
      "Verified customer reviews will appear here once the first orders are delivered. Every review will come from a real purchase — nothing is seeded or staged.",
  },

  kesar: {
    storyEyebrow: "From the Annaadhya Spice Chest",
    storyHeading: "A Few Threads, Chosen Carefully",
    storyIntro:
      "Saffron rewards a light hand and honest documentation. Each lot is listed with its grade and origin only once supplier evidence is verified, so the threads you read about are the threads in the vial.",
    storyHighlights: [
      { label: "Hand-Picked Threads", sub: "Whole, unbroken stigmas" },
      { label: "Airtight Glass Vial", sub: "Sealed away from light & moisture" },
      { label: "Grade On Record", sub: "Published only when verified" },
    ],
    purity: {
      title: "Verified Before Listing",
      body: "Grade, origin and weight details are published on this page only after supplier evidence is checked — never before.",
      ctaLabel: "Our sourcing promise",
      ctaHref: "/about",
    },
    reviewsNote:
      "Verified customer reviews will appear here once the first orders are delivered. Every review will come from a real purchase — nothing is seeded or staged.",
  },

  "dry-fruits": {
    storyEyebrow: "From the Annaadhya Pantry",
    storyHeading: "Everyday Nourishment, Honestly Described",
    storyIntro:
      "The Indian pantry runs on almonds, cashews and raisins — morning soaks, festive sweets and everything between. We state grades, sizes and origins plainly, and only once suppliers confirm them, so what you read is what you get.",
    storyHighlights: [
      { label: "Hand-Sorted Batches", sub: "Checked before packing" },
      { label: "Airtight Freshness", sub: "Resealable, pantry-friendly packs" },
      { label: "Everyday Essentials", sub: "Sized for real weekly use" },
    ],
    purity: {
      title: "Verified Before Listing",
      body: "Grade, size and origin details are published on this page only after supplier evidence is checked — never before.",
      ctaLabel: "Our sourcing promise",
      ctaHref: "/about",
    },
    reviewsNote:
      "Verified customer reviews will appear here once the first orders are delivered. Every review will come from a real purchase — nothing is seeded or staged.",
  },

  "gift-boxes": {
    storyEyebrow: "From the Annaadhya Gifting Atelier",
    storyHeading: "Goodness, Beautifully Wrapped",
    storyIntro:
      "A hamper is a story you hand over — our keepsake boxes bring verified honeys, kesar and dry fruits together for festivals, weddings and quiet gestures. Contents and box formats are confirmed with our gifting team, and bespoke orders are always welcome.",
    storyHighlights: [
      { label: "Keepsake Packaging", sub: "Boxes that outlast the sweets" },
      { label: "Curated Contents", sub: "Verified pantry favourites inside" },
      { label: "Bespoke Welcome", sub: "Custom boxes for every occasion" },
    ],
    purity: {
      title: "Assembled With Care",
      body: "Every hamper's contents are described exactly as packed — and our gifting team confirms the final box with you for bespoke orders.",
      ctaLabel: "Plan a custom hamper",
      ctaHref: "/contact",
    },
    reviewsNote:
      "Verified customer reviews will appear here once the first orders are delivered. Every review will come from a real purchase — nothing is seeded or staged.",
  },
};

/** Safe generic fallback so freshly added categories render the full template immediately. */
export const GENERIC_PRODUCT_EDITORIAL: PdpEditorial = {
  storyEyebrow: "From the Annaadhya Pantry",
  storyHeading: "Thoughtfully Sourced, Honestly Described",
  storyIntro:
    "Every Annaadhya product is listed only after supplier verification — the claims on this page are the claims we can stand behind, nothing more and nothing less.",
  storyHighlights: [
    { label: "Supplier Verified", sub: "Claims published after evidence" },
    { label: "Quality Checked", sub: "Packed with care, sealed fresh" },
    { label: "Thoughtfully Sourced", sub: "Rooted in Indian heritage" },
  ],
  purity: {
    title: "Verified Before Listing",
    body: "Every detail on this page is published only after supplier evidence is checked — never before.",
    ctaLabel: "Our sourcing promise",
    ctaHref: "/about",
  },
  reviewsNote:
    "Verified customer reviews will appear here once the first orders are delivered. Every review will come from a real purchase — nothing is seeded or staged.",
};

export function productEditorialFor(categorySlug: string | undefined): PdpEditorial {
  return (categorySlug && PRODUCT_EDITORIAL[categorySlug]) || GENERIC_PRODUCT_EDITORIAL;
}
