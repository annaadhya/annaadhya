/** Maroon announcement strip atop every page — now a server component so the
 *  free-shipping claim is driven by the public store settings (the same server
 *  truth the cart progress card and checkout use). The threshold can be changed
 *  in admin (Settings > shipping) and the strip follows within the fetch cache
 *  window; it can no longer drift from what checkout actually charges. When no
 *  numeric threshold is configured, the copy drops the number instead of
 *  guessing one. */
import Link from "next/link";
import { getPublicSettings } from "@/lib/api";
import { formatINR } from "@/lib/format";

export async function AnnouncementStrip() {
  const settings = await getPublicSettings();
  const shipping = settings?.shipping;
  const freeAbovePaise =
    shipping?.mode === "flat_rate" && shipping.freeAbovePaise && shipping.freeAbovePaise > 0
      ? shipping.freeAbovePaise
      : null;

  return (
    <aside className="w-full bg-primary-container text-on-tertiary-container shadow-[0_1px_8px_rgba(39,24,16,0.08)]">
      <div className="mx-auto flex h-8 max-w-7xl items-center justify-between px-margin-mobile text-label-sm font-bold uppercase tracking-widest lg:px-margin">
        <span>
          {freeAbovePaise != null
            ? `Complimentary Pan-India Shipping Above ${formatINR(freeAbovePaise, false)}`
            : "Complimentary Pan-India Shipping"}
        </span>
        <p className="hidden text-center font-medium tracking-[0.14em] md:block">
          Thoughtfully Sourced Pantry Essentials | Rooted in Indian Heritage
        </p>
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
