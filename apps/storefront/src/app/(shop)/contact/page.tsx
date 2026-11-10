import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getPage, getPublicSettings } from "@/lib/api";
import type { PublicStoreSettings } from "@/lib/types";
import { ContactForm } from "@/components/contact/contact-form";
import { CmsBlocks, renderInline, renderLedeParagraphs } from "@/components/blocks/document-blocks";
import { mapCmsPageToSlots, isCustomizedTitle } from "@/lib/cms-page-slots";
import { CONTACT, CONTACT_SECTION_IDS } from "@annaadhya/contracts/cms-design";
import {
  IconBadgeCheck,
  IconClock,
  IconGift,
  IconHeadset,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPhone,
  IconPlus,
  IconShieldCheck,
  IconTruck,
} from "@/components/icons";

/** Stable anchor ids of the shipped Contact document — single-sourced in
 *  @annaadhya/contracts so the admin preview maps sections identically. */

const SEED_CONTACT_HEADLINE = CONTACT.seedHeadline;
const SEED_CONTACT_LEDE = CONTACT.defaultLede;

/** Chip icons cycled across admin-provided hero trust items. */
const HERO_CHIP_ICONS = [IconClock, IconBadgeCheck, IconTruck, IconShieldCheck];

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about orders, products, sourcing or gifting? Message the Annaadhya team — every enquiry is read and answered by email.",
  openGraph: {
    title: "Contact | Annaadhya Products",
    description: "Questions about orders, products, sourcing or gifting? Message the Annaadhya team.",
    type: "website",
    siteName: "Annaadhya Products",
  },
};

/** Used only when the API is unreachable (build/preview). Values mirror the seeded
 *  settings defaults, so the page never renders invented contact details. Shipping
 *  falls back to "disabled" — no shipping claims are made without real settings. */
const FALLBACK_SETTINGS: PublicStoreSettings = {
  store: {
    name: "Annaadhya",
    supportEmail: "support@annaadhya.example",
    supportPhone: "",
    addressLines: [],
    socialLinks: {},
    announcement: { enabled: false, message: "" },
  },
  storefront: {
    newsletterEnabled: true,
    giftCollectionEnabled: true,
    heroHeadline: "",
    heroHeadlineAccent: "",
    heroSubcopy: "",
    heroCtaHref: "",
  },
  shipping: { mode: "disabled", flatRatePaise: 0, freeAbovePaise: null },
};

/** Facts already published on the storefront (FAQ + policy drafts) — the contact
 *  page repeats them but never invents new commercial terms. */
const FAQS = [
  {
    q: "How do I ask about a specific product or batch?",
    a: (
      <>
        Every product page states exactly what is verified for the batch being sold — and what is still
        pending. If something isn&apos;t clear from the product page, choose{" "}
        <strong>Product Question</strong> in the form above and we&apos;ll follow up by email.
      </>
    ),
  },
  {
    q: "Where can I find my order details and tracking?",
    a: (
      <>
        All past and current orders live under{" "}
        <Link href="/account" className="font-semibold text-primary underline underline-offset-4">
          Account → Orders
        </Link>
        . Shipped orders show the courier&apos;s tracking link, and the status on each order is kept up to
        date as the parcel moves.
      </>
    ),
  },
  {
    q: "How long do shipping and delivery take?",
    a: (
      <>
        Orders dispatch within 2–3 working days of payment confirmation, and delivery typically takes 3–7
        working days after dispatch depending on your pincode. These are planning estimates, not
        guarantees — if your pincode is not serviceable, checkout tells you before payment. Details:{" "}
        <Link href="/policies/shipping" className="font-semibold text-primary underline underline-offset-4">
          Shipping &amp; delivery policy
        </Link>
        .
      </>
    ),
  },
  {
    q: "What about returns, damages, or a wrong item?",
    a: (
      <>
        For genuine quality issues, damaged parcels or wrong items, contact us within 48 hours of
        delivery with your order number and photographs — we make it right, including shipping. We
        cannot accept returns of opened products for change of mind; that protects every customer&apos;s
        food safety. Details:{" "}
        <Link href="/policies/returns" className="font-semibold text-primary underline underline-offset-4">
          returns &amp; refunds policy
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can you help with gifting or bulk orders?",
    a: (
      <>
        Our curated gift-box collection is in preparation. Until it launches, you can order multiple
        products together and we will pack them thoughtfully — or choose{" "}
        <strong>Gifting or Business Enquiry</strong> in the form above and tell us the occasion, the
        budget per gift and the quantity. We respond with what we can genuinely offer.
      </>
    ),
  },
];

export default async function ContactPage() {
  const [settings, cmsPage] = await Promise.all([getPublicSettings(), getPage("contact")]);
  const store = (settings ?? FALLBACK_SETTINGS).store;

  // Admin → Storefront → Pages can edit this page (slug "contact"). The admin's
  // published content flows INTO the approved design by section id: "write-to-us"
  // owns the hero (eyebrow, headline, lede, trust chips, image) and only brand-new
  // sections render as the intro band — nothing duplicates. The boot-seeded mirror
  // (adminEdited: false) never hijacks the design, and the working form plus the
  // settings-driven contact facts (email/phone/address) are never replaced by CMS
  // content ("reaching-our-team" stays settings-driven by design).
  const cms = mapCmsPageToSlots(cmsPage, CONTACT_SECTION_IDS);
  const writeUs = cms?.byId["write-to-us"];
  // Hero headline: the admin's customized page title wins; otherwise the
  // "write-to-us" section title when changed; otherwise the approved headline.
  const contactTitle =
    isCustomizedTitle(cms, "Contact") ??
    (writeUs?.title && writeUs.title.toLowerCase() !== SEED_CONTACT_HEADLINE.toLowerCase()
      ? writeUs.title
      : null);
  const contactLede = cms?.lede || SEED_CONTACT_LEDE;
  const heroChips =
    writeUs?.listItems && writeUs.listItems.length > 0
      ? writeUs.listItems.slice(0, 4)
      : [
          { text: "We reply within one working day" },
          { text: "Ships across India" },
        ];
  const heroImage = writeUs?.image;
  // Only brand-new sections (unknown anchor ids) render in the intro band —
  // the shipped sections flow into the hero above instead of duplicating it.
  const cmsBlocks = cms?.extras.flatMap((e) => e.blocks) ?? [];

  // Truth discipline: a `.example` address is the seeded placeholder — it is shown
  // as a placeholder, never linked, and no address/phone/social is claimed unless
  // the business actually configured it.
  const isPlaceholderEmail = /\.example$/i.test(store.supportEmail);
  const realEmail = isPlaceholderEmail ? null : store.supportEmail.trim();
  const phone = store.supportPhone.trim();
  const addressLines = store.addressLines.map((l) => l.trim()).filter(Boolean);
  const hasDirectChannel = Boolean(realEmail || phone || addressLines.length > 0);

  return (
    <div className="bg-surface">
      {/* ============================ SECTION A: HERO ============================ */}
      <section className="relative overflow-hidden px-margin-mobile pb-space-lg pt-space-lg lg:px-margin lg:pb-space-xl lg:pt-space-xl">
        <div className="pointer-events-none absolute -top-32 right-1/4 -z-10 size-96 rounded-full bg-surface-container-highest/60 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute left-4 top-1/2 -z-10 size-72 rounded-full bg-secondary-fixed/30 blur-3xl" aria-hidden />

        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-space-lg lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="flex items-center gap-2">
              <span className="inline-block h-px w-5 bg-on-tertiary-container" aria-hidden />
              <span className="text-label-sm font-bold uppercase tracking-widest text-on-tertiary-container">
                {renderInline(writeUs?.eyebrow ?? CONTACT.writeUs.eyebrow)}
              </span>
            </div>
            <h1 className="font-display text-headline-lg-mobile font-semibold leading-tight tracking-tight text-primary lg:text-display-lg">
              {contactTitle ? renderInline(contactTitle) : "Let’s Talk. We’d Love to Hear From You."}
            </h1>
            <p className="max-w-2xl text-body-lg leading-relaxed text-on-surface-variant">{renderLedeParagraphs(contactLede)}</p>
            <div className="flex flex-wrap items-center gap-6 pt-2">
              {heroChips.map((chip, i) => {
                const ChipIcon = HERO_CHIP_ICONS[i % HERO_CHIP_ICONS.length];
                return (
                  <span key={i} className="flex items-center gap-2 text-on-surface-variant">
                    <ChipIcon size={18} className="text-on-tertiary-container" aria-hidden />
                    <span className="text-label-sm font-semibold tracking-wide">{renderInline(chip.text)}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-center lg:col-span-5 lg:items-end">
            <div className="relative w-full max-w-sm overflow-hidden rounded-b-2xl rounded-t-[140px] bg-surface-container-low p-2 shadow-xl">
              <div className="relative h-80 w-full overflow-hidden rounded-b-xl rounded-t-[132px]">
                <Image
                  src={heroImage?.src ?? "/images/hero-pantry-still-life.webp"}
                  alt={heroImage?.alt || "A warm still life of honey jars, saffron and dry fruits arranged on a sunlit table"}
                  fill
                  sizes="(max-width: 1024px) 92vw, 40vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent" aria-hidden />
                <div className="absolute inset-x-4 bottom-4 text-center">
                  <span className="inline-block rounded-full bg-surface-container-lowest/90 px-3 py-1 text-label-sm font-bold uppercase tracking-wider text-primary shadow-sm backdrop-blur-md">
                    {heroImage?.caption ?? "Thoughtfully sourced, honestly described"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CMS intro band — only brand-new sections (unknown anchor ids) from
          Admin → Storefront → Pages (slug "contact"); the shipped sections flow
          into the hero above instead. The boot-seeded mirror never renders. */}
      {cmsBlocks.length > 0 && (
        <section className="px-margin-mobile pb-space-lg lg:px-margin">
          <div className="mx-auto max-w-3xl rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-lg">
            <CmsBlocks blocks={cmsBlocks} />
          </div>
        </section>
      )}

      {/* ====================== SECTION B: CONTACT OPTIONS ====================== */}
      <section aria-label="Ways to reach us" className="bg-surface-container-low/40 px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Email */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-container-high text-on-tertiary-container shadow-xs">
                <IconMail size={24} aria-hidden />
              </div>
              <h3 className="mb-2 font-display text-headline-sm font-semibold text-primary">Email</h3>
              {realEmail ? (
                <p className="mb-4 text-body-sm leading-relaxed text-on-surface-variant">
                  For product, order and gifting questions — we reply within one working day.
                </p>
              ) : (
                <p className="mb-4 text-body-sm leading-relaxed text-on-surface-variant">
                  Our official support address is being confirmed. The message form below reaches us
                  directly in the meantime.
                </p>
              )}
            </div>
            {realEmail ? (
              <a
                href={`mailto:${realEmail}?subject=${encodeURIComponent("Annaadhya enquiry")}`}
                className="inline-flex items-center gap-1.5 font-label-lg font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-tertiary-container"
              >
                <span className="break-all">{realEmail}</span>
              </a>
            ) : (
              <a
                href="#contact-form-section"
                className="inline-flex items-center gap-1.5 font-label-lg font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-tertiary-container"
              >
                Use the message form
              </a>
            )}
          </div>

          {/* Card 2: Order support */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-container-high text-on-tertiary-container shadow-xs">
                <IconPackage size={24} aria-hidden />
              </div>
              <h3 className="mb-2 font-display text-headline-sm font-semibold text-primary">Order support</h3>
              <p className="mb-4 text-body-sm leading-relaxed text-on-surface-variant">
                Dispatch status and courier tracking live on each order in your account — having your
                order number handy helps us help you faster.
              </p>
            </div>
            <Link
              href="/account"
              className="group inline-flex items-center gap-1.5 font-label-lg font-semibold text-primary transition-colors hover:text-on-tertiary-container"
            >
              View orders &amp; account
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>

          {/* Card 3: Product questions */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-container-high text-on-tertiary-container shadow-xs">
                <IconGift size={24} aria-hidden />
              </div>
              <h3 className="mb-2 font-display text-headline-sm font-semibold text-primary">Products &amp; sourcing</h3>
              <p className="mb-4 text-body-sm leading-relaxed text-on-surface-variant">
                Curious about our honey harvests, saffron lots or dry-fruit origins? Every product page
                states what is verified for the batch on sale.
              </p>
            </div>
            <Link
              href="/shop"
              className="group inline-flex items-center gap-1.5 font-label-lg font-semibold text-primary transition-colors hover:text-on-tertiary-container"
            >
              Browse the shop
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>

          {/* Card 4: Gifting */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-shadow duration-300 hover:shadow-md">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-container-high text-on-tertiary-container shadow-xs">
                <IconGift size={24} aria-hidden />
              </div>
              <h3 className="mb-2 font-display text-headline-sm font-semibold text-primary">Gifting &amp; bulk</h3>
              <p className="mb-4 text-body-sm leading-relaxed text-on-surface-variant">
                Festive hampers, employee welcomes and client gifts. Write with the occasion, the budget
                per gift and the quantity — we respond with what we can genuinely offer.
              </p>
            </div>
            <Link
              href="/contact?enquiry=Gifting%20or%20Business%20Enquiry#contact-form-section"
              className="group inline-flex items-center gap-1.5 font-label-lg font-semibold text-primary transition-colors hover:text-on-tertiary-container"
            >
              Enquire about gifting
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ============== SECTION C: FORM + SUPPORT PANEL ============== */}
      <section id="contact-form-section" className="scroll-mt-24 px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <ContactForm />
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            {/* Direct channels — only configured ones are shown */}
            <div className="flex flex-col gap-4 rounded-2xl bg-surface-container-lowest p-6 shadow-sm sm:p-7">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                  <IconHeadset size={20} aria-hidden />
                </div>
                <div>
                  <span className="text-label-sm font-bold uppercase tracking-wider text-secondary">Direct assistance</span>
                  <h3 className="font-display text-headline-sm font-semibold text-primary">Reaching our team</h3>
                </div>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-start gap-3">
                  <IconClock size={20} className="mt-0.5 shrink-0 text-on-tertiary-container" aria-hidden />
                  <div>
                    <p className="text-label-md font-semibold text-on-surface">Reply time</p>
                    <p className="text-body-sm text-on-surface-variant">We reply within one working day, Monday to Saturday.</p>
                  </div>
                </div>
                {realEmail ? (
                  <div className="flex items-start gap-3">
                    <IconMail size={20} className="mt-0.5 shrink-0 text-on-tertiary-container" aria-hidden />
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">Email</p>
                      <a
                        href={`mailto:${realEmail}`}
                        className="text-body-sm font-semibold text-primary hover:underline"
                      >
                        {realEmail}
                      </a>
                    </div>
                  </div>
                ) : null}
                {phone ? (
                  <div className="flex items-start gap-3">
                    <IconPhone size={20} className="mt-0.5 shrink-0 text-on-tertiary-container" aria-hidden />
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">Phone</p>
                      <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-body-sm font-semibold text-primary hover:underline">
                        {phone}
                      </a>
                    </div>
                  </div>
                ) : null}
                {addressLines.length > 0 ? (
                  <div className="flex items-start gap-3">
                    <IconMapPin size={20} className="mt-0.5 shrink-0 text-on-tertiary-container" aria-hidden />
                    <div>
                      <p className="text-label-md font-semibold text-on-surface">Registered address</p>
                      <address className="text-body-sm not-italic leading-relaxed text-on-surface-variant">
                        {addressLines.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </address>
                    </div>
                  </div>
                ) : null}
                {!hasDirectChannel ? (
                  <p className="rounded-lg bg-surface-container-low p-3 text-body-sm leading-relaxed text-on-surface-variant">
                    Our official email address and phone are being confirmed before launch — the message
                    form is the fastest way to reach us right now.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Provenance */}
            <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-surface-container-low p-6 shadow-sm sm:p-7">
              <div className="flex items-center gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl shadow-sm">
                  <Image
                    src="/images/story-heritage-kitchen.webp"
                    alt="A heritage Indian kitchen with brass vessels and fresh ingredients"
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <span className="text-label-sm font-bold uppercase tracking-wider text-on-tertiary-container">Uncompromising origin</span>
                  <h4 className="font-display text-headline-sm font-semibold text-primary">Sourcing you can verify</h4>
                </div>
              </div>
              <p className="text-body-sm leading-relaxed text-on-surface-variant">
                We publish only what we can verify with supplier documents for the batch being sold —
                when a batch has test documentation, the product page states exactly what was tested and
                by whom.
              </p>
              <Link
                href="/about"
                className="inline-flex items-center gap-1 font-label-md font-semibold text-primary transition-colors hover:text-on-tertiary-container"
              >
                Read our story
                <span aria-hidden>→</span>
              </Link>
            </div>

            {/* Privacy */}
            <div className="flex items-start gap-4 rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface">
                <IconShieldCheck size={20} aria-hidden />
              </div>
              <div>
                <h4 className="mb-1 font-label-lg font-semibold text-primary">Privacy &amp; discretion</h4>
                <p className="text-body-sm leading-relaxed text-on-surface-variant">
                  Your message and contact details are used only to respond to your enquiry and are never
                  sold or shared. See our{" "}
                  <Link href="/policies/privacy" className="font-semibold text-primary underline underline-offset-2">
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTION D: ORDER HELP ==================== */}
      <section className="px-margin-mobile py-space-lg lg:px-margin">
        <div className="mx-auto max-w-[1320px]">
          <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-high p-8 shadow-md lg:flex-row lg:p-10">
            <div className="flex max-w-2xl items-start gap-4">
              <div className="mt-1 flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm">
                <IconTruck size={24} aria-hidden />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-label-sm font-bold uppercase tracking-wider text-on-tertiary-container">Already ordered?</span>
                <h3 className="font-display text-headline-sm font-bold text-primary">Need help with an active order?</h3>
                <p className="text-body-md leading-relaxed text-on-surface-variant">
                  Dispatch status and courier tracking are kept current on each order in your account —
                  that&apos;s always the fastest place to check.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                href="/account"
                className="flex items-center gap-2 rounded bg-primary px-6 py-3 text-label-lg font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
              >
                Go to my orders
              </Link>
              <Link
                href="/policies/shipping"
                className="flex items-center gap-2 rounded bg-surface-container-lowest px-6 py-3 text-label-lg font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
              >
                Shipping &amp; delivery info
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SECTION E: FAQ ACCORDION ==================== */}
      <section aria-label="Frequently asked questions" className="bg-surface-container-low/30 px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto flex max-w-4xl flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-label-sm font-semibold uppercase tracking-widest text-on-tertiary-container">Clarifications &amp; guidance</span>
            <h2 className="font-display text-headline-md font-semibold text-primary sm:text-headline-lg">A few things you might be wondering</h2>
            <p className="max-w-xl text-body-md text-on-surface-variant">
              Direct answers about products, orders, shipping and returns — matching our published
              policies. Our{" "}
              <Link href="/faq" className="font-semibold text-primary underline underline-offset-4">
                full FAQ
              </Link>{" "}
              covers more.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {FAQS.map((f, i) => (
              <details key={i} className="group overflow-hidden rounded-xl bg-surface-container-lowest shadow-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-[18px] font-semibold leading-snug text-primary sm:text-headline-sm">{f.q}</span>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary transition-transform duration-200 group-open:rotate-45">
                    <IconPlus size={20} aria-hidden />
                  </span>
                </summary>
                <div className="px-5 pb-6 text-body-md leading-relaxed text-on-surface-variant sm:px-6">{f.a}</div>
              </details>
            ))}
          </div>

          <div className="pt-2 text-center">
            <p className="text-body-md text-on-surface-variant">
              Looking for our complete customer policies?{" "}
              <Link href="/faq" className="ml-1 font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:text-on-tertiary-container">
                Browse the full FAQ →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ==================== SECTION F: CLOSING CTA ==================== */}
      <section className="relative overflow-hidden bg-primary px-margin-mobile py-space-xl text-on-primary lg:px-margin lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary-container to-primary opacity-90" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -right-20 size-80 rounded-full bg-on-tertiary-container/10 blur-2xl" aria-hidden />
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
          <span className="text-label-sm font-bold uppercase tracking-widest text-tertiary-fixed">You&apos;re always welcome</span>
          <h2 className="max-w-3xl font-display text-headline-lg-mobile font-semibold leading-tight lg:text-display-lg">
            Every Good Conversation Starts Somewhere.
          </h2>
          <p className="max-w-2xl text-body-lg leading-relaxed text-primary-fixed">
            Whether you&apos;re choosing something special for your everyday pantry or planning a
            celebratory hamper, we&apos;re glad to help.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href="/shop"
              className="flex items-center gap-2 rounded bg-tertiary-fixed px-8 py-3.5 font-label-lg font-semibold text-on-tertiary-fixed shadow-lg transition-colors hover:bg-tertiary-fixed-dim"
            >
              Explore the full pantry
              <span aria-hidden>→</span>
            </Link>
            <a
              href={realEmail ? `mailto:${realEmail}` : "#contact-form-section"}
              className="flex items-center gap-2 rounded bg-surface-container-lowest/10 px-6 py-3.5 text-label-lg font-semibold text-on-primary backdrop-blur-sm transition-colors hover:bg-surface-container-lowest/20"
            >
              {realEmail ? "Write to us directly" : "Send us a message"}
              <IconMail size={18} aria-hidden />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
