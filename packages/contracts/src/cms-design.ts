/**
 * Shared contracts for the CMS designed pages (Our Story /about, Contact) and
 * the tiny inline markup every CMS text field supports.
 *
 * WHY THIS MODULE EXISTS: the storefront renders admin content INTO approved
 * designs by section anchor id (the "ugly takeover" fix), while the admin panel
 * previews that content. When either side grows its own copy of the approved
 * fallback text or of the markup rules, they drift apart and the admin sees one
 * thing while the storefront renders another ("the our story page is not same
 * as our settings in the admin panel"). This module is the single source of
 * truth both apps import:
 *
 *  - tokenizeInline / stripInlineMarkup / splitParagraphs — the inline markup
 *    (**bold**, *italic*, [label](href)) and blank-line paragraph rules;
 *  - mapCmsPageToSlots / mapDocumentToSlots — routes published sections into
 *    the designed slots by anchor id;
 *  - OUR_STORY / CONTACT — the approved fallback copy per designed slot;
 *  - resolveOurStoryPreview / resolveContactPreview — the resolved copy the
 *    admin preview shows (admin text when present, approved default when not),
 *    so the preview always matches what the storefront will render.
 *
 * Pure data + pure functions only — no React, no fetching — so it is safe for
 * both server (storefront RSC) and client (admin editor) bundles.
 */
import type { CmsDocumentBlock, CmsSection, PageContent } from "./domain";

/* --------------------------------- markup --------------------------------- */

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; label: string; href: string };

const INLINE_PATTERN = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^()\s]+)\)/g;

/** Link policy shared by every renderer: site-rooted paths, absolute http(s)
 *  and mailto only — everything else renders as plain text, never as a link. */
export function isSafeInlineHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed);
}

/** Split CMS text into markup tokens. Unparsable link targets degrade to plain
 *  text tokens — mirroring the storefront renderer, never throwing. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  INLINE_PATTERN.lastIndex = 0;
  for (let m = INLINE_PATTERN.exec(text); m !== null; m = INLINE_PATTERN.exec(text)) {
    if (m.index > lastIndex) tokens.push({ kind: "text", text: text.slice(lastIndex, m.index) });
    if (m[1] !== undefined) {
      tokens.push({ kind: "bold", text: m[1] });
    } else if (m[2] !== undefined) {
      tokens.push({ kind: "italic", text: m[2] });
    } else if (m[3] !== undefined && m[4] !== undefined) {
      if (isSafeInlineHref(m[4])) tokens.push({ kind: "link", label: m[3], href: m[4].trim() });
      else tokens.push({ kind: "text", text: m[3] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) tokens.push({ kind: "text", text: text.slice(lastIndex) });
  return tokens;
}

/** Plain-text projection of CMS markup — used for meta descriptions, search
 *  snippets and anywhere the asterisks themselves must never show. */
export function stripInlineMarkup(text: string): string {
  return tokenizeInline(text)
    .map((t) => (t.kind === "link" ? t.label : t.text))
    .join("");
}

/** CMS paragraphs split on blank lines — the rule the storefront hero lede
 *  follows, so the admin preview can mirror it exactly. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/* ------------------------------ slot mapping ------------------------------ */

/** The editable copy a single designed slot consumes. */
export interface SlotCopy {
  eyebrow?: string;
  title?: string;
  paragraphs: string[];
  listItems: { title?: string; text: string }[];
  cards: { title: string; text: string }[];
  image?: { src: string; alt: string; caption?: string };
  ctas: { label: string; href: string; note?: string }[];
  banner?: { title: string; text: string };
}

/** Result of routing a published page into the designed slots. */
export interface MappedCmsPage {
  /** The admin's page title (already trimmed). */
  title: string;
  /** The document lede (already trimmed). */
  lede: string;
  /** Managed slots by their stable anchor id (only ids the page declares). */
  byId: Record<string, SlotCopy>;
  /** Sections with an unknown/blank anchor id that carry blocks — designed
   *  pages render these once, as an extra story band. */
  extras: { section: CmsSection; blocks: CmsDocumentBlock[] }[];
}

function emptySlot(): SlotCopy {
  return { paragraphs: [], listItems: [], cards: [], ctas: [] };
}

function toSlot(section: CmsSection): SlotCopy {
  const slot = emptySlot();
  if (section.eyebrow?.trim()) slot.eyebrow = section.eyebrow.trim();
  if (section.title?.trim()) slot.title = section.title.trim();
  for (const block of section.blocks ?? []) {
    switch (block.type) {
      case "paragraph":
        if (block.text.trim()) slot.paragraphs.push(block.text.trim());
        break;
      case "list":
        if (block.items.length > 0) slot.listItems.push(...block.items);
        break;
      case "cards":
        if (block.items.length > 0) {
          slot.cards.push(...block.items.map((i) => ({ title: i.title, text: i.text })));
        }
        break;
      case "image":
        if (block.src.trim()) {
          slot.image = {
            src: block.src.trim(),
            alt: block.alt?.trim() || "",
            caption: block.caption?.trim() || undefined,
          };
        }
        break;
      case "cta":
        if (block.label.trim() && block.href.trim()) {
          slot.ctas.push({ label: block.label.trim(), href: block.href.trim(), note: block.note?.trim() || undefined });
        }
        break;
      case "banner":
        if (block.title.trim() || block.text.trim()) {
          slot.banner = { title: block.title.trim(), text: block.text.trim() };
        }
        break;
      default:
        break;
    }
  }
  return slot;
}

/**
 * Route a document's sections into the designed slots by anchor id. Known ids
 * map to their slot; sections with an unknown/blank id that carry blocks land
 * in `extras`. Pure — the storefront wrapper adds the adminEdited guard.
 */
export function mapDocumentToSlots(title: string, document: PageContent, knownIds: readonly string[]): MappedCmsPage | null {
  if (document.kind !== "document") return null;
  const known = new Set(knownIds);
  const byId: Record<string, SlotCopy> = {};
  const extras: MappedCmsPage["extras"] = [];
  for (const section of document.sections) {
    const id = section.id?.trim() ?? "";
    if (id && known.has(id)) {
      byId[id] = toSlot(section);
    } else if (section.blocks.length > 0) {
      extras.push({ section, blocks: section.blocks });
    }
  }
  return {
    title: title.trim(),
    lede: document.lede?.trim() ?? "",
    byId,
    extras,
  };
}

/** Storefront entry: only admin-edited published docs may hijack the designed
 *  pages — the boot-seeded mirror (adminEdited falsy) never does. */
export function mapCmsPageToSlots(
  page: { title: string; content: PageContent; adminEdited?: boolean } | null,
  knownIds: readonly string[],
): MappedCmsPage | null {
  if (!page?.adminEdited || page.content.kind !== "document") return null;
  return mapDocumentToSlots(page.title, page.content, knownIds);
}

/** True when the admin actually customized the page title away from the shipped default. */
export function isCustomizedTitle(mapped: MappedCmsPage | null, fallbackTitle: string): string | null {
  const title = mapped?.title ?? "";
  if (!title || title.toLowerCase() === fallbackTitle.trim().toLowerCase()) return null;
  return title;
}

/* --------------------------- Our Story designed copy --------------------------- */

/** Stable anchor ids of the shipped Our Story document (packages/data-core). */
export const STORY_SECTION_IDS = ["story", "philosophy", "collections", "what-guides-us", "art-of-giving", "our-promise", "bring-it-home"] as const;

/** Approved "Our Story" copy — mirrors the boot-seed document exactly. The
 *  storefront falls back to these per slot part; the admin preview shows them
 *  (marked as the default) when the admin left that part empty. */
export const OUR_STORY = {
  /** Page title in the shipped seed — the hero keeps the approved two-tone
   *  headline while the admin's title matches this. */
  seedTitle: "Our Story",
  seedHeadline: "Rooted in Tradition. Chosen with Care.",
  defaultLede:
    "Discover a thoughtful collection of pantry treasures inspired by India’s rich food heritage, where everyday rituals, beautiful ingredients, and the joy of sharing come together.",
  story: {
    eyebrow: "The Story of Annaadhya",
    heroCtaLabel: "Explore Our Pantry",
    heroCtaNote: "Heirloom Recipes & Rare Harvests",
  },
  philosophy: {
    eyebrow: "Our Philosophy",
    title: "More Than What’s in the Jar.",
    image: {
      src: "/images/story-heritage-kitchen.webp",
      alt: "Sunlit Indian kitchen scene with a brass thali, earthenware and soft jali window light",
      caption: "Honoring quiet morning rituals and generational kitchen traditions.",
    },
    paragraphs: [
      "We believe the things we bring into our homes deserve a little more thought. From the ingredients we keep close to the way we share a gift, every choice can make an ordinary moment feel more considered.",
      "In an era of rushed conveniences, Annaadhya pauses to venerate slow culinary practices—the gentle golden trickle of raw wild forest honey, the fragrant unspooling of Kashmiri Mongra saffron threads in warm milk, and the earthy richness of raw Mamra almonds.",
    ],
    cards: [
      { title: "Verified", text: "Every claim published with supplier documents behind it" },
      { title: "Ritual", text: "Consciously chosen for daily moments" },
    ],
  },
  collections: {
    eyebrow: "Collection Essentials",
    title: "A Pantry Inspired by India’s Richness",
    paragraph:
      "Culinary staples harvested with reverence, celebrating the textures, aromas, and stories of regions steeped in harvest wisdom.",
  },
  guides: {
    eyebrow: "Core Values",
    title: "What Guides Us",
    paragraph:
      "Every product in our pantry stands upon principles that prioritize integrity, mindful savoring, and honest relationships.",
  },
  /** Value-card copy (the storefront cycles its own decorative icons over it). */
  principles: [
    {
      title: "Thoughtful Selection",
      copy: "We value choosing pantry essentials with care and consideration, never compromising on character or provenance.",
    },
    {
      title: "Everyday Rituals",
      copy: "We celebrate the small moments that make food part of how we live, pause, reconnect, and nourish our families.",
    },
    {
      title: "The Joy of Sharing",
      copy: "We believe a thoughtfully chosen gift can bridge distances and make any celebration feel deeply personal.",
    },
    {
      title: "Respect for Tradition",
      copy: "We draw inspiration from India's timeless culinary heritage while tailoring a considered, contemporary experience.",
    },
  ],
  giving: {
    eyebrow: "The Art of Giving",
    title: "Some Things Are Better Shared.",
    image: {
      src: "/images/gifting-royal-hamper.webp",
      alt: "Handcrafted royal maroon keepsake box with honey jars, a saffron tin and assorted premium nuts",
    },
    paragraphs: [
      "A thoughtfully chosen gift can turn a simple gesture into a lasting memory. Our world of pantry treasures and gift hampers is inspired by the pleasure of giving something warm, meaningful, and made to be enjoyed.",
      "Each hamper is hand-assembled in keepsake velvet boxes with gold embossing, pairing golden wild honeys with Mamra almonds and Kashmiri saffron.",
    ],
    cta: { label: "Explore Gift Hampers", href: "/category/gift-boxes" },
  },
  promise: {
    eyebrow: "Our Commitment",
    title: "A More Thoughtful Way to Shop.",
    paragraph:
      "From discovering something special to placing an order, we want your experience with Annaadhya Products to feel clear, considered, and welcoming.",
  },
  /** Promise-card copy (the storefront cycles its own decorative icons over it). */
  pillars: [
    {
      title: "A Considered Selection",
      copy: "Pantry essentials chosen for their craftsmanship, regional balance, natural character, and quiet culinary distinction.",
    },
    {
      title: "A Welcoming Experience",
      copy: "Honest presentation, transparent details, and responsive care from our team — effortless exploration from our pantry to your table.",
    },
    {
      title: "Thoughtful Sharing & Gifting",
      copy: "Distinctive festive presentations, protective transit packaging, and personalized touches that turn gifts into cherished keepsakes.",
    },
  ],
  cta: {
    banner: {
      title: "Bring Something Thoughtful Home.",
      text: "Explore pantry favourites and gifts chosen for the moments worth savouring.",
    },
    ctas: [
      { label: "Explore Our Collection", href: "/shop" },
      { label: "Get in Touch", href: "/contact" },
    ],
  },
} as const;

/* ---------------------------- Contact designed copy ---------------------------- */

/** Stable anchor ids of the shipped Contact document (packages/data-core). */
export const CONTACT_SECTION_IDS = ["write-to-us", "reaching-our-team"] as const;

export const CONTACT = {
  seedTitle: "Contact",
  seedHeadline: "Let’s Talk. We’d Love to Hear From You.",
  defaultLede:
    "Questions about our honey harvests, Kashmiri saffron, or putting together a thoughtful gift? Send us a message — every enquiry is read by our team and answered by email.",
  writeUs: {
    eyebrow: "We’re here to help",
  },
  chips: [{ text: "We reply within one working day" }, { text: "Ships across India" }],
} as const;

/* ------------------------------ preview resolution ----------------------------- */

/** One resolved line/paragraph-group the admin preview shows for a slot. */
export interface PreviewPart {
  label: string;
  /** Single-line value (eyebrow, headline, button…). */
  text?: string;
  /** Multi-paragraph value (lede, narrative paragraphs). */
  paragraphs?: string[];
  /** Card-style value. */
  items?: { title: string; text: string }[];
  /** True when the value is the approved default (the admin left it empty). */
  isFallback: boolean;
  /** Presentation hint for the preview renderer. */
  tone?: "eyebrow" | "headline" | "body" | "button" | "banner";
}

/** One designed slot in live render order. */
export interface PreviewSlot {
  key: string;
  /** Design role shown to the admin, e.g. "Hero — The Story of Annaadhya". */
  label: string;
  /** Where its content comes from in the editor (anchor id), when applicable. */
  anchorId?: string;
  /** Index of the source section in the editor's section list (null → not
   *  clickable; the copy comes from document-level fields or settings). */
  sourceIndex: number | null;
  parts: PreviewPart[];
  /** For brand-new sections (extra story band): the raw blocks, rendered by
   *  the preview's block renderer — the resolver only reports them. */
  blocks?: CmsDocumentBlock[];
  eyebrow?: string;
  sectionTitle?: string;
}

/** Hero headline resolution shared with the storefront: the admin's customized
 *  page title wins; otherwise the story section's title when changed; otherwise
 *  the approved two-tone headline (represented by `null` upstream, the seed
 *  headline text in the preview). */
export function resolveOurStoryHeroTitle(mapped: MappedCmsPage | null): string | null {
  const storyTitle = mapped?.byId.story?.title ?? "";
  return (
    isCustomizedTitle(mapped, OUR_STORY.seedTitle) ??
    (storyTitle && storyTitle.toLowerCase() !== OUR_STORY.seedHeadline.toLowerCase() ? storyTitle : null)
  );
}

function sourceIndexByAnchor(sections: readonly CmsSection[]): Map<string, number> {
  const map = new Map<string, number>();
  sections.forEach((s, i) => {
    const id = s.id?.trim();
    if (id) map.set(id, i); // last match wins, mirroring mapDocumentToSlots
  });
  return map;
}

/** The exact slot parts the Our Story design consumes, in live order, with the
 *  admin's text resolved in (approved defaults where left empty). */
export function resolveOurStoryPreview(title: string, content: PageContent): PreviewSlot[] {
  const mapped = mapDocumentToSlots(title, content, STORY_SECTION_IDS);
  const sections: readonly CmsSection[] = content.kind === "document" ? content.sections : [];
  const indexByAnchor = sourceIndexByAnchor(sections);
  const byId = mapped?.byId ?? {};
  const has = (id: string) => byId[id];

  const story = has("story");
  const heroTitle = resolveOurStoryHeroTitle(mapped);
  const lede = mapped?.lede ?? "";

  const philosophy = has("philosophy");
  const philosophyParagraphs =
    philosophy?.paragraphs && philosophy.paragraphs.length > 0 ? philosophy.paragraphs : [...OUR_STORY.philosophy.paragraphs];
  const philosophyCards = philosophy?.cards && philosophy.cards.length > 0 ? philosophy.cards : [...OUR_STORY.philosophy.cards];

  const collections = has("collections");
  const guides = has("what-guides-us");
  const guidesCards = guides?.cards && guides.cards.length > 0 ? guides.cards : OUR_STORY.principles.map((p) => ({ title: p.title, text: p.copy }));
  const giving = has("art-of-giving");
  const givingParagraphs = giving?.paragraphs && giving.paragraphs.length > 0 ? giving.paragraphs : [...OUR_STORY.giving.paragraphs];
  const givingCta = giving?.ctas[0] ?? OUR_STORY.giving.cta;
  const promise = has("our-promise");
  const promiseCards = promise?.cards && promise.cards.length > 0 ? promise.cards : OUR_STORY.pillars.map((p) => ({ title: p.title, text: p.copy }));
  const closing = has("bring-it-home");
  const closingTitle = closing?.banner?.title || OUR_STORY.cta.banner.title;
  const closingText = closing?.banner?.text || OUR_STORY.cta.banner.text;
  const closingCtas = closing?.ctas && closing.ctas.length > 0 ? closing.ctas.slice(0, 2) : [...OUR_STORY.cta.ctas];

  const slots: PreviewSlot[] = [
    {
      key: "hero",
      label: "Hero — The Story of Annaadhya",
      anchorId: "story",
      sourceIndex: indexByAnchor.get("story") ?? null,
      parts: [
        { label: "Eyebrow", text: story?.eyebrow ?? OUR_STORY.story.eyebrow, isFallback: !story?.eyebrow, tone: "eyebrow" },
        { label: "Headline", text: heroTitle ?? OUR_STORY.seedHeadline, isFallback: heroTitle === null, tone: "headline" },
        { label: "Lede", paragraphs: lede ? splitParagraphs(lede) : splitParagraphs(OUR_STORY.defaultLede), isFallback: !lede, tone: "body" },
        {
          label: "Button",
          text: story?.ctas[0]?.label ?? OUR_STORY.story.heroCtaLabel,
          isFallback: !story?.ctas[0]?.label,
          tone: "button",
        },
        {
          label: "Button note",
          text: story?.ctas[0]?.note ?? OUR_STORY.story.heroCtaNote,
          isFallback: !story?.ctas[0]?.note,
        },
      ],
    },
  ];

  // Brand-new sections render once, as a story band between the hero and the
  // philosophy chapter — the preview mirrors that position.
  sections.forEach((section, i) => {
    const id = section.id?.trim() ?? "";
    if (id && STORY_SECTION_IDS.includes(id as (typeof STORY_SECTION_IDS)[number])) return;
    if ((section.blocks ?? []).length === 0) return;
    slots.push({
      key: `extra-${i}`,
      label: "New story band — renders under the hero",
      sourceIndex: i,
      parts: [],
      blocks: section.blocks ?? [],
      eyebrow: section.eyebrow,
      sectionTitle: section.title,
    });
  });

  slots.push(
    {
      key: "philosophy",
      label: "Our Philosophy",
      anchorId: "philosophy",
      sourceIndex: indexByAnchor.get("philosophy") ?? null,
      parts: [
        { label: "Eyebrow", text: philosophy?.eyebrow ?? OUR_STORY.philosophy.eyebrow, isFallback: !philosophy?.eyebrow, tone: "eyebrow" },
        { label: "Heading", text: philosophy?.title ?? OUR_STORY.philosophy.title, isFallback: !philosophy?.title, tone: "headline" },
        {
          label: "Paragraphs",
          paragraphs: philosophyParagraphs,
          isFallback: !(philosophy?.paragraphs && philosophy.paragraphs.length > 0),
          tone: "body",
        },
        {
          label: "Cards",
          items: philosophyCards.slice(0, 4),
          isFallback: !(philosophy?.cards && philosophy.cards.length > 0),
        },
      ],
    },
    {
      key: "collections",
      label: "Collection Essentials",
      anchorId: "collections",
      sourceIndex: indexByAnchor.get("collections") ?? null,
      parts: [
        { label: "Eyebrow", text: collections?.eyebrow ?? OUR_STORY.collections.eyebrow, isFallback: !collections?.eyebrow, tone: "eyebrow" },
        { label: "Heading", text: collections?.title ?? OUR_STORY.collections.title, isFallback: !collections?.title, tone: "headline" },
        {
          label: "Intro",
          text: collections?.paragraphs[0] ?? OUR_STORY.collections.paragraph,
          isFallback: !collections?.paragraphs[0],
          tone: "body",
        },
      ],
      // No parts for the section's own cards/CTAs — the live catalogue drives
      // the collection cards (deletion doctrine).
    },
    {
      key: "guides",
      label: "Core Values — What Guides Us",
      anchorId: "what-guides-us",
      sourceIndex: indexByAnchor.get("what-guides-us") ?? null,
      parts: [
        { label: "Eyebrow", text: guides?.eyebrow ?? OUR_STORY.guides.eyebrow, isFallback: !guides?.eyebrow, tone: "eyebrow" },
        { label: "Heading", text: guides?.title ?? OUR_STORY.guides.title, isFallback: !guides?.title, tone: "headline" },
        { label: "Intro", text: guides?.paragraphs[0] ?? OUR_STORY.guides.paragraph, isFallback: !guides?.paragraphs[0], tone: "body" },
        { label: "Value cards", items: guidesCards, isFallback: !(guides?.cards && guides.cards.length > 0) },
      ],
    },
    {
      key: "giving",
      label: "The Art of Giving",
      anchorId: "art-of-giving",
      sourceIndex: indexByAnchor.get("art-of-giving") ?? null,
      parts: [
        { label: "Eyebrow", text: giving?.eyebrow ?? OUR_STORY.giving.eyebrow, isFallback: !giving?.eyebrow, tone: "eyebrow" },
        { label: "Heading", text: giving?.title ?? OUR_STORY.giving.title, isFallback: !giving?.title, tone: "headline" },
        { label: "Paragraphs", paragraphs: givingParagraphs, isFallback: !(giving?.paragraphs && giving.paragraphs.length > 0), tone: "body" },
        { label: "Button", text: givingCta.label, isFallback: !giving?.ctas[0], tone: "button" },
      ],
    },
    {
      key: "promise",
      label: "Our Commitment",
      anchorId: "our-promise",
      sourceIndex: indexByAnchor.get("our-promise") ?? null,
      parts: [
        { label: "Eyebrow", text: promise?.eyebrow ?? OUR_STORY.promise.eyebrow, isFallback: !promise?.eyebrow, tone: "eyebrow" },
        { label: "Heading", text: promise?.title ?? OUR_STORY.promise.title, isFallback: !promise?.title, tone: "headline" },
        { label: "Intro", text: promise?.paragraphs[0] ?? OUR_STORY.promise.paragraph, isFallback: !promise?.paragraphs[0], tone: "body" },
        { label: "Promise cards", items: promiseCards, isFallback: !(promise?.cards && promise.cards.length > 0) },
      ],
    },
    {
      key: "closing",
      label: "Closing — Bring It Home",
      anchorId: "bring-it-home",
      sourceIndex: indexByAnchor.get("bring-it-home") ?? null,
      parts: [
        { label: "Banner heading", text: closingTitle, isFallback: !(closing?.banner?.title), tone: "headline" },
        { label: "Banner text", paragraphs: splitParagraphs(closingText), isFallback: !(closing?.banner?.text), tone: "body" },
        {
          label: "Buttons",
          items: closingCtas.map((c) => ({ title: c.label, text: c.href })),
          isFallback: !(closing?.ctas && closing.ctas.length > 0),
        },
      ],
    },
  );
  return slots;
}

/** The exact slot parts the Contact design consumes, in live order. */
export function resolveContactPreview(title: string, content: PageContent): PreviewSlot[] {
  const mapped = mapDocumentToSlots(title, content, CONTACT_SECTION_IDS);
  const sections: readonly CmsSection[] = content.kind === "document" ? content.sections : [];
  const indexByAnchor = sourceIndexByAnchor(sections);
  const writeUs = mapped?.byId["write-to-us"];
  const heroTitle =
    isCustomizedTitle(mapped, CONTACT.seedTitle) ??
    (writeUs?.title && writeUs.title.toLowerCase() !== CONTACT.seedHeadline.toLowerCase() ? writeUs.title : null);
  const lede = mapped?.lede ?? "";
  const chips =
    writeUs?.listItems && writeUs.listItems.length > 0 ? writeUs.listItems.slice(0, 4) : [...CONTACT.chips];

  const slots: PreviewSlot[] = [
    {
      key: "hero",
      label: "Hero — Let’s Talk",
      anchorId: "write-to-us",
      sourceIndex: indexByAnchor.get("write-to-us") ?? null,
      parts: [
        { label: "Eyebrow", text: writeUs?.eyebrow ?? CONTACT.writeUs.eyebrow, isFallback: !writeUs?.eyebrow, tone: "eyebrow" },
        { label: "Headline", text: heroTitle ?? CONTACT.seedHeadline, isFallback: heroTitle === null, tone: "headline" },
        { label: "Lede", paragraphs: lede ? splitParagraphs(lede) : splitParagraphs(CONTACT.defaultLede), isFallback: !lede, tone: "body" },
        {
          label: "Trust chips",
          items: chips.map((c) => ({ title: "", text: c.text })),
          isFallback: !(writeUs?.listItems && writeUs.listItems.length > 0),
        },
      ],
    },
  ];

  sections.forEach((section, i) => {
    const id = section.id?.trim() ?? "";
    if (id && CONTACT_SECTION_IDS.includes(id as (typeof CONTACT_SECTION_IDS)[number])) return;
    if ((section.blocks ?? []).length === 0) return;
    slots.push({
      key: `extra-${i}`,
      label: "New intro band — renders under the hero",
      sourceIndex: i,
      parts: [],
      blocks: section.blocks ?? [],
      eyebrow: section.eyebrow,
      sectionTitle: section.title,
    });
  });

  slots.push({
    key: "reaching-our-team",
    label: "Reaching Our Team — settings-driven",
    anchorId: "reaching-our-team",
    sourceIndex: indexByAnchor.get("reaching-our-team") ?? null,
    parts: [
      {
        label: "Contact facts",
        text: "Email, phone, address and the working form come from Admin → Settings, not from this page — by design.",
        isFallback: false,
      },
    ],
  });
  return slots;
}
