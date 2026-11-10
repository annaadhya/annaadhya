"use client";

/**
 * FaqExplorer — the interactive FAQ surface from the approved Stitch design.
 * Server-rendered HTML (client component for the search / category / accordion
 * state), one instance per page. Shared chrome (announcement strip, header,
 * footer) comes from the (shop) layout — this component never renders them.
 *
 * Interactions:
 *  - live search across question + answer text (trimmed, case-insensitive)
 *  - category pills combined with search ("All Questions" resets the category)
 *  - accessible accordions: <button> triggers, aria-expanded / aria-controls,
 *    keyboard operable, reduced-motion handled by the global stylesheet
 *  - a truthful no-results state pointing at /contact
 */

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { categorySlugFromHref } from "@/lib/navigation-guard";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconChevronDown,
  IconGift,
  IconHeadset,
  IconMail,
  IconClock,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconSearchOff,
  IconShoppingBag,
  IconSprout,
  IconTruck,
  IconUser,
  IconWallet,
  IconX,
} from "@/components/icons";
import {
  faqAnswerPlainText,
  FAQ_CATEGORIES,
  FAQ_ENTRIES,
  FAQ_POPULAR_SEARCHES,
  type FaqCategoryId,
  type FaqEntry,
} from "@/lib/faq-content";

type Filter = FaqCategoryId | "all";

interface AnswerSegment {
  text: string;
  link?: { label: string; href: string };
}

/** Split "…[label](/href)…" tokens into renderable segments. */
function parseAnswer(answer: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(answer)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: answer.slice(cursor, match.index) });
    }
    segments.push({ text: match[1], link: { label: match[1], href: match[2] } });
    cursor = match.index + match[0].length;
  }
  if (cursor < answer.length) {
    segments.push({ text: answer.slice(cursor) });
  }
  return segments;
}

function AnswerText({ answer, liveCategorySlugs }: { answer: string; liveCategorySlugs: Set<string> | null }) {
  return (
    <>
      {parseAnswer(answer).map((segment, i) => {
        if (!segment.link) return <span key={i}>{segment.text}</span>;
        // Deletion doctrine: a link to a category that is not verifiably live
        // renders as plain text — never a 404, never a resurrected category.
        const linkedSlug = categorySlugFromHref(segment.link.href);
        const dead =
          linkedSlug !== null && (liveCategorySlugs === null || !liveCategorySlugs.has(linkedSlug));
        return dead ? (
          <span key={i}>{segment.link.label}</span>
        ) : (
          <Link
            key={i}
            href={segment.link.href}
            className="font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-tertiary-container"
          >
            {segment.link.label}
          </Link>
        );
      })}
    </>
  );
}

const GROUP_ICONS: Record<FaqCategoryId, typeof IconPackage> = {
  orders: IconPackage,
  shipping: IconTruck,
  payments: IconWallet,
  products: IconSprout,
  returns: IconRefresh,
  gifts: IconGift,
  account: IconUser,
};

function FaqRow({
  entry,
  open,
  onToggle,
  liveCategorySlugs,
}: {
  entry: FaqEntry;
  open: boolean;
  onToggle: (id: string) => void;
  liveCategorySlugs: Set<string> | null;
}) {
  return (
    <article className="overflow-hidden rounded-md bg-surface-container-lowest shadow-sm transition-shadow duration-200 hover:shadow-md">
      <h3>
        <button
          type="button"
          id={`faq-trigger-${entry.id}`}
          aria-expanded={open}
          aria-controls={`faq-panel-${entry.id}`}
          onClick={() => onToggle(entry.id)}
          className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
        >
          <span className="text-body-lg font-semibold leading-snug text-on-surface">{entry.question}</span>
          <span
            aria-hidden
            className={`shrink-0 text-tertiary-container transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <IconChevronDown size={22} />
          </span>
        </button>
      </h3>
      <div
        id={`faq-panel-${entry.id}`}
        role="region"
        aria-labelledby={`faq-trigger-${entry.id}`}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* inert while collapsed: clipped links must not sit in the tab order
            or the accessibility tree while aria-expanded is false. */}
        <div className="overflow-hidden" inert={!open}>
          <div className="px-5 pb-5 sm:px-6">
            <div className="rounded-sm bg-surface-container-low/50 p-4">
              <p className="text-body-md leading-relaxed text-on-surface-variant">
                <AnswerText answer={entry.answer} liveCategorySlugs={liveCategorySlugs} />
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function FaqExplorer({
  supportEmail,
  entries = FAQ_ENTRIES,
  liveCategorySlugs = null,
}: {
  supportEmail: string | null;
  /** Admin-managed FAQ entries (CMS) override the built-in set when provided. */
  entries?: FaqEntry[];
  /** Live category slugs from the server page — answer links to categories that
   *  are not verifiably live render as plain text (deletions never resurrect). */
  liveCategorySlugs?: Set<string> | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim().toLowerCase();

  const categoryCounts = useMemo(() => {
    const counts = new Map<FaqCategoryId, number>();
    for (const entry of entries) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  const visibleGroups = useMemo(() => {
    return FAQ_CATEGORIES.map((category) => {
      const groupEntries = entries.filter(
        (entry) =>
          entry.category === category.id &&
          (filter === "all" || filter === entry.category) &&
          (trimmedQuery === "" ||
            `${entry.question} ${faqAnswerPlainText(entry.answer)}`.toLowerCase().includes(trimmedQuery)),
      );
      return { category, entries: groupEntries };
    }).filter((group) => group.entries.length > 0);
  }, [entries, filter, trimmedQuery]);

  const totalMatches = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.entries.length, 0),
    [visibleGroups],
  );

  const isFiltering = trimmedQuery !== "" || filter !== "all";

  function toggleEntry(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  function resetView() {
    setQuery("");
    setFilter("all");
  }

  return (
    <div className="bg-surface">
      {/* ==================== SECTION A+B: HERO + SEARCH ==================== */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-container-low/70 via-surface to-surface" aria-hidden />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-margin-mobile pb-space-xl pt-space-lg text-center lg:pt-space-xl">
          {/* Eyebrow with antique-gold motifs */}
          <div className="mb-3 flex items-center gap-3">
            <svg className="h-2 w-6 text-tertiary-fixed-dim" viewBox="0 0 24 8" fill="currentColor" aria-hidden>
              <circle cx="2" cy="4" r="2" />
              <rect x="8" y="3.25" width="16" height="1.5" rx="0.75" />
            </svg>
            <span className="text-label-sm font-bold uppercase tracking-[0.25em] text-tertiary-container">
              Here to help
            </span>
            <svg className="h-2 w-6 text-tertiary-fixed-dim" viewBox="0 0 24 8" fill="currentColor" aria-hidden>
              <rect x="0" y="3.25" width="16" height="1.5" rx="0.75" />
              <circle cx="22" cy="4" r="2" />
            </svg>
          </div>

          <h1 className="text-display-lg-mobile font-semibold tracking-tight text-primary lg:text-display-lg">
            Questions? We&apos;ve Got Answers.
          </h1>
          <p className="mt-4 max-w-2xl text-body-lg leading-relaxed text-on-surface-variant">
            From choosing your pantry favourites to tracking your order, find clear, thoughtful answers
            to the questions our customers ask most.
          </p>

          {/* Search */}
          <form
            role="search"
            className="mt-8 w-full max-w-2xl"
            onSubmit={(event) => event.preventDefault()}
          >
            <label htmlFor="faq-search" className="sr-only">
              Search frequently asked questions
            </label>
            <div className="relative flex items-center rounded-md bg-surface-container-lowest shadow-md focus-within:ring-2 focus-within:ring-primary-container">
              <IconSearch size={22} className="pointer-events-none absolute left-4 text-tertiary-container" aria-hidden />
              <input
                ref={searchRef}
                id="faq-search"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for answers… (e.g., tracking, saffron, returns, delivery)"
                className="w-full rounded-md bg-surface-container-lowest py-4 pl-12 pr-12 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant"
              />
              {query !== "" && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 rounded-full p-1.5 text-on-surface-variant transition-colors hover:text-primary"
                >
                  <IconX size={18} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-left sm:text-center">
              <span className="text-label-sm text-on-surface-variant">
                Popular searches:{" "}
                {FAQ_POPULAR_SEARCHES.map((term, i) => (
                  <span key={term}>
                    <button
                      type="button"
                      onClick={() => setQuery(term)}
                      className="underline underline-offset-2 transition-colors hover:text-primary"
                    >
                      {term}
                    </button>
                    {i < FAQ_POPULAR_SEARCHES.length - 1 ? ", " : ""}
                  </span>
                ))}
              </span>
              {isFiltering ? (
                <span role="status" className="text-label-sm font-semibold text-primary">
                  {totalMatches} {totalMatches === 1 ? "answer" : "answers"}
                </span>
              ) : null}
            </div>
          </form>
        </div>
      </section>

      {/* ======================= CONTENT CANVAS ======================= */}
      <div className="mx-auto max-w-5xl px-margin-mobile pb-space-xl lg:px-margin">
        {/* Section C: category pills */}
        <nav
          aria-label="FAQ categories"
          className="w-full overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max items-center justify-start gap-2 rounded-full bg-surface-container-low p-1 md:justify-center">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-label-lg transition-all duration-200 ${
                filter === "all"
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-primary"
              }`}
            >
              <span>All Questions</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  filter === "all"
                    ? "bg-primary-container text-on-primary-fixed"
                    : "bg-surface-container-highest text-on-surface"
                }`}
              >
                {FAQ_ENTRIES.length}
              </span>
            </button>
            {FAQ_CATEGORIES.map((category) => {
              const active = filter === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(category.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-label-lg transition-all duration-200 ${
                    active
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-primary"
                  }`}
                >
                  <span>{category.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                      active
                        ? "bg-primary-container text-on-primary-fixed"
                        : "bg-surface-container-highest text-on-surface"
                    }`}
                  >
                    {categoryCounts.get(category.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* No-results state */}
        {totalMatches === 0 ? (
          <div
            role="status"
            className="mx-auto my-8 flex w-full max-w-xl flex-col items-center rounded-md bg-surface-container-lowest p-8 text-center shadow-md"
          >
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
              <IconSearchOff size={28} aria-hidden />
            </div>
            <h2 className="mb-2 font-display text-headline-sm font-bold text-primary">
              We couldn&apos;t find an answer.
            </h2>
            <p className="mb-6 max-w-md text-body-md leading-relaxed text-on-surface-variant">
              Try another search or get in touch with our team.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetView}
                className="rounded-sm bg-surface-container px-5 py-2.5 text-label-lg text-on-surface transition-colors hover:bg-surface-container-highest"
              >
                Clear search
              </button>
              <Link
                href="/contact"
                className="flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-label-lg font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
              >
                Contact us
                <IconArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          /* Section D: accordion groups */
          <div className="flex flex-col gap-10">
            {visibleGroups.map(({ category, entries }) => {
              const GroupIcon = GROUP_ICONS[category.id];
              return (
                <section
                  key={category.id}
                  aria-labelledby={`faq-group-${category.id}`}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-3 pb-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-container-high text-primary">
                      <GroupIcon size={20} aria-hidden />
                    </div>
                    <h2
                      id={`faq-group-${category.id}`}
                      className="min-w-0 font-display text-headline-sm font-semibold text-primary sm:text-headline-md"
                    >
                      {category.heading}
                    </h2>
                    <span className="ml-auto shrink-0 text-label-sm uppercase tracking-wider text-on-surface-variant">
                      {entries.length} {entries.length === 1 ? "question" : "questions"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {entries.map((entry) => (
                      <FaqRow
                        key={entry.id}
                        entry={entry}
                        open={openIds.has(entry.id)}
                        onToggle={toggleEntry}
                        liveCategorySlugs={liveCategorySlugs}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* =================== CONCIERGE ASSISTANCE CARD =================== */}
        <section aria-labelledby="faq-cta-heading" className="mt-16">
          <div className="flex flex-col gap-8 overflow-hidden rounded-lg bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-high p-8 shadow-md lg:flex-row lg:items-center lg:justify-between lg:p-10">
            <div className="max-w-xl">
              <span className="mb-3 inline-flex items-center gap-2 text-label-sm font-bold uppercase tracking-wider text-on-tertiary-container">
                <span className="size-1.5 rounded-full bg-on-tertiary-container" aria-hidden />
                Concierge assistance
              </span>
              <h2
                id="faq-cta-heading"
                className="font-display text-headline-md font-semibold text-primary sm:text-headline-lg"
              >
                Still Have a Question?
              </h2>
              <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                If you couldn&apos;t find what you were looking for, we&apos;re here to help.
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  <IconClock size={16} className="shrink-0 text-on-tertiary-container" aria-hidden />
                  <span>We reply within one working day, Monday to Saturday.</span>
                </span>
                <span className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                  <IconMail size={16} className="shrink-0 text-on-tertiary-container" aria-hidden />
                  {supportEmail ? (
                    <a
                      href={`mailto:${supportEmail}`}
                      className="break-all font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-tertiary-container"
                    >
                      {supportEmail}
                    </a>
                  ) : (
                    <span>The message form is the fastest way to reach us right now.</span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                href="/contact"
                className="flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-label-lg font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
              >
                <IconHeadset size={18} aria-hidden />
                Contact Us
              </Link>
              <Link
                href="/shop"
                className="flex items-center gap-2 rounded-sm border border-outline-variant bg-surface-container-lowest px-6 py-3 text-label-lg font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              >
                <IconShoppingBag size={18} aria-hidden />
                Browse Pantry Catalogue
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== HONESTY CLOSING NOTE ===================== */}
        <div className="mx-auto mt-16 flex max-w-2xl flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px w-10 bg-gold-deep/50" aria-hidden />
            <span className="flex items-center gap-1.5 text-label-sm font-bold uppercase tracking-widest text-on-tertiary-container">
              <IconBadgeCheck size={15} aria-hidden />
              Honestly described
            </span>
            <span className="h-px w-10 bg-gold-deep/50" aria-hidden />
          </div>
          <p className="text-body-md leading-relaxed text-on-surface-variant">
            Every claim we publish is backed by supplier documentation for the batch on sale — and what
            is still pending verification, we say so plainly.
          </p>
        </div>
      </div>
    </div>
  );
}
