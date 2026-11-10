/**
 * Category editorial layer — category-specific content for the shared /category/[slug]
 * template, keyed by the REAL catalogue slugs (packages/data-core/src/seed/demo-catalogue.ts).
 *
 * Rules encoded here:
 *  - imagery comes from the approved brand set in /public/images (the supplied Stitch honey
 *    hero was converted to category-honey-hero.webp); NO Stitch preview URLs, no invented paths
 *  - copy is brand storytelling consistent with the approved seed voice — qualitative claims
 *    only. No fabricated batch numbers, moisture specs, star ratings, review counts, or
 *    discounts anywhere in this file (the template never renders them either)
 *  - a category WITHOUT an entry still renders the shared template with safe generic content,
 *    so new catalogue categories never crash or look broken — they inherit the fallback and
 *    gain bespoke copy by adding one entry here
 */
import {
  IconBadgeCheck,
  IconDropletOff,
  IconGift,
  IconLeaf,
  IconMountain,
  IconShieldCheck,
  IconSparkles,
  IconSun,
  IconSunrise,
} from "@/components/icons";
import type { ComponentType, ReactNode } from "react";

type Icon = ComponentType<{ size?: number; className?: string }>;

export interface RitualCard {
  icon: Icon;
  iconTone: string; // token classes for the icon plinth
  title: string;
  body: string;
  footer: string;
}

export interface CategoryEditorial {
  /** Small badge above the H1. */
  eyebrow: string;
  /** Hero H1 — the design's serif statement line. */
  headline: string;
  /** Hero intro paragraph. */
  intro: string;
  /** Three qualitative meta badges under the intro. */
  badges: { icon: Icon; label: string }[];
  /** Arch-frame hero image (local /public path). */
  heroImage: string;
  heroAlt: string;
  /** Inset tag card over the hero image. */
  heroTag: { title: string; sub: string; chip: string };
  /** Floating circular stamp text. */
  stamp: string;
  /** Small badge on the breadcrumb bar's right side. */
  batchNote: string;
  /** Noun for the toolbar counter ("Showing 6 of 6 …"). */
  countNoun: string;
  /** Editorial section heading + supporting line. */
  ritualsTitle: string;
  ritualsIntro: ReactNode;
  rituals: [RitualCard, RitualCard, RitualCard];
  quote: { text: string; source: string };
  /** Empty-state copy when the category has no sellable products right now. */
  emptyNote: string;
  /** Gifting banner copy at the page end (all categories get one; gifting pages self-reference). */
  gifting: { title: string; body: string; cta: string; href: string };
}

export const CATEGORY_EDITORIAL: Record<string, CategoryEditorial> = {
  honey: {
    eyebrow: "From Nature's Pantry — Harvest Reserve",
    headline: "A Little Golden Goodness.",
    intro:
      "Explore golden, floral and characterful honeys selected for breakfast tables, warm drinks and family recipes — gathered by independent beekeepers across forest belts and Himalayan valleys. Every harvest tastes a little different, and each batch is listed only after supplier verification.",
    badges: [
      { icon: IconBadgeCheck, label: "100% Raw & Unheated" },
      { icon: IconMountain, label: "Single-Estate Provenance" },
      { icon: IconDropletOff, label: "Zero Added Sugar or Syrup" },
    ],
    heroImage: "/images/category-honey-hero.webp",
    heroAlt:
      "Golden wildflower honey dripping from a carved wooden dipper into a labelled glass jar on a rustic wooden table, with honeycomb and soft morning light",
    heroTag: {
      title: "Shivalik Forest Wildflower",
      sub: "Late-spring harvest • Cold-filtered",
      chip: "Raw & Unheated",
    },
    stamp: "Lab Tested",
    batchNote: "Harvest Reserve 2026",
    countNoun: "artisanal honey reserves",
    ritualsTitle: "Rituals of Savoring — The Art of Pure Honey",
    ritualsIntro: (
      <>
        In traditional Ayurvedic texts, raw unheated honey is considered an invaluable natural
        carrier (<em>anupana</em>) that magnifies the nourishment of companion spices.
      </>
    ),
    rituals: [
      {
        icon: IconSunrise,
        iconTone: "bg-surface-container-high text-primary",
        title: "Morning Dawn Elixir",
        body: "Whisk a single teaspoon of raw honey into lukewarm water with fresh lime. Never use boiling water — high temperatures destroy the natural enzymes and delicate floral oils that make raw honey worth keeping.",
        footer: "01 / Daily Vitality",
      },
      {
        icon: IconSparkles,
        iconTone: "bg-primary-container text-on-primary-container",
        title: "Ayurvedic Pairings",
        body: "Pair forest or acacia honey with soaked Mamra almonds and a thread or two of kesar. Honey is the restorative bridge that carries nourishment deeper — the classic rasayana union.",
        footer: "02 / Rasayana Union",
      },
      {
        icon: IconSun,
        iconTone: "bg-secondary-container text-on-secondary-container",
        title: "Purity & Crystallization",
        body: "Genuine unprocessed honey naturally sets into a creamy crystalline form over cooler months. Rest the jar in warm morning sunlight or a lukewarm water bath to restore fluidity — never the microwave.",
        footer: "03 / Living Substance",
      },
    ],
    quote: {
      text: "Purity isn't an added feature, it is our only ingredient.",
      source: "The Annaadhya Apiary Note",
    },
    emptyNote:
      "All seasonal honeys are currently spoken for. The next harvest is being sourced — check back soon.",
    gifting: {
      title: "Bespoke Festive & Wedding Hampers",
      body: "Looking for personalised honey jars or ceremonial gift sets?",
      cta: "Inquire For Gifting →",
      href: "/contact",
    },
  },

  kesar: {
    eyebrow: "The Spice of Celebration — Mongra Reserve",
    headline: "Crimson Threads of Celebration.",
    intro:
      "Small-batch Kashmiri saffron for kheer, biryani, sweets and gifting — the threads that turn an ordinary dessert into an occasion. Authenticity is everything with kesar, so grade and origin details are published on each product only once supplier evidence is verified.",
    badges: [
      { icon: IconBadgeCheck, label: "Hand-Picked Threads" },
      { icon: IconShieldCheck, label: "Airtight Glass Vial" },
      { icon: IconSparkles, label: "Festive Favourite" },
    ],
    heroImage: "/images/collection-kesar.webp",
    heroAlt:
      "Brass bowl heaped with deep-red Kashmiri saffron threads beside a labelled ceramic jar and a brass spoon on handmade paper",
    heroTag: {
      title: "Kashmiri Mongra Selection",
      sub: "Small lots • Sealed for aroma",
      chip: "Premium Grade",
    },
    stamp: "Grade Checked",
    batchNote: "Autumn Harvest 2026",
    countNoun: "precious saffron lots",
    ritualsTitle: "Rituals of Savoring — The Way of Kesar",
    ritualsIntro: (
      <>
        Saffron rewards patience: the threads give their colour, aroma and character slowly — and a
        light hand is the whole craft.
      </>
    ),
    rituals: [
      {
        icon: IconSunrise,
        iconTone: "bg-surface-container-high text-primary",
        title: "The Gentle Bloom",
        body: "Steep the threads in two tablespoons of warm (never boiling) milk or water for twenty minutes before adding them to the dish. Blooming releases colour evenly and stretches a gram much further.",
        footer: "01 / Release the Colour",
      },
      {
        icon: IconSparkles,
        iconTone: "bg-primary-container text-on-primary-container",
        title: "A Few Threads Go Far",
        body: "For kheer or biryani, a generous pinch — thirty to fifty threads — perfumes a full dish. More is not better; saffron overshoots from fragrant to bitter quickly.",
        footer: "02 / The Measured Hand",
      },
      {
        icon: IconSun,
        iconTone: "bg-secondary-container text-on-secondary-container",
        title: "Keeping Kesar Happy",
        body: "Store the vial away from light and moisture, tightly closed. Well-kept saffron holds its character for a year or more — toast threads briefly and grind just before use for the brightest finish.",
        footer: "03 / Pantry Longevity",
      },
    ],
    quote: {
      text: "Colour first, aroma second, bitterness last — that is how true kesar announces itself.",
      source: "The Annaadhya Kitchen Note",
    },
    emptyNote:
      "The current saffron lots are reserved. New verified stock lands with the next grade documentation — check back soon.",
    gifting: {
      title: "Saffron, Beautifully Gifted",
      body: "Festive boxes and corporate hampers built around our kesar reserves?",
      cta: "Inquire For Gifting →",
      href: "/contact",
    },
  },

  "dry-fruits": {
    eyebrow: "From the Orchard — Everyday Reserve",
    headline: "Everyday Nourishment, Made Beautiful.",
    intro:
      "Almonds, cashews, pistachios and more — pantry staples for morning snacking, festive sweets and traditional recipes. Grades, sizes and origins are stated on each product page only once confirmed with suppliers, so what you read is what you get.",
    badges: [
      { icon: IconBadgeCheck, label: "Hand-Sorted Batches" },
      { icon: IconShieldCheck, label: "Airtight Freshness" },
      { icon: IconLeaf, label: "Everyday Essentials" },
    ],
    heroImage: "/images/collection-dry-fruits.webp",
    heroAlt:
      "Stoneware bowl of almonds, cashews and pistachios tipped onto woven burlap over a rustic wooden table in soft kitchen light",
    heroTag: {
      title: "The Woven-Basket Mix",
      sub: "Kitchen-staple grades • Resealable packs",
      chip: "Daily Pantry",
    },
    stamp: "Freshness Sealed",
    batchNote: "Pantry Staples 2026",
    countNoun: "pantry favourites",
    ritualsTitle: "Rituals of Savoring — The Everyday Pantry",
    ritualsIntro: (
      <>
        Dry fruits are the quiet workhorses of the Indian kitchen — equally at home in a lunchbox, a
        halwa, and a wedding gift tray.
      </>
    ),
    rituals: [
      {
        icon: IconSunrise,
        iconTone: "bg-surface-container-high text-primary",
        title: "The Morning Soak",
        body: "Almonds soaked overnight and peeled at dawn are the oldest wellness ritual in the Indian pantry — easier to digest, sweeter to taste, and ready before the day demands anything of you.",
        footer: "01 / Daily Vitality",
      },
      {
        icon: IconSparkles,
        iconTone: "bg-primary-container text-on-primary-container",
        title: "Home Roasting",
        body: "A dry kadhai on low heat, five patient minutes, and a pinch of salt transforms nuts entirely. Roast small batches and cool them fully before storing so they stay crisp for weeks.",
        footer: "02 / Warm Pantry Craft",
      },
      {
        icon: IconGift,
        iconTone: "bg-secondary-container text-on-secondary-container",
        title: "The Gifting Tray",
        body: "Festive seasons run on dry-fruit trays — brass thalis lined with banana leaf, portioned into fills of cashews, raisins and pistachios. Our resealable packs are sized to make those trays easy.",
        footer: "03 / Festive Tradition",
      },
    ],
    quote: {
      text: "Soak, roast, share — the oldest snack ritual there is.",
      source: "The Annaadhya Pantry Note",
    },
    emptyNote:
      "This shelf is between batches. Dry-fruit stock is listed as soon as supplier grading is confirmed — check back soon.",
    gifting: {
      title: "Dry-Fruit Gift Trays & Corporate Orders",
      body: "Festive trays, wedding returns and office gifting packed from this pantry?",
      cta: "Inquire For Gifting →",
      href: "/contact",
    },
  },

  "gift-boxes": {
    eyebrow: "The Gifting Atelier — Curated Reserve",
    headline: "Goodness, Beautifully Wrapped.",
    intro:
      "Curated hampers that bring our honeys, kesar and dry fruits together in keepsake packaging — for festivals, weddings and heartfelt moments. Contents and box formats are finalised with our gifting team, and bespoke orders are always welcome.",
    badges: [
      { icon: IconGift, label: "Keepsake Packaging" },
      { icon: IconSparkles, label: "Customisable Contents" },
      { icon: IconBadgeCheck, label: "Pan-India Delivery" },
    ],
    heroImage: "/images/gifting-royal-hamper.webp",
    heroAlt:
      "Royal maroon keepsake hamper box with gold filigree holding jars of honey, a premium selection tin, almonds and pistachios on festive silk",
    heroTag: {
      title: "The Royal Shahi Hamper",
      sub: "Velvet keepsake box • Six compartments",
      chip: "Signature",
    },
    stamp: "Hand Assembled",
    batchNote: "Gifting Collection 2026",
    countNoun: "curated hampers",
    ritualsTitle: "The Art of Giving Well",
    ritualsIntro: (
      <>
        A hamper is a story you hand over — the occasions below are where our boxes have felt most
        at home.
      </>
    ),
    rituals: [
      {
        icon: IconSunrise,
        iconTone: "bg-surface-container-high text-primary",
        title: "Festive Host Gifts",
        body: "A hamper that rides along to Diwali dinners and housewarmings — honey and dry fruits that actually get used, in a box that stays on the shelf long after the sweets are gone.",
        footer: "01 / Festivals",
      },
      {
        icon: IconSparkles,
        iconTone: "bg-primary-container text-on-primary-container",
        title: "Weddings & Return Gifts",
        body: "Velvet keepsake boxes scaled for wedding gifting — shagun trays for the families and return hampers for the guests, assembled in consistent batches so every table matches.",
        footer: "02 / Celebrations",
      },
      {
        icon: IconGift,
        iconTone: "bg-secondary-container text-on-secondary-container",
        title: "Corporate & Bespoke",
        body: "Branded sleeves, custom contents, and volume-friendly pricing for teams and clients. Tell us the occasion and the budget — the gifting team assembles the rest with you.",
        footer: "03 / Bespoke",
      },
    ],
    quote: {
      text: "The best hampers are remembered longer than the festival itself.",
      source: "The Annaadhya Gifting Note",
    },
    emptyNote:
      "The current hamper line is fully reserved. Seasonal collections are announced here first — or write to us for bespoke orders.",
    gifting: {
      title: "Bespoke Festive & Wedding Hampers",
      body: "Tell us the occasion, the budget and the count — we will design the box with you.",
      cta: "Plan a Custom Hamper →",
      href: "/contact",
    },
  },
};

/**
 * Editorial for a slug, with a safe generic fallback so freshly added catalogue categories
 * render the full template immediately (bespoke copy lands here when someone writes it).
 */
export function editorialFor(
  slug: string,
  category: { name: string; tagline: string; description: string },
): CategoryEditorial {
  const bespoke = CATEGORY_EDITORIAL[slug];
  if (bespoke) return bespoke;
  return {
    eyebrow: "From Nature's Pantry — Annaadhya Reserve",
    headline: `${category.name}.`,
    intro: category.description,
    badges: [
      { icon: IconBadgeCheck, label: "Supplier Verified" },
      { icon: IconShieldCheck, label: "Quality Checked" },
      { icon: IconLeaf, label: "Thoughtfully Sourced" },
    ],
    heroImage: "/images/hero-pantry-still-life.webp",
    heroAlt: `${category.name} — Annaadhya pantry still life`,
    heroTag: {
      title: category.name,
      sub: category.tagline,
      chip: "Reserve",
    },
    stamp: "Curated",
    batchNote: "The Annaadhya Collection",
    countNoun: `${category.name.toLowerCase()} treasures`,
    ritualsTitle: `Rituals of Savoring — ${category.name}`,
    ritualsIntro: <>Notes from our pantry on choosing, keeping and enjoying {category.name.toLowerCase()} well.</>,
    rituals: [
      {
        icon: IconSunrise,
        iconTone: "bg-surface-container-high text-primary",
        title: "Choosing Well",
        body: "Every product on this page is listed only after supplier verification — reading the product notes before you buy is the single best ritual this page can teach.",
        footer: "01 / The Shelf",
      },
      {
        icon: IconSparkles,
        iconTone: "bg-primary-container text-on-primary-container",
        title: "Keeping Fresh",
        body: "Cool, dark and airtight — the three words that keep pantry goods at their best. Reseal packs promptly and keep jars away from the stove's heat.",
        footer: "02 / The Jar",
      },
      {
        icon: IconGift,
        iconTone: "bg-secondary-container text-on-secondary-container",
        title: "Sharing the Table",
        body: "The Indian pantry has always been a gifting pantry. Whatever you choose here wraps beautifully — and our gifting team can build a bespoke box around it.",
        footer: "03 / The Gift",
      },
    ],
    quote: {
      text: "Thoughtfully sourced, honestly described — that is the whole promise.",
      source: "The Annaadhya Pantry Note",
    },
    emptyNote: "This shelf is between batches — stock is listed as soon as supplier verification completes.",
    gifting: {
      title: "Bespoke Festive & Wedding Hampers",
      body: "Looking for personalised pantry gifts or ceremonial sets?",
      cta: "Inquire For Gifting →",
      href: "/contact",
    },
  };
}
