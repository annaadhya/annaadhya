/** Maroon announcement strip atop every page — a server component driven by the
 *  public store settings, so the owner edits it in Admin → Settings → Announcement
 *  bar and the strip follows within seconds (the same server truth the cart
 *  progress card and checkout use).
 *
 *  Segment map:
 *  - LEFT: the owner's custom announcement when enabled + message are set (linked
 *    via href when provided); otherwise the automatic free-shipping claim derived
 *    from the shipping settings, so it can never drift from what checkout charges.
 *  - CENTER: the owner's tagline; blank keeps the approved design tagline.
 *  - RIGHT: currency marker + Support link (design chrome, not editable). */
import Link from "next/link";
import { getPublicSettings } from "@/lib/api";
import { formatINR } from "@/lib/format";

const DEFAULT_TAGLINE = "Thoughtfully Sourced Pantry Essentials | Rooted in Indian Heritage";

export async function AnnouncementStrip() {
  const settings = await getPublicSettings();
  const shipping = settings?.shipping;
  const announcement = settings?.store?.announcement;
  const freeAbovePaise =
    shipping?.mode === "flat_rate" && shipping.freeAbovePaise && shipping.freeAbovePaise > 0
      ? shipping.freeAbovePaise
      : null;

  const customMessage = announcement?.enabled && announcement.message?.trim() ? announcement.message.trim() : null;
  const customHref = announcement?.href?.trim() ?? "";
  const tagline = announcement?.tagline?.trim() || DEFAULT_TAGLINE;

  return (
    <aside className="w-full bg-primary-container text-on-tertiary-container shadow-[0_1px_8px_rgba(39,24,16,0.08)]">
      <div className="mx-auto flex h-8 max-w-7xl items-center justify-between px-margin-mobile text-label-sm font-bold uppercase tracking-widest lg:px-margin">
        <span>
          {customMessage != null ? (
            customHref ? (
              <Link href={customHref} className="transition-colors hover:text-on-primary">
                {customMessage}
              </Link>
            ) : (
              customMessage
            )
          ) : freeAbovePaise != null ? (
            `Complimentary Pan-India Shipping Above ${formatINR(freeAbovePaise, false)}`
          ) : (
            "Complimentary Pan-India Shipping"
          )}
        </span>
        <p className="hidden text-center font-medium tracking-[0.14em] md:block">{tagline}</p>
        <div className="hidden items-center gap-space-sm font-semibold sm:flex">
          <span className="text-tertiary-fixed">₹ INR</span>
          <span aria-hidden>|</span>
          <Link href="/contact" className="transition-colors hover:text-on-primary">
            Support
          </Link>
        </div>
      </div>
    </aside>
  );
}
