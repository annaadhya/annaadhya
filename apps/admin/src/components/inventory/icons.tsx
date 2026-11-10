/** Inventory page icons — inline SVG, 24px grid, no icon library (mirrors nav-items pattern). */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconTune = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 21v-5M4 10V3M12 21v-9M12 6V3M20 21v-3M20 12V3" />
    <circle cx="4" cy="13" r="2.2" />
    <circle cx="12" cy="9" r="2.2" />
    <circle cx="20" cy="15" r="2.2" />
  </svg>
);

export const IconReceipt = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6 2h12v20l-2.5-1.5L13 22l-2.5-1.5L8 22l-2-1.5zM9 7h6M9 11h6M9 15h4" />
  </svg>
);

export const IconDownload = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconPlus = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const IconSearch = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const IconWarn = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4m0 4h.01" />
  </svg>
);

export const IconBoxOff = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5m0 0 9-5m-9 5v10" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

export const IconWallet = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18M15.5 15h2" />
  </svg>
);

export const IconBox = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5m0 0 9-5m-9 5v10" />
  </svg>
);

export const IconChevronLeft = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const IconChevronRight = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconCalculate = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
  </svg>
);

export const IconCheck = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconTruck = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7M6.5 19a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM17.5 19a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z" />
  </svg>
);

export const IconClose = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
