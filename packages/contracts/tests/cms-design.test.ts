import { describe, expect, it } from "vitest";
import {
  CONTACT,
  OUR_STORY,
  isCustomizedTitle,
  mapCmsPageToSlots,
  mapDocumentToSlots,
  resolveContactPreview,
  resolveOurStoryHeroTitle,
  resolveOurStoryPreview,
  splitParagraphs,
  stripInlineMarkup,
  tokenizeInline,
} from "../src/cms-design";
import type { PageContent } from "../src/domain";

function documentContent(sections: unknown[], lede?: string): PageContent {
  return { kind: "document", lede, sections } as PageContent;
}

describe("inline markup tokenizer", () => {
  it("parses bold, italic and safe links", () => {
    expect(tokenizeInline("plain **bold** and *soft* plus [shop](/shop)")).toEqual([
      { kind: "text", text: "plain " },
      { kind: "bold", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "italic", text: "soft" },
      { kind: "text", text: " plus " },
      { kind: "link", label: "shop", href: "/shop" },
    ]);
  });

  it("degrades unsafe link targets to plain text", () => {
    // javascript: URIs even fail the link pattern itself (no parens allowed) —
    // the whole construct stays literal text.
    expect(tokenizeInline("[click](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[click](javascript:alert(1))" },
    ]);
    expect(tokenizeInline("[x](//evil.example)")).toEqual([{ kind: "text", text: "x" }]);
  });

  it("keeps mailto and absolute https links", () => {
    expect(tokenizeInline("[mail](mailto:a@b.co)[web](https://x.test)")).toEqual([
      { kind: "link", label: "mail", href: "mailto:a@b.co" },
      { kind: "link", label: "web", href: "https://x.test" },
    ]);
  });

  it("strips markup to plain text (meta descriptions)", () => {
    expect(stripInlineMarkup("**उत्तराखंड** की [वादियों](/shop) से")).toBe("उत्तराखंड की वादियों से");
  });

  it("splits paragraphs on blank lines and trims", () => {
    expect(splitParagraphs("first\n\nsecond\n \n third")).toEqual(["first", "second", "third"]);
    expect(splitParagraphs("single")).toEqual(["single"]);
    expect(splitParagraphs("\n\n")).toEqual([]);
  });
});

describe("slot mapping", () => {
  const KNOWN = ["story", "philosophy"] as const;

  it("routes known ids to slots and unknown/blank sections to extras", () => {
    const mapped = mapDocumentToSlots(
      "Our Story",
      documentContent([
        { id: "story", title: "Hello", blocks: [{ type: "paragraph", text: "one" }] },
        { id: "philosophy", blocks: [{ type: "paragraph", text: "  " }] }, // blank paragraphs → empty slot parts
        { id: "", title: "No id", blocks: [{ type: "paragraph", text: "extra body" }] },
        { id: "brand-new", blocks: [{ type: "paragraph", text: "brand new" }] },
        { id: "empty-known", blocks: [] }, // unknown id without blocks → dropped
      ]),
      KNOWN,
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.title).toBe("Our Story");
    expect(Object.keys(mapped!.byId).sort()).toEqual(["philosophy", "story"]);
    expect(mapped!.byId.story?.title).toBe("Hello");
    expect(mapped!.extras).toHaveLength(2);
    expect(mapped!.extras[0].section.title).toBe("No id");
    expect(mapped!.extras[1].section.id).toBe("brand-new");
  });

  it("returns null for non-document content", () => {
    expect(mapDocumentToSlots("t", { kind: "faq", entries: [] }, KNOWN)).toBeNull();
  });

  it("the storefront guard refuses the boot-seed mirror (adminEdited falsy)", () => {
    const page = { title: "Our Story", content: documentContent([{ id: "story", blocks: [] }]) };
    expect(mapCmsPageToSlots(page, KNOWN)).toBeNull();
    expect(mapCmsPageToSlots({ ...page, adminEdited: true }, KNOWN)).not.toBeNull();
  });

  it("isCustomizedTitle only fires when the title actually moved", () => {
    const mapped = mapDocumentToSlots("Our Story", documentContent([]), KNOWN);
    expect(isCustomizedTitle(mapped, "Our Story")).toBeNull();
    expect(isCustomizedTitle(mapped, "our story ")).toBeNull();
    expect(isCustomizedTitle({ ...mapped, title: "हमारी कहानी" }, "Our Story")).toBe("हमारी कहानी");
  });
});

describe("Our Story preview resolution mirrors the storefront rules", () => {
  it("hero headline: page title wins, then changed section title, then approved two-tone", () => {
    const seed = mapDocumentToSlots("Our Story", documentContent([{ id: "story", title: OUR_STORY.seedHeadline, blocks: [] }]), ["story"]);
    expect(resolveOurStoryHeroTitle(seed)).toBeNull(); // approved two-tone mark

    const sectionChanged = mapDocumentToSlots("Our Story", documentContent([{ id: "story", title: "हमारी कहानी", blocks: [] }]), ["story"]);
    expect(resolveOurStoryHeroTitle(sectionChanged)).toBe("हमारी कहानी");

    const pageChanged = mapDocumentToSlots("हमारी कहानी", documentContent([{ id: "story", title: OUR_STORY.seedHeadline, blocks: [] }]), ["story"]);
    expect(resolveOurStoryHeroTitle(pageChanged)).toBe("हमारी कहानी");
  });

  it("empty parts fall back to the approved copy and are marked isFallback", () => {
    const slots = resolveOurStoryPreview("Our Story", documentContent([{ id: "story", blocks: [] }]));
    const hero = slots.find((s) => s.key === "hero")!;
    expect(hero.sourceIndex).toBe(0);
    const headline = hero.parts.find((p) => p.label === "Headline")!;
    expect(headline.text).toBe(OUR_STORY.seedHeadline);
    expect(headline.isFallback).toBe(true);
    const lede = hero.parts.find((p) => p.label === "Lede")!;
    expect(lede.paragraphs).toEqual([...splitParagraphs(OUR_STORY.defaultLede)]);
    expect(lede.isFallback).toBe(true);
  });

  it("admin text replaces the fallback per part (lede paragraphs split)", () => {
    const lede = "**उत्तराखंड की वादियों से, आपके घर की मेज़ तक!**\n\nहमारा विश्वास है।";
    const slots = resolveOurStoryPreview(
      "Our Story",
      documentContent([{ id: "story", blocks: [{ type: "cta", label: "अब देखें", href: "/shop" }] }], lede),
    );
    const hero = slots.find((s) => s.key === "hero")!;
    const ledePart = hero.parts.find((p) => p.label === "Lede")!;
    expect(ledePart.isFallback).toBe(false);
    expect(ledePart.paragraphs).toEqual(["**उत्तराखंड की वादियों से, आपके घर की मेज़ तक!**", "हमारा विश्वास है।"]);
    const button = hero.parts.find((p) => p.label === "Button")!;
    expect(button.text).toBe("अब देखें");
    expect(button.isFallback).toBe(false);
    const note = hero.parts.find((p) => p.label === "Button note")!;
    expect(note.isFallback).toBe(true);
    expect(note.text).toBe(OUR_STORY.story.heroCtaNote);
  });

  it("managed slot paragraphs are all-or-nothing (one written paragraph wins alone)", () => {
    const slots = resolveOurStoryPreview(
      "Our Story",
      documentContent([{ id: "philosophy", blocks: [{ type: "paragraph", text: "मेरा पैराग्राफ" }] }]),
    );
    const philosophy = slots.find((s) => s.key === "philosophy")!;
    const paragraphs = philosophy.parts.find((p) => p.label === "Paragraphs")!;
    expect(paragraphs.paragraphs).toEqual(["मेरा पैराग्राफ"]);
    expect(paragraphs.isFallback).toBe(false);
    const cards = philosophy.parts.find((p) => p.label === "Cards")!;
    expect(cards.isFallback).toBe(true); // untouched sibling part keeps the default
    expect(cards.items).toEqual([...OUR_STORY.philosophy.cards]);
  });

  it("value-card copy falls back to the shared principles/pillars", () => {
    const slots = resolveOurStoryPreview("Our Story", documentContent([]));
    const guides = slots.find((s) => s.key === "guides")!;
    expect(guides.parts.find((p) => p.label === "Value cards")!.items).toEqual(
      OUR_STORY.principles.map((p) => ({ title: p.title, text: p.copy })),
    );
    const promise = slots.find((s) => s.key === "promise")!;
    expect(promise.parts.find((p) => p.label === "Promise cards")!.items).toEqual(
      OUR_STORY.pillars.map((p) => ({ title: p.title, text: p.copy })),
    );
  });

  it("unknown sections render as the extra story band right after the hero", () => {
    const slots = resolveOurStoryPreview(
      "Our Story",
      documentContent([
        { id: "story", blocks: [] },
        { id: "brand-new", title: "नया भाग", blocks: [{ type: "paragraph", text: "body" }] },
        { id: "philosophy", blocks: [] },
      ]),
    );
    expect(slots[0].key).toBe("hero");
    expect(slots[1].key).toBe("extra-1");
    expect(slots[1].sourceIndex).toBe(1);
    expect(slots[1].sectionTitle).toBe("नया भाग");
    expect(slots[2].key).toBe("philosophy");
  });

  it("closing banner falls back part-by-part like the storefront", () => {
    const slots = resolveOurStoryPreview(
      "Our Story",
      documentContent([{ id: "bring-it-home", blocks: [{ type: "banner", title: "", text: "नया बैनर" }] }]),
    );
    const closing = slots.find((s) => s.key === "closing")!;
    expect(closing.parts.find((p) => p.label === "Banner heading")!.text).toBe(OUR_STORY.cta.banner.title);
    expect(closing.parts.find((p) => p.label === "Banner heading")!.isFallback).toBe(true);
    expect(closing.parts.find((p) => p.label === "Banner text")!.paragraphs).toEqual(["नया बैनर"]);
    expect(closing.parts.find((p) => p.label === "Banner text")!.isFallback).toBe(false);
  });
});

describe("Contact preview resolution", () => {
  it("hero resolves headline rule, lede and chips with approved fallbacks", () => {
    const slots = resolveContactPreview("Contact", documentContent([{ id: "write-to-us", blocks: [] }]));
    const hero = slots.find((s) => s.key === "hero")!;
    expect(hero.parts.find((p) => p.label === "Headline")!.text).toBe(CONTACT.seedHeadline);
    expect(hero.parts.find((p) => p.label === "Headline")!.isFallback).toBe(true);
    expect(hero.parts.find((p) => p.label === "Lede")!.isFallback).toBe(true);
    const chips = hero.parts.find((p) => p.label === "Trust chips")!;
    expect(chips.isFallback).toBe(true);
    expect(chips.items).toEqual(CONTACT.chips.map((c) => ({ title: "", text: c.text })));
  });

  it("marks the reaching-our-team slot as settings-driven", () => {
    const slots = resolveContactPreview("Contact", documentContent([{ id: "reaching-our-team", blocks: [] }]));
    const team = slots.find((s) => s.key === "reaching-our-team")!;
    expect(team.parts[0].text).toContain("Admin → Settings");
  });
});
