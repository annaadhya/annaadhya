"use client";
/** Mobile bottom navigation from the approved component sheet (home / search / user).
 *  Fixed plinth on <lg viewports with safe-area padding and a gold active marker.
 *  Hidden on product routes — their sticky buy bar owns the bottom edge there — and
 *  on checkout entirely (the focused (checkout) chrome never mounts this layout). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { IconHouse, IconSearch, IconUser } from "./icons";

export function BottomNav() {
  const pathname = usePathname();
  const { principal } = useAuth();

  // The product page's sticky buy bar is fixed to the same edge on <lg screens —
  // two stacked bars would fight for taps, so the nav steps aside there.
  if (pathname.startsWith("/product/")) return null;

  const items = [
    { href: "/", label: "Home", icon: IconHouse, active: pathname === "/" },
    {
      // Deep-link into the shop toolbar field (ShopControls focuses #shopSearch on arrival).
      href: "/shop#shopSearch",
      label: "Search",
      icon: IconSearch,
      active: pathname === "/shop" || pathname.startsWith("/category/"),
    },
    {
      href: principal ? "/account" : "/account/login",
      label: "Account",
      icon: IconUser,
      active: pathname.startsWith("/account"),
    },
  ];

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/50 bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(39,24,16,0.06)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-label-sm transition-colors ${
                active ? "text-primary" : "text-on-surface-variant hover:text-primary"
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-deep"
                  />
                )}
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
