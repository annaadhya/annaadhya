import type { Metadata } from "next";
import { getBestsellers, getCategoryOverview, getPublicSettings } from "@/lib/api";
import { CartView } from "@/components/cart-view";

/** The cart is a private shopping intent, not a catalogue page — keep it out of search. */
export const metadata: Metadata = {
  title: "Your Cart",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  // One parallel fan-out: the public shipping policy (powers the honest free-shipping
  // progress card), real bestseller candidates for the cross-sell row, and the live
  // catalogue for the empty-cart quick shelves.
  const [settings, bestsellers, overview] = await Promise.all([
    getPublicSettings(),
    getBestsellers(),
    getCategoryOverview(),
  ]);

  // Deletion doctrine: only categories that exist right now become quick links —
  // an unreachable catalogue contributes none (never a guessed category).
  const shelves = (overview?.categories ?? [])
    .filter((c) => c.isReady)
    .slice(0, 4)
    .map((c) => ({ slug: c.slug, label: c.name, href: `/category/${c.slug}` }));

  return (
    <CartView
      shipping={settings?.shipping ?? null}
      crossSell={bestsellers.slice(0, 6)}
      shelves={shelves}
    />
  );
}
