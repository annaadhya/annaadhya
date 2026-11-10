import type { ComponentType } from "react";

/** Sidebar navigation definition. `permission` gates visibility (UI only — the API enforces). */
export interface NavItem {
  href: string;
  label: string;
  permission: string;
  /** Visible when the principal has ANY of these (used for combined sections). */
  anyOf?: string[];
  icon: ComponentType<{ className?: string }>;
}

export interface NavGroup {
  /** Small uppercase section caption, e.g. "OVERVIEW" / "COMMERCE". */
  title: string;
  /** Tailwind text color for the group's icons (heritage palette accents). */
  iconClass: string;
  items: NavItem[];
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* Inline SVG icons — 24px grid, no icon library. Glyphs follow the Material
 * Symbols used in the approved heritage design (dashboard, inventory_2,
 * receipt_long, warehouse, local_shipping, group, payments, analytics, badge,
 * settings, history) redrawn in the console's consistent stroke style. */

export const IconDashboard = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3" y="3" width="7.5" height="9" rx="1.4" />
    <rect x="13.5" y="3" width="7.5" height="5" rx="1.4" />
    <rect x="13.5" y="11" width="7.5" height="10" rx="1.4" />
    <rect x="3" y="15" width="7.5" height="6" rx="1.4" />
  </svg>
);

export const IconProducts = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 8.2v9.2a1.8 1.8 0 0 1-1.06 1.64l-7.2 2.7a2 2 0 0 1-1.48 0l-7.2-2.7A1.8 1.8 0 0 1 3 17.4V8.2" />
    <path d="M3.3 7.1 12 3.6l8.7 3.5L12 10.6 3.3 7.1Z" />
    <path d="M12 10.6V22" />
  </svg>
);

export const IconOrders = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6.5 3h11a1 1 0 0 1 1 1v17l-2.17-1.3-2.16 1.3-2.17-1.3L9.83 21l-2.16-1.3L5.5 21V4a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6M9 12h6M9 15.5h3.5" />
  </svg>
);

export const IconInventory = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 21V9.3L12 3.8l9 5.5V21" />
    <path d="M6.5 21v-7.5h11V21" />
    <path d="M9.5 21v-3.8h5V21" />
    <path d="M3 21h18" />
  </svg>
);

export const IconSuppliers = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2.5 6.5h11v10.5h-11z" />
    <path d="M13.5 10h3.6l3.4 3.4v3.6h-7" />
    <circle cx="7" cy="18.6" r="1.9" />
    <circle cx="16.6" cy="18.6" r="1.9" />
  </svg>
);

/** Supplier network — a field shed with a sprout (estate / farm partners). */
export const IconSupplierNetwork = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 20V10l7-5 7 5v10" />
    <path d="M3 20h18M7 20v-5h6v5" />
    <path d="M9 10.5c1.8 0 3-1.1 3-3-1.8 0-3 1.1-3 3Zm6 0c-1.3 0-2.2-.8-2.2-2.2 1.3 0 2.2.8 2.2 2.2Z" />
  </svg>
);

export const IconCustomers = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconExpenses = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.7" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

export const IconReports = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V7M17 20v-9" />
  </svg>
);

export const IconTeam = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <circle cx="9" cy="11" r="2.1" />
    <path d="M5.6 17.5c.6-1.9 1.9-2.8 3.4-2.8s2.8.9 3.4 2.8" />
    <path d="M15.5 9h3.5M15.5 12.5h3.5" />
  </svg>
);

export const IconSettings = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const IconAudit = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3.5 4.5V9H8" />
    <path d="M4.6 13.5a8 8 0 1 0 .9-6.7L3.5 9" />
    <path d="M12 8.5V12l2.5 2.5" />
  </svg>
);

/* --------------------------- Storefront (CMS) icons --------------------------- */

/** Pages — a document sheet with folded corner + text lines. */
export const IconPages = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V7.8L14 3Z" />
    <path d="M14 3v4.8h4.8" />
    <path d="M9 12h6M9 15.5h6M9 8.5h2" />
  </svg>
);

/** Navigation — compass rose (navbar + footer link management). */
export const IconNavigation = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </svg>
);

/** Homepage — a storefront awning over a shopfront. */
export const IconHomepage = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 10 5.3 4.5h13.4L20 10" />
    <path d="M4 10a2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 4.8 0 2.4 2.4 0 0 0 1.6 2.26V20H4v-7.74A2.4 2.4 0 0 0 4 10Z" />
    <path d="M9.5 20v-5h5v5" />
  </svg>
);

/** Categories — drawer with labelled shelves (category management). */
export const IconCategories = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M3 14.5h18" />
    <path d="M7 6.75h.01M7 12h.01M7 17.25h.01" />
  </svg>
);

/**
 * Sidebar sections in the approved design order: OVERVIEW → STOREFRONT →
 * COMMERCE → OPERATIONS → INSIGHTS → ADMINISTRATION. Items link to the routes
 * that actually exist in this app; permission gating stays per-item.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    iconClass: "text-primary",
    items: [
      { href: "/dashboard", label: "Dashboard", permission: "dashboard:read", icon: IconDashboard },
    ],
  },
  {
    title: "Storefront",
    iconClass: "text-primary",
    items: [
      { href: "/pages", label: "Pages", permission: "content:read", icon: IconPages },
      { href: "/categories", label: "Categories", permission: "categories:read", icon: IconCategories },
      { href: "/navigation", label: "Navigation", permission: "content:read", icon: IconNavigation },
      { href: "/homepage", label: "Homepage", permission: "content:read", icon: IconHomepage },
    ],
  },
  {
    title: "Commerce",
    iconClass: "text-primary",
    items: [
      { href: "/products", label: "Products", permission: "products:read", icon: IconProducts },
      { href: "/orders", label: "Orders", permission: "orders:read", icon: IconOrders },
    ],
  },
  {
    title: "Operations",
    iconClass: "text-secondary",
    items: [
      { href: "/inventory", label: "Inventory", permission: "inventory:read", icon: IconInventory },
      { href: "/suppliers", label: "Suppliers", permission: "suppliers:read", icon: IconSupplierNetwork },
      { href: "/purchases", label: "Purchases", permission: "purchases:read", anyOf: ["purchases:read"], icon: IconSuppliers },
      { href: "/customers", label: "Customers", permission: "customers:read", icon: IconCustomers },
      { href: "/expenses", label: "Expenses", permission: "expenses:read", icon: IconExpenses },
    ],
  },
  {
    title: "Insights",
    iconClass: "text-on-tertiary-container",
    items: [
      { href: "/reports", label: "Reports", permission: "reports:read", icon: IconReports },
    ],
  },
  {
    title: "Administration",
    iconClass: "text-outline",
    items: [
      { href: "/team", label: "Team", permission: "team:read", icon: IconTeam },
      { href: "/settings", label: "Settings", permission: "settings:read", icon: IconSettings },
      { href: "/audit", label: "Audit Log", permission: "audit:read", icon: IconAudit },
    ],
  },
];

/** Flat list (title derivation + active-route matching). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Resolve the current section for a pathname — exact match first, then the
 * LONGEST nav prefix (so /orders/123 highlights Orders, /products/abc/xyz
 * highlights Products) and never a bare substring check.
 */
export function matchNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
