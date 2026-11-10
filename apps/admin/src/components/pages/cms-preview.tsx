"use client";
/**
 * Read-only storefront preview for the Pages editor.
 *
 * FIDELITY CONTRACT (the "preview ≠ live page" fix): for the built-in designed
 * pages (Our Story /about, Contact) the preview renders through the SAME slot
 * mapping and approved fallback copy the storefront uses — both single-sourced
 * in @annaadhya/contracts/cms-design. Each slot shows the resolved copy (the
 * admin's text when present, the approved default marked with a pill when the
 * part is empty), in the exact order the live page renders it. What the admin
 * previews here is what the storefront will render, so publishing never
 * surprises.
 *
 * Generic document/FAQ pages keep the faithful-but-simple stacked mapping of
 * the SAME state the editor edits. Inline markup (**bold**, *italic*,
 * [label](/href)) is parsed everywhere with the shared tokenizer, exactly like
 * the storefront renderer.
 */
import { useMemo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  resolveContactPreview,
  resolveOurStoryPreview,
  tokenizeInline,
  type InlineToken,
  type PreviewPart,
  type PreviewSlot,
} from "@annaadhya/contracts/cms-design";
import type { CmsDocumentBlock, CmsPageContent, PageStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import type { ShippingFigures } from "./blocks-editor";

/* ----------------------------- inline markup ------------------------------ */

/** Render the tiny CMS markup exactly like the storefront's renderInline —
 *  same tokenizer, same degrade-to-plain-text policy for unsafe links. Links
 *  are shown without navigation (the preview must not walk the admin off the
 *  editor); the live href is surfaced via title. */
function InlineText({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((token: InlineToken, i) => {
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
            return (
              <span
                key={i}
                title={`Link → ${token.href}`}
                className="cursor-help font-medium text-primary underline underline-offset-2"
              >
                {token.label}
              </span>
            );
          default:
            return <span key={i}>{token.text}</span>;
        }
      })}
    </>
  );
}

function InlineOrEmpty({ text, emptyLabel }: { text: string; emptyLabel: string }) {
  return text ? <InlineText text={text} /> : <em>{emptyLabel}</em>;
}

function BlockPreview({ block, shipping }: { block: CmsDocumentBlock; shipping: ShippingFigures | null }) {
  switch (block.type) {
    case "heading":
      return block.level === 3 ? (
        <h3 className="font-heritage-display text-lg font-semibold text-primary">
          <InlineOrEmpty text={block.text} emptyLabel="untitled heading" />
        </h3>
      ) : (
        <h2 className="font-heritage-display text-xl font-semibold text-primary">
          <InlineOrEmpty text={block.text} emptyLabel="untitled heading" />
        </h2>
      );
    case "paragraph":
      return (
        <p className="text-[13px] leading-relaxed text-on-surface-variant">
          <InlineOrEmpty text={block.text} emptyLabel="empty paragraph" />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className="flex gap-2">
          {block.icon === "check" ? (
            <span aria-hidden className="mt-0.5 shrink-0 text-secondary">
              ✓
            </span>
          ) : block.ordered ? (
            <span aria-hidden className="shrink-0 font-semibold text-primary">
              {i + 1}.
            </span>
          ) : (
            <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-tertiary-fixed-dim" />
          )}
          <span className="min-w-0">
            {item.title ? <span className="font-semibold text-on-surface">{item.title} — </span> : null}
            <InlineOrEmpty text={item.text} emptyLabel="empty item" />
          </span>
        </li>
      ));
      return block.ordered ? (
        <ol className="list-none space-y-1.5 pl-1 text-[13px] text-on-surface-variant">{items}</ol>
      ) : (
        <ul className="list-none space-y-1.5 pl-1 text-[13px] text-on-surface-variant">{items}</ul>
      );
    }
    case "cards":
      return (
        <div className={`grid gap-2 ${block.cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {block.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-3">
              {item.icon ? <span className="text-base">{item.icon}</span> : null}
              <p className="font-heritage-display text-sm font-semibold text-primary">
                <InlineOrEmpty text={item.title} emptyLabel="Untitled card" />
              </p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                <InlineOrEmpty text={item.text} emptyLabel="empty card" />
              </p>
            </div>
          ))}
        </div>
      );
    case "note":
      return (
        <div className="rounded-lg border border-tertiary-fixed-dim/60 bg-tertiary-fixed/30 p-3">
          {block.title ? <p className="font-semibold text-on-tertiary-fixed"><InlineText text={block.title} /></p> : null}
          <p className="text-[13px] text-on-surface-variant">
            <InlineOrEmpty text={block.text} emptyLabel="empty note" />
          </p>
        </div>
      );
    case "table":
      return (
        <div className="overflow-hidden rounded-lg border border-outline-variant/40">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-surface-container-low">
                {block.head.map((cell, i) => (
                  <th key={i} className="px-2.5 py-2 font-semibold text-on-surface">
                    {cell || <em>—</em>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.length === 0 ? (
                <tr>
                  <td className="px-2.5 py-2 italic text-on-surface-variant/70" colSpan={Math.max(block.head.length, 1)}>
                    No rows yet
                  </td>
                </tr>
              ) : (
                block.rows.map((row, i) => (
                  <tr key={i} className="border-t border-outline-variant/30">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2.5 py-2 align-top text-on-surface-variant">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {block.footnote ? (
            <p className="border-t border-outline-variant/40 bg-surface-container-low px-2.5 py-1.5 text-[10px] text-on-surface-variant">
              <InlineText text={block.footnote} />
            </p>
          ) : null}
        </div>
      );
    case "steps":
      return (
        <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
          <p className="font-heritage-display text-base font-semibold text-primary">{block.title || "Steps"}</p>
          {block.intro ? <p className="mt-1 text-xs text-on-surface-variant"><InlineText text={block.intro} /></p> : null}
          <ol className="mt-3 space-y-2.5">
            {block.items.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
                  {i + 1}
                </span>
                <span className="text-[13px]">
                  <span className="font-semibold text-on-surface">{step.label || "Step"}</span>{" "}
                  <span className="text-on-surface-variant">
                    <InlineOrEmpty text={step.text} emptyLabel="empty step" />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "banner":
      return (
        <div className="rounded-lg border border-primary/20 bg-primary-container/10 p-3">
          <p className="font-heritage-display text-base font-semibold text-primary">
            <InlineOrEmpty text={block.title} emptyLabel="Banner" />
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
            <InlineOrEmpty text={block.text} emptyLabel="empty banner" />
          </p>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-tertiary-fixed-dim bg-surface-container-low px-3 py-3">
          <p className="font-heritage-display text-base italic leading-relaxed text-primary">
            “<InlineOrEmpty text={block.text} emptyLabel="empty quote" />”
          </p>
          {block.attribution ? <cite className="mt-1 block text-[11px] not-italic text-on-surface-variant">— <InlineText text={block.attribution} /></cite> : null}
        </blockquote>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-lg border border-outline-variant/50">
          {block.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- CMS URLs are absolute https or site-rooted; plain <img> mirrors the storefront
            <img src={block.src} alt={block.alt} className="max-h-64 w-full bg-surface-container-low object-cover" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-surface-container-low text-xs italic text-on-surface-variant">
              No image URL yet
            </div>
          )}
          {block.caption ? <figcaption className="bg-surface-container-low px-3 py-1.5 text-[10px] text-on-surface-variant"><InlineText text={block.caption} /></figcaption> : null}
        </figure>
      );
    case "cta":
      return (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-outline-variant/50 bg-surface-container px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-on-surface-variant">{block.note ? <InlineText text={block.note} /> : "\u00A0"}</p>
          <span className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary shadow-sm">
            {block.label || "Button"}
          </span>
        </div>
      );
    case "divider":
      return <hr className="border-t border-tertiary-fixed-dim/60" />;
    case "shippingTiers":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
            <p className="label-eyebrow text-outline">Standard delivery</p>
            <p className="font-heritage-display mt-1 text-xl font-semibold text-primary">
              {!shipping ? "—" : shipping.mode === "disabled" ? "Unavailable" : shipping.mode === "free_shipping" ? "Free" : shipping.flatLabel}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">Pan-India, dispatched from our unit.</p>
          </div>
          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
            <p className="label-eyebrow text-outline">Free shipping</p>
            <p className="font-heritage-display mt-1 text-xl font-semibold text-primary">
              {shipping && shipping.mode === "flat_rate" && shipping.freeAboveLabel ? shipping.freeAboveLabel : "—"}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {shipping && shipping.mode === "flat_rate" && shipping.freeAboveLabel
                ? "Automatically applied at checkout."
                : "Charges follow the checkout summary."}
            </p>
          </div>
        </div>
      );
  }
}

/* --------------------------- built-in slot preview -------------------------- */

function partToneClass(tone: PreviewPart["tone"]): string {
  switch (tone) {
    case "eyebrow":
      return "text-[11px] font-bold uppercase tracking-widest text-secondary";
    case "headline":
      return "font-heritage-display text-base font-semibold text-primary";
    case "button":
      return "text-[13px] font-semibold text-primary";
    default:
      return "text-[13px] leading-relaxed text-on-surface-variant";
  }
}

function SlotPartRow({ part }: { part: PreviewPart }) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-outline">
        {part.label}
        {part.isFallback ? (
          <span className="rounded-full bg-surface-container-high px-1.5 py-px text-[9px] font-semibold normal-case tracking-normal text-on-surface-variant">
            approved default
          </span>
        ) : null}
      </p>
      {part.text != null ? (
        <p className={`mt-0.5 ${partToneClass(part.tone)}`}>
          <InlineText text={part.text} />
        </p>
      ) : null}
      {part.paragraphs?.map((p, i) => (
        <p key={i} className={`mt-1 ${partToneClass(part.tone)}`}>
          <InlineText text={p} />
        </p>
      ))}
      {part.items ? (
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {part.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-2.5 py-1.5">
              {item.title ? (
                <p className="text-[13px] font-semibold text-on-surface">
                  <InlineText text={item.title} />
                </p>
              ) : null}
              <p className="text-xs leading-relaxed text-on-surface-variant">
                <InlineText text={item.text} />
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The designed page rendered slot by slot, in the live order, with the
 *  resolved copy. Clicking a slot jumps to its source section in the editor. */
function BuiltInSlotPreview({
  slots,
  shipping,
  onSectionClick,
}: {
  slots: PreviewSlot[];
  shipping: ShippingFigures | null;
  onSectionClick?: (sectionIndex: number) => void;
}) {
  return (
    <div className="space-y-3">
      {slots.map((slot) => {
        const jump =
          onSectionClick && slot.sourceIndex !== null ? () => onSectionClick(slot.sourceIndex as number) : null;
        return (
          <section
            key={slot.key}
            role={jump ? "button" : undefined}
            tabIndex={jump ? 0 : undefined}
            onClick={jump ?? undefined}
            onKeyDown={jump ? jumpKey(jump) : undefined}
            aria-label={jump ? `Edit the section that fills “${slot.label}”` : slot.label}
            title={jump ? "Click to edit this section" : undefined}
            className={`rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 ${
              jump
                ? "cursor-pointer transition-colors hover:bg-primary/5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                : ""
            }`}
          >
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-heritage-display text-sm font-semibold text-primary">{slot.label}</span>
              {slot.anchorId ? (
                <span className="rounded-full bg-secondary-container px-2 py-0.5 font-mono text-[10px] font-semibold text-on-secondary-container">
                  {slot.anchorId}
                </span>
              ) : (
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  not from CMS
                </span>
              )}
            </p>
            {slot.eyebrow || slot.sectionTitle ? (
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {slot.eyebrow ? <span className="font-semibold">{slot.eyebrow}</span> : null}
                {slot.eyebrow && slot.sectionTitle ? " — " : null}
                {slot.sectionTitle}
              </p>
            ) : null}
            {slot.blocks ? (
              <div className="mt-2 space-y-2">
                {slot.blocks.map((block, i) => (
                  <BlockPreview key={i} block={block} shipping={shipping} />
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                {slot.parts.map((part, i) => (
                  <SlotPartRow key={i} part={part} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Accessible click target for flow content (sections hold headings/divs, so
 *  a real <button> would violate its phrasing-content model). */
function jumpKey(handler: () => void) {
  return (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

export function CmsPreview({
  title,
  pageType,
  status,
  content,
  shipping,
  builtinSlug,
  onSectionClick,
  onEntryClick,
}: {
  title: string;
  pageType: "document" | "faq";
  status: PageStatus;
  content: CmsPageContent;
  shipping: ShippingFigures | null;
  /** Set for built-in designed pages — switches the preview to the slot-accurate
   *  mode that mirrors the storefront design ("our-story", "contact"). */
  builtinSlug?: string;
  /** Preview-as-navigation: click a section to scroll the editor to it. */
  onSectionClick?: (sectionIndex: number) => void;
  /** Same affordance for FAQ entries. */
  onEntryClick?: (entryIndex: number) => void;
}) {
  const interactive = Boolean(onSectionClick || onEntryClick);
  const slotMode = builtinSlug === "our-story" || builtinSlug === "contact";

  const slots: PreviewSlot[] = useMemo(() => {
    if (!slotMode || content.kind !== "document") return [];
    return builtinSlug === "our-story"
      ? resolveOurStoryPreview(title, content)
      : resolveContactPreview(title, content);
  }, [slotMode, builtinSlug, title, content]);

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface-container-low px-4 py-2.5">
        <span className="min-w-0">
          <span className="label-eyebrow block text-on-surface-variant">Storefront preview</span>
          {slotMode ? (
            <span className="mt-0.5 block text-[10px] text-on-surface-variant/80">
              The designed page, slot by slot — “approved default” means that part is empty, so the shipped
              copy shows{interactive ? " · click a part to edit its section" : ""}
            </span>
          ) : interactive ? (
            <span className="mt-0.5 block text-[10px] text-on-surface-variant/80">
              Click a {pageType === "faq" ? "question" : "section"} to jump to it in the editor
            </span>
          ) : null}
        </span>
        <Badge tone={status === "published" ? "green" : status === "draft" ? "amber" : "neutral"}>{status}</Badge>
      </div>
      <div className="scroll-slim max-h-[70vh] space-y-5 overflow-y-auto bg-cream/60 px-5 py-5">
        <p className="label-eyebrow text-on-tertiary-container">Annaadhya Products</p>
        <h1 className="font-heritage-display text-2xl font-semibold tracking-tight text-primary">
          {title || <em>Untitled page</em>}
        </h1>

        {slotMode && content.kind === "document" ? (
          <>
            <BuiltInSlotPreview slots={slots} shipping={shipping} onSectionClick={onSectionClick} />
            <p className="border-t border-outline-variant/30 pt-3 text-[10px] text-on-surface-variant/70">
              Slot-accurate preview of /{builtinSlug === "our-story" ? "about" : "contact"} · imagery, icons and
              buttons render fully on the live storefront
            </p>
          </>
        ) : content.kind === "document" ? (
          <>
            {content.lede ? (
              <div className="space-y-2 text-sm leading-relaxed text-on-surface-variant">
                {content.lede
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>
                      <InlineText text={p} />
                    </p>
                  ))}
              </div>
            ) : null}
            {content.sections.map((section, i) => {
              const jump = onSectionClick ? () => onSectionClick(i) : null;
              return (
                <section
                  key={i}
                  role={jump ? "button" : undefined}
                  tabIndex={jump ? 0 : undefined}
                  onClick={jump ?? undefined}
                  onKeyDown={jump ? jumpKey(jump) : undefined}
                  aria-label={jump ? `Edit section ${i + 1}${section.title ? `: ${section.title}` : ""}` : undefined}
                  title={jump ? "Click to edit this section" : undefined}
                  className={`space-y-3 border-t border-outline-variant/30 pt-4 first:border-t-0 first:pt-0 ${
                    jump
                      ? "-mx-2 cursor-pointer rounded-xl px-2 py-1 transition-colors hover:bg-primary/5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      : ""
                  }`}
                >
                  {section.eyebrow ? <p className="label-eyebrow text-secondary"><InlineText text={section.eyebrow} /></p> : null}
                  {section.title ? (
                    <h2 className="font-heritage-display text-lg font-semibold text-primary">
                      <InlineOrEmpty text={section.title} emptyLabel="untitled section" />
                    </h2>
                  ) : null}
                  <div className="space-y-3">
                    {(section.blocks ?? []).map((block, j) => (
                      <BlockPreview key={j} block={block} shipping={shipping} />
                    ))}
                    {(section.blocks ?? []).length === 0 ? (
                      <p className="text-xs italic text-on-surface-variant/70">Empty section</p>
                    ) : null}
                  </div>
                </section>
              );
            })}
            {content.sections.length === 0 ? (
              <p className="text-xs italic text-on-surface-variant/70">No sections yet.</p>
            ) : null}
          </>
        ) : (
          <>
            {content.intro ? (
              <div className="space-y-2 text-sm leading-relaxed text-on-surface-variant">
                {content.intro
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>
                      <InlineText text={p} />
                    </p>
                  ))}
              </div>
            ) : null}
            <div className="space-y-2.5">
              {content.entries.map((entry, i) => {
                const jump = onEntryClick ? () => onEntryClick(i) : null;
                return (
                  <div
                    key={i}
                    role={jump ? "button" : undefined}
                    tabIndex={jump ? 0 : undefined}
                    onClick={jump ?? undefined}
                    onKeyDown={jump ? jumpKey(jump) : undefined}
                    aria-label={jump ? `Edit question ${i + 1}` : undefined}
                    title={jump ? "Click to edit this question" : undefined}
                    className={`rounded-lg border bg-surface-container-lowest p-3 ${
                      jump
                        ? "cursor-pointer border-outline-variant/40 transition-colors hover:bg-primary/5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        : "border-outline-variant/40"
                    }`}
                  >
                    <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">
                      {entry.category}
                    </span>
                    <p className="font-heritage-display mt-1.5 text-sm font-semibold text-primary">
                      {entry.question || <em>Untitled question</em>}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
                      <InlineOrEmpty text={entry.answer} emptyLabel="Empty answer" />
                    </p>
                  </div>
                );
              })}
              {content.entries.length === 0 ? (
                <p className="text-xs italic text-on-surface-variant/70">No questions yet.</p>
              ) : null}
            </div>
          </>
        )}

        <p className="border-t border-outline-variant/30 pt-3 text-[10px] text-on-surface-variant/70">
          {slotMode
            ? `Mirrors the designed ${builtinSlug === "our-story" ? "Our Story" : "Contact"} page`
            : `Approximation of the ${pageType === "faq" ? "FAQ" : "document"} layout`}{" "}
          · inline markup renders on the live storefront
        </p>
      </div>
    </div>
  );
}
