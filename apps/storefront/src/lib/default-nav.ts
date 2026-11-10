/** Curated fallback navigation — the approved default menu used when the admin
 *  Navigation manager has no enabled header items (or the API is offline).
 *  Lives in a plain server-safe module (NOT inside the "use client" header)
 *  because the (shop) layout imports it to prune it against the live catalogue
 *  before rendering — importing a value from a "use client" module in a server
 *  component yields a client-reference proxy, not the real array. */
export const DEFAULT_NAV = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop All" },
  { href: "/category/honey", label: "Honey" },
  { href: "/category/kesar", label: "Kesar" },
  { href: "/category/dry-fruits", label: "Dry Fruits" },
  { href: "/category/gift-boxes", label: "Gift Hampers" },
  { href: "/about", label: "Our Story" },
];
