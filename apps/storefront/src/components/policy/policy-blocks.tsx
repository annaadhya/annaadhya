/**
 * Policy document blocks — renderers for the typed content in lib/policies.ts.
 * Server components; visual language follows the approved Stitch policy designs
 * (white article cards on warm ivory, numbered kickers, headline-md Playfair
 * headings, surface-container callouts) mapped onto the repo's M3 tokens.
 */
import Link from "next/link";
import {
  IconAlertTriangle,
  IconBadgeCheck,
  IconCalendar,
  IconCircleAlert,
  IconCircleCheck,
  IconClock,
  IconDroplet,
  IconFlower2,
  IconGift,
  IconHeadset,
  IconHouse,
  IconIdCard,
  IconLandmark,
  IconLeaf,
  IconLock,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPenLine,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  IconSprout,
  IconSun,
  IconTruck,
  IconWallet,
  IconXCircle,
} from "@/components/icons";
import type { PolicyBlock, PolicyIconKey, PolicyTone } from "@/lib/policies";

const ICONS: Record<PolicyIconKey, typeof IconTruck> = {
  truck: IconTruck,
  package: IconPackage,
  shield: IconShieldCheck,
  lock: IconLock,
  pen: IconPenLine,
  calendar: IconCalendar,
  headset: IconHeadset,
  circleCheck: IconCircleCheck,
  circleAlert: IconCircleAlert,
  clock: IconClock,
  mapPin: IconMapPin,
  mail: IconMail,
  sparkles: IconSparkles,
  leaf: IconLeaf,
  sprout: IconSprout,
  droplet: IconDroplet,
  flower: IconFlower2,
  wallet: IconWallet,
  badgeCheck: IconBadgeCheck,
  landmark: IconLandmark,
  idCard: IconIdCard,
  recycle: IconSprout,
  sun: IconSun,
  house: IconHouse,
  refresh: IconRefresh,
  gift: IconGift,
  xCircle: IconXCircle,
  alert: IconAlertTriangle,
};

const TONE_ICON: Record<PolicyTone, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  gold: "text-on-tertiary-fixed-variant",
};

/** Minimal, safe **bold** renderer shared by all policy text. */
export function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-primary">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

type SettingsShipping = {
  mode: "flat_rate" | "free_shipping" | "disabled";
  flatRatePaise: number;
  freeAbovePaise: number | null;
} | null;

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** Live shipping tier cards — figures come from public settings at request
 *  time, exactly like the cart progress card and checkout. */
function ShippingTiers({ shipping }: { shipping: SettingsShipping }) {
  if (!shipping || shipping.mode === "disabled") {
    return (
      <div className="mt-space-md flex items-start gap-3 rounded-lg bg-surface-container p-space-md">
        <IconCircleAlert size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-body-sm leading-relaxed text-on-surface">
          <strong className="font-semibold text-primary">Shipping unavailable right now:</strong> online shipping
          is paused in the store&apos;s settings. Please contact us before placing an order and we will help.
        </p>
      </div>
    );
  }
  if (shipping.mode === "free_shipping") {
    return (
      <div className="mt-space-md grid grid-cols-1 gap-space-md">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-primary p-space-lg text-on-primary shadow-md">
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-primary-container/40" aria-hidden />
          <div>
            <span className="mb-2 inline-block rounded bg-tertiary px-2 py-0.5 font-label-sm text-[11px] font-bold uppercase tracking-widest text-on-tertiary-container">
              Heritage Privilege
            </span>
            <h3 className="mb-2 font-headline-sm text-headline-sm text-on-primary">Every Order Ships Free</h3>
            <p className="mb-space-md text-body-sm text-primary-fixed-dim">
              Complimentary shipping is enabled for all pantry orders across India.
            </p>
          </div>
          <div className="flex items-baseline gap-2 pt-space-sm">
            <span className="font-display text-headline-lg text-on-primary">FREE</span>
            <span className="font-label-sm text-label-sm uppercase text-primary-fixed-dim">
              Complimentary Shipping
            </span>
          </div>
        </div>
      </div>
    );
  }
  const freeAbove = shipping.freeAbovePaise;
  return (
    <div className="mt-space-md grid grid-cols-1 gap-space-md md:grid-cols-2">
      <div className="flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg">
        <div>
          <span className="mb-1 block font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
            Standard Dispatch
          </span>
          <h3 className="mb-2 font-headline-sm text-headline-sm text-primary">
            Orders below {freeAbove != null ? inr(freeAbove) : "the threshold"}
          </h3>
          <p className="mb-space-md text-body-sm text-on-surface-variant">
            A flat delivery fee applies per order, regardless of weight or jar count.
          </p>
        </div>
        <div className="flex items-baseline gap-2 pt-space-sm">
          <span className="font-display text-headline-lg text-primary">{inr(shipping.flatRatePaise)}</span>
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Flat Pan-India Rate</span>
        </div>
      </div>
      <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-primary p-space-lg text-on-primary shadow-md">
        <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-primary-container/40" aria-hidden />
        <div>
          <span className="mb-2 inline-block rounded bg-tertiary px-2 py-0.5 font-label-sm text-[11px] font-bold uppercase tracking-widest text-on-tertiary-container">
            Heritage Privilege
          </span>
          <h3 className="mb-2 font-headline-sm text-headline-sm text-on-primary">
            {freeAbove != null ? `Orders of ${inr(freeAbove)} & above` : "Complimentary tier"}
          </h3>
          <p className="mb-space-md text-body-sm text-primary-fixed-dim">
            Automatic complimentary shipping unlocked at checkout, exactly as shown before you pay.
          </p>
        </div>
        <div className="flex items-baseline gap-2 pt-space-sm">
          <span className="font-display text-headline-lg text-on-primary">FREE</span>
          <span className="font-label-sm text-label-sm uppercase text-primary-fixed-dim">
            Complimentary Shipping
          </span>
        </div>
      </div>
    </div>
  );
}

export function PolicyBlockRenderer({
  block,
  shipping,
  contactHref,
}: {
  block: PolicyBlock;
  shipping: SettingsShipping;
  contactHref: string;
}) {
  switch (block.type) {
    case "p":
      return <p className="text-body-md leading-relaxed text-on-surface">{renderInline(block.text)}</p>;
    case "list":
      return (
        <ul className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-space-sm">
              {block.icon === "check" ? (
                <IconCircleCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              ) : (
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-container" aria-hidden />
              )}
              <span className="text-body-md leading-relaxed text-on-surface">
                {item.title ? (
                  <>
                    <strong className="font-semibold text-on-surface">{item.title}</strong>{" "}
                  </>
                ) : null}
                {renderInline(item.text)}
              </span>
            </li>
          ))}
        </ul>
      );
    case "cards":
      return (
        <div className={`grid grid-cols-1 gap-space-md ${block.cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {block.items.map((card, i) => {
            const Icon = ICONS[card.icon];
            return (
              <div key={i} className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-space-md">
                <Icon size={20} className={`shrink-0 ${TONE_ICON[card.tone ?? "primary"]}`} aria-hidden />
                <span className={`font-label-md text-label-md font-bold ${TONE_ICON[card.tone ?? "primary"]}`}>
                  {card.title}
                </span>
                <span className="text-body-sm leading-relaxed text-on-surface-variant">{card.text}</span>
              </div>
            );
          })}
        </div>
      );
    case "note":
      return (
        <div className="flex items-start gap-space-md rounded-lg bg-surface-container p-space-md">
          {(() => {
            const Icon = ICONS[block.icon];
            return <Icon size={24} className="mt-0.5 shrink-0 text-primary" aria-hidden />;
          })()}
          <p className="text-body-sm leading-relaxed text-on-surface">
            {block.title ? <strong className="font-semibold text-primary">{block.title} </strong> : null}
            {renderInline(block.text)}
          </p>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl bg-surface-container-low p-2">
          <table className="w-full text-left font-body-sm text-body-sm">
            <thead>
              <tr className="bg-surface-container font-label-sm text-label-sm uppercase tracking-wider text-on-surface">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 ${i === 0 ? "rounded-l-lg" : ""} ${i === block.head.length - 1 ? "rounded-r-lg" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-on-surface">
              {block.rows.map((row, r) => (
                <tr key={r} className="transition-colors hover:bg-surface-container-high/40">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-4 py-3 ${c === 0 ? "font-semibold text-primary" : "text-on-surface-variant"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.footnote ? (
            <p className="mt-3 px-2 pb-1 font-body-sm text-body-sm italic text-on-surface-variant">{block.footnote}</p>
          ) : null}
        </div>
      );
    case "steps":
      return (
        <div className="my-4 rounded-xl bg-surface-container p-6">
          <h3 className="mb-2 flex items-center gap-2 font-headline-sm text-headline-sm text-primary">{block.title}</h3>
          <p className="mb-4 text-body-md text-on-surface">{renderInline(block.intro)}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {block.items.map((step, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-lg bg-surface-container-lowest p-3">
                <span className="font-label-sm text-label-sm font-bold uppercase text-primary">{step.label}</span>
                <span className="text-body-sm leading-relaxed text-on-surface-variant">{renderInline(step.text)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "banner":
      return (
        <div className="relative overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-md">
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-primary-container/40" aria-hidden />
          <div className="relative flex items-start gap-4">
            {(() => {
              const Icon = ICONS[block.icon];
              return (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <Icon size={22} aria-hidden />
                </span>
              );
            })()}
            <div>
              <h3 className="mb-1 font-headline-sm text-headline-sm text-on-primary">{block.title}</h3>
              <p className="text-body-md leading-relaxed text-primary-fixed-dim">{renderInline(block.text)}</p>
            </div>
          </div>
        </div>
      );
    case "shippingTiers":
      return <ShippingTiers shipping={shipping} />;
    case "contactPanel":
      return (
        <div className="mt-space-md flex flex-col items-start justify-between gap-space-md rounded-xl bg-surface-container-low p-space-lg sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-on-secondary">
              <IconHeadset size={24} aria-hidden />
            </span>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-primary">Speak with Our Team</h3>
              <p className="mt-1 max-w-md text-body-sm leading-relaxed text-on-surface-variant">{block.text}</p>
            </div>
          </div>
          <Link href={contactHref} className="btn-primary shrink-0 px-6 py-2.5 text-label-lg">
            Contact Concierge
          </Link>
        </div>
      );
  }
}

export { ICONS as POLICY_ICONS };
