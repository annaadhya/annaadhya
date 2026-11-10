/**
 * Dashboard-specific inline SVG icons — same 24px grid / stroke conventions as
 * nav-items.tsx (no icon library). Reuse NAV_ITEMS icons where one exists.
 */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconProps = { className?: string };

export const IconBag = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6 7V6a6 6 0 0 1 12 0v1M4 7h16l-1.2 12.1A2 2 0 0 1 16.8 21H7.2a2 2 0 0 1-2-1.9L4 7Zm5 4a3 3 0 0 0 6 0" />
  </svg>
);

export const IconRupee = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M7 3h10M7 8h10M16 3c0 4-3.5 5-7 5 4 0 7 4.5 9 8M7 8l8 13" />
  </svg>
);

export const IconCartCheckout = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="9" cy="20" r="1.6" />
    <circle cx="17" cy="20" r="1.6" />
    <path d="M2 3h2.5l2.6 12.2A2 2 0 0 0 9 16.7h8.4a2 2 0 0 0 2-1.6L21 7H6" />
    <path d="m10.5 10.5 2 2 3.5-3.5" />
  </svg>
);

export const IconBoxes = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M7 16.5 3 14V7l4-2.5L11 7v7l-4 2.5ZM3 7l4 2.5L11 7M7 9.5v7" />
    <path d="M17 16.5 13 14V7l4-2.5L21 7v7l-4 2.5ZM13 7l4 2.5L21 7M17 9.5v7" />
  </svg>
);

export const IconTrendUp = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

export const IconTrendDown = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </svg>
);

export const IconRefresh = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);

export const IconDownload = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
  </svg>
);

export const IconWarning = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01" />
  </svg>
);

export const IconEye = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconArrowRight = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 12h16m0 0-6-6m6 6-6 6" />
  </svg>
);

export const IconTruck = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M1 8a2 2 0 0 1 2-2h9v11H3a2 2 0 0 1-2-2V8Zm11-2h5l4 4v5a2 2 0 0 1-2 2h-7V6Z" />
    <circle cx="6" cy="19" r="1.8" />
    <circle cx="17" cy="19" r="1.8" />
  </svg>
);

export const IconCheckCircle = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Zm-4.5-4.5L9 15l-3-3" />
  </svg>
);

export const IconClock = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" />
  </svg>
);

export const IconWallet = ({ className = "" }: IconProps) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1M3 6v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Zm13 6.5h.01" />
  </svg>
);
