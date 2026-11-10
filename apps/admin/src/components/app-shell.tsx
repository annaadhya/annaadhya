"use client";
/**
 * AppShell — the guarded console chrome from the approved heritage design
 * ("Modern Indian Heritage Editorial", Stitch reference):
 *
 *   Desktop (≥lg):  fixed 288px sidebar (brand header → grouped nav → user
 *                   card) + fixed topbar (breadcrumb with dynamic page title,
 *                   UI-only search, notifications, profile menu) over the
 *                   main content region.
 *   Mobile (<lg):   off-canvas drawer with backdrop + hamburger in the topbar.
 *
 * Guard rule (unchanged): redirect to /login when there is no session or the
 * principal is not staff, carrying the attempted path. Protected content is
 * never rendered before the session check completes. Nav items the principal's
 * permissions lack are hidden (the API re-checks everything server-side).
 *
 * Honest UI: search and notifications are visual controls only — no fabricated
 * results, counts or unread states. Sign-out uses the real auth logout().
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { NAV_GROUPS, matchNavItem, type NavItem } from "./nav-items";
import { humanize } from "@/lib/format";

/* ------------------------------ small icons ------------------------------ */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
} as const;

const IconMenu = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const IconClose = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

const IconSearch = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

const IconBell = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5" />
    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);

const IconChevronDown = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconChevronRight = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const IconPerson = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c.9-3.9 3.9-5.5 7.5-5.5s6.6 1.6 7.5 5.5" />
  </svg>
);

const IconVerified = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.4 12.3 2.4 2.4 4.8-5" />
  </svg>
);

const IconLogout = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);

/* ------------------------------ brand block ------------------------------ */

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static PNG; /admin prefix required by basePath (next.config.ts) */}
      <img src="/admin/brand/annaadhya-logo.png" alt="Annaadhya Products logo" width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-heritage-display text-headline-sm font-semibold text-primary">Annaadhya</span>
        <span className="text-label-sm font-bold uppercase tracking-[0.14em] text-secondary">Products</span>
      </span>
    </Link>
  );
}

/* --------------------------------- nav ---------------------------------- */

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-label-lg transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        active
          ? "bg-primary-container font-bold text-on-primary-container shadow-[0_1px_4px_rgba(39,24,16,0.08)]"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-primary-fixed-dim" : "text-primary group-hover:text-primary"}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { principal } = useAuth();
  const permissions = principal?.permissions ?? [];

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    visibleItems: group.items.filter((item) =>
      item.anyOf ? item.anyOf.some((p) => permissions.includes(p)) : permissions.includes(item.permission),
    ),
  })).filter((group) => group.visibleItems.length > 0);

  if (groups.length === 0) {
    return <p className="px-2.5 py-2 text-body-sm text-on-surface-variant">No sections available for your role.</p>;
  }

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-space-md">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-space-xs">
          <div className="px-2.5 py-1 text-label-sm font-bold uppercase tracking-[0.14em] text-outline">
            {group.title}
          </div>
          {group.visibleItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ------------------------------- user card ------------------------------- */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "A";
}

function UserCard() {
  const { principal } = useAuth();
  const name = principal?.displayName || principal?.email || principal?.uid || "Admin";
  const showInitials = Boolean(principal?.displayName || principal?.email);

  return (
    <div className="m-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-[0_1px_8px_rgba(39,24,16,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary text-label-md font-bold">
              {showInitials ? initialsOf(name) : <IconPerson className="h-[18px] w-[18px]" />}
            </span>
            <span aria-hidden className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-surface-container-lowest" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-label-md font-semibold text-on-surface">{name}</span>
            <span className="truncate text-label-sm text-on-surface-variant">{humanize(principal?.role ?? "")}</span>
          </span>
        </div>
        <IconVerified className="h-[18px] w-[18px] shrink-0 text-secondary" />
      </div>
    </div>
  );
}

/* ------------------------------ sidebar body ----------------------------- */

function SidebarBody({ pathname, onNavigate, onClose }: { pathname: string; onNavigate?: () => void; onClose?: () => void }) {
  return (
    <>
      <div className="flex h-20 shrink-0 items-center justify-between gap-2 px-4">
        <Brand onNavigate={onNavigate} />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <IconClose className="h-5 w-5" />
          </button>
        ) : (
          <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-on-secondary-container">
            Admin Console
          </span>
        )}
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-space-md pb-space-md">
        <NavLinks pathname={pathname} onNavigate={onNavigate} />
      </div>
      <UserCard />
    </>
  );
}

/* --------------------------------- shell --------------------------------- */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { principal, ready, mode, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const headerControlsRef = useRef<HTMLDivElement>(null);

  // Guard: no session or not staff → /login, carrying the attempted path (usePathname is
  // already basePath-clean) so the login page can return here after authorization.
  // (Client-side; the API re-checks every request, and /login sanitizes the ?next= value.)
  useEffect(() => {
    if (ready && (!principal || !principal.isStaff)) {
      const search = typeof window !== "undefined" && window.location.search.startsWith("?")
        ? window.location.search
        : "";
      const attempted = `${pathname}${search}`;
      router.replace(`/login?next=${encodeURIComponent(attempted)}`);
    }
  }, [ready, principal, router, pathname]);

  // Close overlays on Escape; lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen && !profileOpen && !notifOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setProfileOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    if (drawerOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = previous;
      };
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, profileOpen, notifOpen]);

  // Dismiss the topbar dropdowns on outside click.
  useEffect(() => {
    if (!profileOpen && !notifOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (headerControlsRef.current && !headerControlsRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [profileOpen, notifOpen]);

  const signOut = useCallback(() => {
    setProfileOpen(false);
    logout();
    router.replace("/login");
  }, [logout, router]);

  // While restoring the session, avoid flashing the console.
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary-container border-t-transparent" aria-hidden />
          <p className="text-body-sm text-on-surface-variant">Restoring session…</p>
        </div>
      </div>
    );
  }

  if (!principal || !principal.isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="text-body-sm text-on-surface-variant">Redirecting to sign-in…</p>
      </div>
    );
  }

  const current = matchNavItem(pathname);
  const pageTitle = current?.label ?? humanize(pathname.split("/").filter(Boolean)[0] ?? "console");
  const canSeeSettings = principal.permissions.includes("settings:read");

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Skip link for keyboard users */}
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>

      {/* Desktop sidebar — fixed, exactly the design's 288px rail */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-72 flex-col overflow-y-auto bg-surface-container-low shadow-[0_1px_8px_rgba(39,24,16,0.06)] lg:flex">
        <SidebarBody pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="absolute inset-0 bg-inverse-surface/45 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface-container-low shadow-xl">
            <SidebarBody pathname={pathname} onNavigate={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      {/* Content column (offset by the fixed sidebar from lg up) */}
      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="fixed inset-x-0 top-0 z-30 h-20 bg-surface/80 shadow-[0_1px_8px_rgba(39,24,16,0.04)] backdrop-blur-xl lg:left-72">
          <div className="flex h-full items-center justify-between gap-3 px-4 lg:px-6">
            {/* Left: hamburger + breadcrumb with the dynamic page title */}
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-label="Open navigation"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface lg:hidden"
              >
                <IconMenu className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-1 text-label-sm font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                <span className="hidden sm:inline">Annaadhya</span>
                <IconChevronRight className="hidden h-3.5 w-3.5 sm:inline" aria-hidden />
                <span className="truncate text-primary">{pageTitle}</span>
                {mode?.sandbox ? (
                  <span className="ml-2 hidden shrink-0 rounded-full bg-secondary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-on-secondary-fixed lg:inline">
                    Sandbox
                  </span>
                ) : null}
              </div>
            </div>

            {/* Right: search (UI only), notifications, profile */}
            <div ref={headerControlsRef} className="flex shrink-0 items-center gap-2 lg:gap-3">
              {/* Visual search control — no global-search backend exists yet, so this
                  input intentionally performs no queries and fabricates nothing. */}
              <div className="relative hidden w-56 lg:w-72 xl:w-96 md:block">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
                <input
                  type="text"
                  aria-label="Search (visual only — not wired to a backend yet)"
                  placeholder="Search products, orders, customers…"
                  className="w-full rounded-full bg-surface-container-lowest py-1.5 pl-10 pr-4 text-body-sm text-on-surface placeholder:text-on-surface-variant/70 shadow-[inset_0_0_0_1px_rgba(217,193,194,0.5)] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Notifications — appearance only; the panel states honestly that
                  no alerting backend is connected (no fabricated counts/reads). */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  aria-expanded={notifOpen}
                  aria-label="Notifications"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <IconBell className="h-[22px] w-[22px]" />
                </button>
                {notifOpen ? (
                  <div className="absolute right-0 top-12 w-72 rounded-xl bg-surface-container-lowest p-4 shadow-[0_4px_24px_rgba(39,24,16,0.14)] ring-1 ring-outline-variant/40">
                    <p className="text-label-md font-semibold text-on-surface">Notifications</p>
                    <p className="mt-2 text-body-sm text-on-surface-variant">
                      You&apos;re all caught up. Alerts will appear here once notification
                      delivery is configured for this console.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Profile menu — shows the real session principal; Sign out uses the
                  existing auth logout() (admin session only, Firebase untouched). */}
              <div className="relative border-l border-outline-variant/40 pl-2 lg:pl-3">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-full bg-surface-container-lowest py-1 pl-1 pr-2 text-left transition-colors hover:bg-surface-container-high"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary text-label-sm font-bold">
                    {principal.displayName || principal.email ? initialsOf(principal.displayName || principal.email || "A") : <IconPerson className="h-[18px] w-[18px]" />}
                  </span>
                  <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                    <span className="max-w-[10rem] truncate text-label-sm font-semibold text-on-surface">
                      {principal.displayName || principal.email || principal.uid}
                    </span>
                    <span className="text-[10px] font-semibold text-secondary">{humanize(principal.role)}</span>
                  </span>
                  <IconChevronDown className="hidden h-4 w-4 text-outline sm:inline" />
                </button>
                {profileOpen ? (
                  <div role="menu" aria-label="Account" className="absolute right-0 top-14 w-64 rounded-xl bg-surface-container-lowest p-2 shadow-[0_4px_24px_rgba(39,24,16,0.14)] ring-1 ring-outline-variant/40">
                    <div className="border-b border-outline-variant/40 px-3 py-2.5">
                      <p className="truncate text-label-md font-semibold text-on-surface">
                        {principal.displayName || principal.email || principal.uid}
                      </p>
                      {principal.email && principal.displayName ? (
                        <p className="truncate text-label-sm text-on-surface-variant">{principal.email}</p>
                      ) : null}
                      <span className="mt-1.5 inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-secondary-container">
                        {humanize(principal.role)}
                      </span>
                    </div>
                    {canSeeSettings ? (
                      <Link
                        role="menuitem"
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-label-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                      >
                        <IconSettingsIcon />
                        Settings
                      </Link>
                    ) : null}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={signOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-label-lg text-error transition-colors hover:bg-error-container/60"
                    >
                      <IconLogout className="h-4.5 w-4.5" />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {/* Main content region — future admin pages render here */}
        <main
          id="admin-main"
          className="flex-1 px-margin-mobile pt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:px-margin lg:py-space-xl lg:pt-20"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/* Settings glyph for the profile menu (keeps nav icons in nav-items.tsx). */
function IconSettingsIcon({ className = "h-4.5 w-4.5" }: { className?: string }) {
  return (
    <svg className={className} {...svgProps} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
