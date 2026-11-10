/** Stroke icons for the Purchases console — same 24px hand-drawn style as the other consoles. */

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconClose = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);

export const IconPlus = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconDownload = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconEye = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEdit = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M13.5 6.5 17 10" />
  </svg>
);

export const IconTrash = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
    <path d="M10 11v5m4-5v5" />
  </svg>
);

export const IconChevronLeft = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const IconChevronRight = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </svg>
);

/** Goods receiving — an open carton with an inbound arrow. */
export const IconReceive = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
    <path d="M3.5 8 12 12l8.5-4M12 12v8.5" />
    <path d="M7.5 5.7 16 10" />
  </svg>
);

/** Delivery truck (pending deliveries / ordered status). */
export const IconTruck = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2.5 6.5h11v10.5h-11z" />
    <path d="M13.5 10h3.6l3.4 3.4v3.6h-7" />
    <circle cx="7" cy="18.6" r="1.9" />
    <circle cx="16.6" cy="18.6" r="1.9" />
  </svg>
);

/** Double check (fully received). */
export const IconCheckAll = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="m2.5 12.5 4.5 4.5L15.5 8" />
    <path d="m10.5 15.5 2 1.5 9-9" />
  </svg>
);

/** Half-timed clock (partially received). */
export const IconTimelapse = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 12V7.5M12 12l3.2 3.2" />
  </svg>
);

/** Draft / pencil-paper. */
export const IconDraft = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M8 3.5h8.5L20 7v13.5H8a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 8 3.5Z" />
    <path d="M10 9h6.5M10 12.5h6.5M10 16h4" />
  </svg>
);

/** Cancelled — circle with a slash. */
export const IconCancelled = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 6l12 12" />
  </svg>
);

/** Rupee payments. */
export const IconPayments = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M7 4.5h10M7 8.5h10M14.5 4.5c0 4-2.5 6-7.5 6.5 3 0 4.5 1.5 6 4.5l2 4" />
  </svg>
);

/** Priority inward callout. */
export const IconPriority = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V13" />
    <path d="M12 16.4h.01" strokeWidth="2.4" />
  </svg>
);

/** Shield-ish verified marker for the compliance strip. */
export const IconShieldCheck = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 3.5 5 6v6c0 4.6 3 7.7 7 8.5 4-.8 7-3.9 7-8.5V6l-7-2.5Z" />
    <path d="m9 11.8 2.2 2.2L15.5 9.5" />
  </svg>
);

/** Calendar (dates). */
export const IconCalendar = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3.5" y="5" width="17" height="15.5" rx="1.8" />
    <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" />
  </svg>
);

/** Invoice / receipt document. */
export const IconInvoice = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M6 3.5h12V21l-2.4-1.4L13.2 21l-2.4-1.4L8.4 21 6 19.6V3.5Z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </svg>
);

/** Reset filters. */
export const IconReset = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M4 6h9m7 0h-3M4 12h3m13 0h-9M4 18h9m5 0h-1" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="15" cy="18" r="2" />
  </svg>
);
