import type { Metadata } from "next";
import { getPublicSettings } from "@/lib/api";
import { WishlistView } from "@/components/wishlist-view";

/** The wishlist is a private shopping intent, not a catalogue page — keep it out of search. */
export const metadata: Metadata = {
  title: "My Wishlist",
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  // The real shipping policy powers the wishlist summary band — the same
  // server-driven rule the cart uses, so no shipping claim is ever hardcoded.
  const settings = await getPublicSettings();

  return <WishlistView shipping={settings?.shipping ?? null} />;
}
