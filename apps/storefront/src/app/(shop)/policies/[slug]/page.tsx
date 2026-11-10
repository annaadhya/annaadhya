import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPage, getPublicSettings } from "@/lib/api";
import { POLICIES, POLICY_ORDER, type PolicyDoc } from "@/lib/policies";
import { PolicyBlockRenderer } from "@/components/policy/policy-blocks";
import { PolicyToc } from "@/components/policy/policy-toc";
import { CmsBlocks, renderLedeParagraphs } from "@/components/blocks/document-blocks";
import {
  IconBadgeCheck,
  IconChevronRight,
  IconHouse,
  IconMail,
  IconPenLine,
  IconRefresh,
  IconShieldCheck,
  IconTruck,
} from "@/components/icons";

/**
 * Policy pages — the approved Stitch document design (breadcrumb, editorial
 * header, policy switcher, sticky table of contents, numbered article cards,
 * related-policies band).
 *
 * ADMIN EDITS WEAR THE DESIGN: an admin's explicitly saved page content (the
 * API marks such docs `adminEdited`) flows INTO this approved layout — title,
 * lede, sections and blocks replace the built-in article content while the
 * header chrome, switcher, TOC, help cards and related band stay. The
 * boot-seeded mirror of the shipped copy (adminEdited: false) never hijacks
 * the designed page — that was the "ugly takeover" bug.
 *
 * Truth rules carried from lib/policies.ts:
 *  - shipping figures render LIVE from public settings (same source as cart +
 *    checkout), never hardcoded;
 *  - no invented contacts, couriers, dates or automation — the help cards
 *    route to the real contact workflow;
 *  - unknown slugs fall through to the site-wide not-found experience.
 */

/** Icons for the switcher chips + aside badge, keyed by policy slug. */
const SWITCHER_ICONS: Record<PolicyDoc["slug"], typeof IconTruck> = {
  shipping: IconTruck,
  returns: IconRefresh,
  privacy: IconShieldCheck,
  terms: IconPenLine,
};

function formatReviewDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

function isoDateFromMillis(ms: number | undefined): string {
  const d = ms ? new Date(ms) : new Date();
  return d.toISOString().slice(0, 10);
}

export function generateStaticParams() {
  return POLICY_ORDER.map((slug) => ({ slug }));
}

/** ISR keeps the built-in policy rendering fresh; the CMS branch (Admin → Pages)
 *  refreshes via the same window plus the API's on-demand revalidation push. */
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cmsPage = await getPage(slug);
  // Only an admin's explicitly saved content (pages.service marks such docs
  // `adminEdited`) may override the approved policy metadata — the boot-seeded
  // mirror of the shipped copy must never hijack the designed page.
  if (cmsPage?.adminEdited) {
    return {
      title: cmsPage.seo?.title || cmsPage.title,
      description: cmsPage.seo?.description || undefined,
    };
  }
  const policy = POLICIES[slug];
  if (!policy) return { title: "Policy" };
  return {
    title: policy.title,
    description: policy.description,
    openGraph: {
      title: `${policy.title} | Annaadhya Products`,
      description: policy.description,
      type: "website",
      siteName: "Annaadhya Products",
    },
  };
}

/** One article card in the approved numbered-section style. Blocks arrive
 *  pre-rendered (built-in PolicyBlocks vs CMS CmsBlocks differ in renderer). */
function ArticleCard({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <article id={id} className="scroll-mt-32 rounded-xl bg-surface-container-lowest p-6 shadow-[0_1px_12px_rgba(39,24,16,0.03)] sm:p-8">
      <div className="mb-space-xs flex items-center gap-space-xs font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary-container">
        <span>{eyebrow}</span>
      </div>
      {title ? (
        <h2 className="mb-space-md font-display font-medium text-primary text-headline-md">{title}</h2>
      ) : null}
      <div className="space-y-4 font-body-md text-body-md leading-relaxed text-on-surface">{children}</div>
    </article>
  );
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy: PolicyDoc | undefined = POLICIES[slug];
  if (!policy) notFound();

  const [settings, cmsPage] = await Promise.all([getPublicSettings(), getPage(slug)]);
  const shipping = settings?.shipping ?? null;

  // Admin-published CMS version wears the SAME approved design — its title/lede
  // land in the editorial header and its sections render as the numbered article
  // cards. Only an explicit admin save (adminEdited) with document content and
  // at least one block takes over; the boot-seeded mirror never does.
  const cmsSections =
    cmsPage?.adminEdited && cmsPage.content.kind === "document"
      ? cmsPage.content.sections.filter((s) => (s.blocks ?? []).length > 0)
      : [];
  const cmsOwnsContent = Boolean(cmsPage?.adminEdited) && cmsSections.length > 0;

  const headerTitle = cmsOwnsContent && cmsPage ? cmsPage.title : policy.title;
  const headerLede =
    cmsOwnsContent && cmsPage && cmsPage.content.kind === "document" ? cmsPage.content.lede?.trim() : "";
  const reviewedIso = cmsOwnsContent
    ? isoDateFromMillis(cmsPage?.updatedAt)
    : policy.updated;
  const tocItems = cmsOwnsContent
    ? cmsSections.map((s, i) => ({ id: s.id ?? `section-${i + 1}`, label: s.toc ?? s.title ?? `Section ${i + 1}` }))
    : policy.sections.map((section) => ({ id: section.id, label: section.toc ?? section.title }));
  const contactHref = policy.contactEnquiry
    ? `/contact?enquiry=${encodeURIComponent(policy.contactEnquiry)}#contact-form-section`
    : "/contact";
  const siblings = POLICY_ORDER.filter((s) => s !== policy.slug).map((s) => POLICIES[s]);

  return (
    <div className="bg-surface">
      {/* ==================== EDITORIAL HEADER ==================== */}
      <div className="relative w-full overflow-hidden">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-[340px] w-[1000px] -translate-x-1/2 bg-gradient-to-b from-surface-container via-surface-container-low/40 to-transparent blur-3xl"
          aria-hidden
        />
        <section className="mx-auto w-full max-w-7xl px-margin-mobile pb-6 pt-6 lg:px-margin">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-space-lg flex flex-wrap items-center gap-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            <Link href="/" className="flex items-center gap-1 transition-colors hover:text-primary">
              <IconHouse size={14} aria-hidden />
              <span>Home</span>
            </Link>
            <span className="font-light text-outline-variant" aria-hidden>/</span>
            <span>Policies</span>
            <span className="font-light text-outline-variant" aria-hidden>/</span>
            <span className="font-bold text-primary">{headerTitle}</span>
          </nav>

          {/* Editorial heading */}
          <div className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <span className="mb-space-xs inline-flex items-center gap-2 font-label-sm text-label-sm font-bold uppercase tracking-widest text-primary-container">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-container" aria-hidden />
                Our Policies • {policy.eyebrowTopic}
              </span>
              <h1 className="mb-space-sm mt-1 font-display text-headline-lg-mobile font-semibold tracking-tight text-primary lg:text-headline-lg">
                {headerTitle}
              </h1>
              <p className="max-w-2xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">
                {renderLedeParagraphs(headerLede || policy.lede)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="flex items-center gap-space-sm rounded-lg bg-surface-container-low px-space-md py-space-sm shadow-sm">
                <IconBadgeCheck size={20} className="text-secondary" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Last reviewed</span>
                  <span className="font-label-md text-label-md text-on-surface">{formatReviewDate(reviewedIso)}</span>
                </span>
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-tertiary-fixed px-space-md py-space-sm">
                <IconPenLine size={16} className="text-on-tertiary-fixed-variant" aria-hidden />
                <span className="font-label-md text-label-md text-on-tertiary-fixed-variant">
                  {cmsOwnsContent ? "Curated by the business" : "Draft pending business review"}
                </span>
              </span>
            </div>
          </div>

          {/* Quick policy switcher */}
          <div className="flex items-center gap-space-xs overflow-x-auto py-space-md">
            {POLICY_ORDER.map((s) => {
              const doc = POLICIES[s];
              const active = s === policy.slug;
              const Icon = SWITCHER_ICONS[s];
              return (
                <Link
                  key={s}
                  href={`/policies/${s}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-space-md py-space-xs font-label-md text-label-md tracking-wider transition-colors ${
                    active
                      ? "bg-primary text-on-primary shadow-sm"
                      : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  {active ? <Icon size={16} aria-hidden /> : null}
                  <span>{doc.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* ==================== 2-COLUMN EDITORIAL GRID ==================== */}
      <section className="mx-auto w-full max-w-7xl px-margin-mobile pb-20 lg:px-margin">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
          {/* Left: sticky TOC + concierge plinth */}
          <aside className="flex flex-col gap-space-lg lg:col-span-4 lg:sticky lg:top-32">
            <PolicyToc items={tocItems} />

            {/* Help card — routes to the real contact workflow; no invented
                email/phone/hours, ever. */}
            <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-[0_2px_12px_rgba(39,24,16,0.03)]">
              <div className="mb-space-sm flex items-center gap-space-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-on-secondary">
                  <IconMail size={18} aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-[18px] font-semibold leading-snug text-primary">{policy.help.title}</h2>
                  <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {policy.help.kicker}
                  </p>
                </div>
              </div>
              <p className="mb-space-md font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                {policy.help.text}
              </p>
              <Link
                href={contactHref}
                className="flex items-center gap-2 font-body-sm text-body-sm font-semibold text-primary hover:underline"
              >
                <IconMail size={16} className="text-primary-container" aria-hidden />
                <span>Message us via the contact page</span>
              </Link>
              <div className="mt-space-md flex items-center justify-between pt-space-xs font-label-sm text-label-sm text-on-surface-variant">
                <span>Replies within one working day</span>
                <span>Monday to Saturday</span>
              </div>
            </div>

            {/* Grounded assurance badge (per-policy, from the approved drafts) */}
            <div className="flex items-center gap-space-sm rounded-lg bg-surface-container-highest p-space-md">
              {(() => {
                const Icon = SWITCHER_ICONS[policy.slug];
                return <Icon size={24} className="shrink-0 text-primary" aria-hidden />;
              })()}
              <span className="font-body-sm text-body-sm font-medium leading-tight text-on-surface">
                {policy.assurance.text}
              </span>
            </div>
          </aside>

          {/* Right: numbered article cards — built-in content or the admin's
              published version, always in the same approved card design */}
          <div className="flex max-w-3xl flex-col gap-12 lg:col-span-8">
            {cmsOwnsContent
              ? cmsSections.map((section, i) => (
                  <ArticleCard
                    key={section.id ?? i}
                    id={section.id ?? `section-${i + 1}`}
                    eyebrow={`${String(i + 1).padStart(2, "0")}${section.eyebrow ? ` • ${section.eyebrow}` : ""}`}
                    title={section.title}
                  >
                    <CmsBlocks blocks={section.blocks ?? []} />
                  </ArticleCard>
                ))
              : policy.sections.map((section) => (
                  <ArticleCard key={section.id} id={section.id} eyebrow={section.eyebrow} title={section.title}>
                    {section.blocks.map((block, i) => (
                      <PolicyBlockRenderer key={i} block={block} shipping={shipping} contactHref={contactHref} />
                    ))}
                  </ArticleCard>
                ))}
          </div>
        </div>
      </section>

      {/* ==================== RELATED POLICIES BAND ==================== */}
      <section aria-label="Related policies" className="bg-surface-container-low/40 px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-space-md sm:flex-row sm:items-end">
            <div>
              <p className="font-label-sm text-label-sm font-bold uppercase tracking-[0.25em] text-tertiary-container">
                Related Policies
              </p>
              <h2 className="mt-1 font-display text-headline-lg-mobile font-semibold text-primary lg:text-headline-lg">
                {policy.relatedTitle}
              </h2>
            </div>
            <p className="max-w-md text-body-sm text-on-surface-variant">
              Every policy on this site is draft content pending business review — read them together for the full picture.
            </p>
          </div>
          <div className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-3">
            {siblings.map((sibling) => {
              const Icon = SWITCHER_ICONS[sibling.slug];
              return (
                <Link
                  key={sibling.slug}
                  href={`/policies/${sibling.slug}`}
                  className="card-soft group flex flex-col gap-2 p-space-lg transition-shadow hover:shadow-lg"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-primary-container">
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="font-label-lg text-label-lg font-semibold text-on-surface transition-colors group-hover:text-primary">
                    {sibling.title}
                  </span>
                  <span className="flex-1 text-body-sm leading-relaxed text-on-surface-variant">
                    {sibling.description}
                  </span>
                  <span className="mt-1 flex items-center gap-1 font-label-md text-label-md font-semibold text-primary">
                    Read the policy
                    <IconChevronRight size={14} aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
