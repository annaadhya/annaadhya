"use client";
/** Approved homepage header: sticky ivory header with category navigation, search,
 *  wishlist, live cart pill and account. All wired to real routes and state.
 *  (The maroon announcement strip lives in announcement-strip.tsx as a server
 *  component — its free-shipping claim reads the real store settings.) */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useAuth } from "@/lib/auth";
import { formatINR } from "@/lib/format";
import { Logo } from "./logo";
import {
  IconSearch,
  IconHeart,
  IconShoppingBag,
  IconUser,
  IconMenu,
  IconX,
  IconArrowRight,
} from "./icons";

/** Primary navigation — real routes and catalogue slugs. "Gift Hampers" points at the
 *  gift-boxes category, whose page shows an honest "coming soon" state (isReady: false).
 *  This is the FALLBACK: when the admin Navigation manager has saved items, the
 *  header renders the stored navigation instead (see navItems prop). The (shop)
 *  layout pre-prunes BOTH lists against the live catalogue, so an archived
 *  category disappears from the navbar automatically. The list itself lives in
 *  lib/default-nav.ts (server-safe import for the layout's prune pass). */
import { DEFAULT_NAV } from "@/lib/default-nav";

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header({ navItems }: { navItems?: { href: string; label: string }[] }) {
  const { count, subtotalPaise, ready } = useCart();
  const wishlist = useWishlist();
  const { principal, customer, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Admin-managed navigation wins; the curated default keeps the header complete
  // when the CMS has no header items (or the API is offline).
  const NAV = navItems && navItems.length > 0 ? navItems : DEFAULT_NAV;

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    // Whitespace-normalized, trimmed — the Shop page + API re-trim anyway, this keeps
    // the URL honest ("  honey   " becomes "honey").
    const q = query.trim().replace(/\s+/g, " ");
    router.push(q ? `/shop?search=${encodeURIComponent(q)}` : "/shop");
    setMenuOpen(false);
    setSearchOpen(false);
  }

  /** Opening the search row while already on /shop pre-fills it with the query the
   *  URL currently carries, so header and toolbar never show different searches. */
  function toggleSearch() {
    if (!searchOpen && pathname === "/shop") {
      const current = new URLSearchParams(window.location.search).get("search") ?? "";
      setQuery(current);
    }
    setSearchOpen((v) => !v);
  }

  const cartLabel = ready
    ? `₹${formatINR(subtotalPaise, false).slice(1)} · ${count} ${count === 1 ? "item" : "items"}`
    : "Bag";

  /* Signed-in identity for the navbar: name (first name reads best in a navbar)
     and the Google profile photo when the sign-in carried one. A broken/absent
     photo falls back to the customer's initials, so the pill never looks empty. */
  const displayName = principal?.displayName ?? customer?.displayName ?? "";
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const photoUrl = principal?.photoUrl;
  useEffect(() => {
    setPhotoFailed(false); // reset when the session identity changes
  }, [photoUrl, displayName]);

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/90 shadow-[0_2px_12px_rgba(39,24,16,0.06)] backdrop-blur-xl">
      {/* Phones get a slim 64px bar (h-16) — at 92px the honey-drop mark dominated the
          narrow viewport and pushed everything else down; 64px is the standard mobile
          navbar height and keeps the brand clearly present without shouting. sm+ keeps
          the approved 80px bar and mark untouched. The icons stay centred and nothing
          overlaps — only the row height differs. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-margin-mobile sm:h-20 lg:px-margin">
        <div className="flex items-center gap-space-md">
          <button
            className="-ml-1.5 rounded-sm p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface xl:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <IconX size={22} /> : <IconMenu size={22} />}
          </button>
          {/* Animated mark: 64px on phones, the approved 80px from sm up — the wordmark
              is hidden on phones (compactOnMobile) and its size is untouched elsewhere
              (wordmarkHeight = the 40px default's derived 29px). */}
          <Logo height={80} mobileHeight={64} wordmarkHeight={29} compactOnMobile />
        </div>

        <nav className="hidden items-center gap-space-lg xl:flex" aria-label="Primary">
          {NAV.map((n) => {
            const active = isActivePath(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`py-space-xs transition-colors ${
                  active
                    ? "border-b-2 border-primary text-primary"
                    : "border-b-2 border-transparent text-on-surface-variant hover:text-primary"
                } text-label-lg`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-space-sm sm:gap-space-md">
          <button
            aria-label="Search"
            aria-expanded={searchOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
            onClick={toggleSearch}
          >
            <IconSearch size={20} />
          </button>

          <Link
            href="/wishlist"
            aria-label={`Wishlist${wishlist.ready && wishlist.count > 0 ? ` (${wishlist.count} items)` : ""}`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
          >
            <IconHeart size={20} />
            {wishlist.ready && wishlist.count > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-container px-0.5 text-[9px] font-bold text-on-primary">
                {wishlist.count}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            aria-label={`Shopping cart, ${cartLabel}`}
            className="relative flex items-center gap-space-xs rounded-full bg-surface-container-low px-space-sm py-space-xs text-on-surface transition-all hover:bg-surface-container-high"
          >
            <IconShoppingBag size={20} className="text-primary" />
            {/* Full price pill from sm up; phones get an icon pill + count badge so
                the nowrap price text can never push the header past the viewport. */}
            <span className="hidden whitespace-nowrap text-label-md font-semibold text-primary text-tabular sm:inline">
              {cartLabel}
            </span>
            {ready && count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-container px-0.5 text-[9px] font-bold text-on-primary sm:hidden">
                {count}
              </span>
            )}
          </Link>

          {principal ? (
            <Link
              href="/account"
              aria-label={`Your account${firstName ? `, ${displayName}` : ""}`}
              title={displayName || "Your account"}
              className="ml-space-xs flex h-9 items-center gap-2 rounded-full bg-surface-container-low pl-1 pr-2.5 transition-colors hover:bg-surface-container-high sm:pr-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[11px] font-bold text-on-primary">
                {photoUrl && !photoFailed ? (
                  <img
                    src={photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : initials ? (
                  initials
                ) : (
                  <IconUser size={15} />
                )}
              </span>
              {firstName ? (
                <span className="hidden max-w-[7rem] truncate text-label-md font-semibold text-primary lg:inline">
                  {firstName}
                </span>
              ) : null}
            </Link>
          ) : (
            <Link
              href="/account/login"
              aria-label="Sign in"
              className="ml-space-xs flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-container"
            >
              <IconUser size={17} />
            </Link>
          )}
        </div>
      </div>

      {/* Expanding search row */}
      {searchOpen && (
        <div className="border-t border-outline-variant/40 bg-surface">
          <form onSubmit={submitSearch} role="search" className="mx-auto flex max-w-7xl gap-space-sm px-margin-mobile py-space-md lg:px-margin">
            <input
              ref={searchRef}
              className="input-base"
              placeholder="Search honey, kesar, dry fruits…"
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn-primary shrink-0 px-5 text-label-lg">
              Search
            </button>
          </form>
        </div>
      )}

      {/* Mobile navigation */}
      {menuOpen && (
        <nav
          className="border-t border-outline-variant/40 bg-surface px-margin-mobile py-space-md xl:hidden"
          aria-label="Mobile"
        >
          <ul className="space-y-space-sm">
            {NAV.map((n) => {
              const active = isActivePath(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-sm px-3 py-2.5 text-label-lg ${
                      active ? "bg-surface-container-high text-primary" : "text-on-surface hover:bg-surface-container-low"
                    }`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {n.label}
                    <IconArrowRight size={16} className={active ? "text-primary" : "text-on-surface-variant"} />
                  </Link>
                </li>
              );
            })}
            <li className="border-t border-outline-variant/40 pt-space-sm">
              {principal ? (
                <button
                  className="block w-full rounded-sm px-3 py-2.5 text-left text-label-lg text-primary-container hover:bg-surface-container-low"
                  onClick={() => {
                    void signOut();
                    setMenuOpen(false);
                  }}
                >
                  Sign out ({principal.displayName ?? "account"})
                </button>
              ) : (
                <Link
                  href="/account/login"
                  className="block rounded-sm px-3 py-2.5 text-label-lg text-primary hover:bg-surface-container-low"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in / Register
                </Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
