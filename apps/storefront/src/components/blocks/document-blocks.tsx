/**
 * CMS document renderer — renders structured page content (CmsDocumentBlock[])
 * with the approved heritage design language.
 *
 * SAFETY: block text supports a tiny inline markup (**bold**, *italic*,
 * [label](href)) rendered to React elements below. There is no
 * dangerouslySetInnerHTML anywhere in this file — CMS content can never inject
 * HTML into the page.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsDocumentBlock, CmsSection, PublicPageDoc } from "@/lib/types";
import { isSafeInlineHref, splitParagraphs, tokenizeInline } from "@annaadhya/contracts/cms-design";
import { formatINR } from "@/lib/format";
import { getPublicSettings } from "@/lib/api";

/* ----------------------------- inline markup ------------------------------ */

/** Render **bold**, *italic* and [label](href) spans as React elements.
 *
 * The tokenization (pattern + safe-link policy) lives in @annaadhya/contracts
 * so the admin panel's preview renders the exact same markup the same way —
 * what the admin previews is what this storefront shows. */
export function renderInline(text: string): ReactNode[] {
  return tokenizeInline(text).map((token, i) => {
    switch (token.kind) {
      case "bold":
        return (
          <strong key={i} className="font-semibold text-on-surface">
            {token.text}
          </strong>
        );
      case "italic":
        return <em key={i}>{token.text}</em>;
      case "link":
        return token.href.startsWith("/") && !token.href.startsWith("//") ? (
          <Link
            key={i}
            href={token.href}
            className="font-medium text-primary underline decoration-gold-deep/50 underline-offset-2 transition-colors hover:text-primary-container"
          >
            {token.label}
          </Link>
        ) : (
          <a
            key={i}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline decoration-gold-deep/50 underline-offset-2 transition-colors hover:text-primary-container"
          >
            {token.label}
          </a>
        );
      default:
        return <span key={i}>{token.text}</span>;
    }
  });
}

/** CMS paragraphs split on blank lines — hero/lede fields render one <p> per
 *  group, so admin formatting (and **bold** spans) shows exactly as written. */
export function renderLedeParagraphs(text: string): ReactNode[] {
  return splitParagraphs(text).map((p, i) => <span key={i} className="block">{renderInline(p)}</span>);
}

/* ------------------------------ shipping tiers ----------------------------- */

/** Rendered LIVE from public settings — shipping figures are never hardcoded. */
async function ShippingTiers() {
  const settings = await getPublicSettings();
  const flat = settings?.shipping.flatRatePaise ?? 0;
  const freeAbove = settings?.shipping.freeAbovePaise ?? null;
  const mode = settings?.shipping.mode ?? "flat_rate";
  return (
    <div className="grid gap-space-sm sm:grid-cols-2">
      <div className="rounded-md border border-outline-variant/50 bg-surface-container-low p-space-md">
        <p className="text-label-md uppercase tracking-widest text-outline">Standard delivery</p>
        <p className="font-display mt-space-xs text-2xl font-semibold text-primary">
          {mode === "disabled" ? "Unavailable" : mode === "free_shipping" ? "Free" : `₹${formatINR(flat, false).slice(1)}`}
        </p>
        <p className="mt-space-xs text-body-sm text-umber-soft">Pan-India, dispatched from our unit.</p>
      </div>
      <div className="rounded-md border border-outline-variant/50 bg-surface-container-low p-space-md">
        <p className="text-label-md uppercase tracking-widest text-outline">Free shipping</p>
        <p className="font-display mt-space-xs text-2xl font-semibold text-primary">
          {freeAbove != null && mode === "flat_rate" ? `Orders above ₹${formatINR(freeAbove, false).slice(1)}` : "—"}
        </p>
        <p className="mt-space-xs text-body-sm text-umber-soft">
          {freeAbove != null && mode === "flat_rate"
            ? "Automatically applied at checkout."
            : "Charges follow the checkout summary."}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- blocks --------------------------------- */

function BlockCard({ block }: { block: CmsDocumentBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 3 ? (
        <h3 className="font-display text-xl font-semibold text-primary">{renderInline(block.text)}</h3>
      ) : (
        <h2 className="font-display text-2xl font-semibold text-primary">{renderInline(block.text)}</h2>
      );
    case "paragraph":
      return <p className="text-body-md leading-relaxed text-umber-soft">{renderInline(block.text)}</p>;
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className="flex gap-space-sm">
          {block.icon === "check" ? (
            <span aria-hidden className="mt-1 text-on-tertiary-container">
              ✓
            </span>
          ) : (
            <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-deep/60" />
          )}
          <span>
            {item.title ? (
              <span className="font-semibold text-on-surface">{renderInline(item.title)} — </span>
            ) : null}
            {renderInline(item.text)}
          </span>
        </li>
      ));
      return block.ordered ? (
        <ol className="list-none space-y-space-sm text-body-md text-umber-soft">{items}</ol>
      ) : (
        <ul className="list-none space-y-space-sm text-body-md text-umber-soft">{items}</ul>
      );
    }
    case "cards":
      return (
        <div className={`grid gap-space-md ${block.cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {block.items.map((card, i) => (
            <div
              key={i}
              className="rounded-md border border-outline-variant/50 bg-surface-container-low p-space-md"
            >
              <p className="font-display text-lg font-semibold text-primary">{renderInline(card.title)}</p>
              <p className="mt-space-xs text-body-sm leading-relaxed text-umber-soft">{renderInline(card.text)}</p>
            </div>
          ))}
        </div>
      );
    case "note":
      return (
        <aside className="rounded-md border border-gold-deep/30 bg-surface-container px-space-md py-space-md">
          {block.title ? (
            <p className="text-label-md font-semibold uppercase tracking-widest text-primary">{block.title}</p>
          ) : null}
          <p className="mt-space-xs text-body-sm leading-relaxed text-umber-soft">{renderInline(block.text)}</p>
        </aside>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border border-outline-variant/50">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="bg-surface-container-low">
                {block.head.map((h, i) => (
                  <th key={i} className="px-space-md py-space-sm text-left font-semibold text-primary">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-outline-variant/40">
                  {row.map((cell, j) => (
                    <td key={j} className="px-space-md py-space-sm align-top text-umber-soft">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.footnote ? (
            <p className="border-t border-outline-variant/40 bg-surface-container-low px-space-md py-space-xs text-[0.625rem] text-umber-soft">
              {renderInline(block.footnote)}
            </p>
          ) : null}
        </div>
      );
    case "steps":
      return (
        <div className="rounded-md border border-outline-variant/50 bg-surface-container-low p-space-md">
          <p className="font-display text-lg font-semibold text-primary">{renderInline(block.title)}</p>
          <p className="mt-space-xs text-body-sm text-umber-soft">{renderInline(block.intro)}</p>
          <ol className="mt-space-md space-y-space-md">
            {block.items.map((step, i) => (
              <li key={i} className="flex gap-space-md">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[0.75rem] font-bold text-on-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-on-surface">{renderInline(step.label)}</span>{" "}
                  <span className="text-body-sm text-umber-soft">{renderInline(step.text)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "banner":
      return (
        <div className="rounded-md border border-primary/20 bg-primary-container/10 p-space-md">
          <p className="font-display text-lg font-semibold text-primary">{renderInline(block.title)}</p>
          <p className="mt-space-xs text-body-sm leading-relaxed text-umber-soft">{renderInline(block.text)}</p>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-gold-deep/60 bg-surface-container-low px-space-md py-space-md">
          <p className="font-display text-lg italic leading-relaxed text-primary">“{renderInline(block.text)}”</p>
          {block.attribution ? (
            <cite className="mt-space-xs block text-label-sm not-italic text-umber-soft">— {block.attribution}</cite>
          ) : null}
        </blockquote>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-md border border-outline-variant/50">
          {/* CMS images are absolute https or site-rooted paths — plain <img> keeps
              unoptimized delivery identical to the rest of the storefront. */}
          { }
          <img src={block.src} alt={block.alt} className="max-h-[420px] w-full object-cover" loading="lazy" />
          {block.caption ? (
            <figcaption className="bg-surface-container-low px-space-md py-space-xs text-[0.625rem] text-umber-soft">
              {renderInline(block.caption)}
            </figcaption>
          ) : null}
        </figure>
      );
    case "cta":
      return (
        <div className="flex flex-col items-start gap-space-xs rounded-md border border-outline-variant/50 bg-surface-container px-space-md py-space-md sm:flex-row sm:items-center sm:justify-between">
          <div>{block.note ? <p className="text-body-sm text-umber-soft">{renderInline(block.note)}</p> : null}</div>
          <Link
            href={isSafeInlineHref(block.href) ? block.href.trim() : "/contact"}
            className="btn-primary shrink-0 px-space-lg text-label-lg"
          >
            {block.label}
          </Link>
        </div>
      );
    case "divider":
      return <hr className="border-t border-gold-deep/25" />;
    case "shippingTiers":
      return <ShippingTiers />;
    default:
      return null;
  }
}

export function CmsBlocks({ blocks }: { blocks: CmsDocumentBlock[] }) {
  return (
    <div className="space-y-space-lg">
      {blocks.map((block, i) => (
        <BlockCard key={i} block={block} />
      ))}
    </div>
  );
}

/* ------------------------------ document body ------------------------------ */

/** Full heritage document layout: eyebrow, title, lede, optional TOC, sections. */
export function CmsDocument({ page, children }: { page: PublicPageDoc; children?: ReactNode }) {
  const sections = page.content.kind === "document" ? page.content.sections : [];
  const lede = page.content.kind === "document" ? page.content.lede : undefined;
  const hasToc = sections.length > 1;

  return (
    <div className="bg-ivory">
      <div className="mx-auto max-w-7xl px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-3xl">
          <p className="label-eyebrow text-on-tertiary-container">Annaadhya Products</p>
          <h1 className="font-display mt-space-sm text-display-md-mobile lg:text-display-md font-semibold tracking-tight text-primary">
            {page.title}
          </h1>
          {lede ? <p className="mt-space-md text-body-lg leading-relaxed text-umber-soft">{renderLedeParagraphs(lede)}</p> : null}

          {hasToc ? (
            <nav aria-label="On this page" className="mt-space-xl rounded-md border border-outline-variant/50 bg-surface-container-low p-space-md">
              <p className="text-label-md font-semibold uppercase tracking-widest text-outline">On this page</p>
              <ul className="mt-space-sm grid gap-space-xs sm:grid-cols-2">
                {sections.map((s, i) => (
                  <li key={s.id ?? i}>
                    <a
                      href={`#${s.id ?? `section-${i + 1}`}`}
                      className="text-body-sm text-primary underline-offset-2 transition-colors hover:underline"
                    >
                      {s.toc ?? s.title ?? `Section ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <div className="mt-space-xl space-y-space-xl">
            {sections.map((section, i) => (
              <SectionView key={section.id ?? i} section={section} index={i} />
            ))}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionView({ section, index }: { section: CmsSection; index: number }) {
  return (
    <section id={section.id ?? `section-${index + 1}`} className="scroll-mt-28 space-y-space-lg">
      {section.eyebrow ? (
        <p className="label-eyebrow text-on-tertiary-container">{section.eyebrow}</p>
      ) : null}
      {section.title ? (
        <h2 className="font-display text-2xl font-semibold text-primary lg:text-3xl">{section.title}</h2>
      ) : null}
      <CmsBlocks blocks={section.blocks} />
    </section>
  );
}
