/* Pages console icons — 24px grid, same stroke style as the console's shared icons. */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconArrowUp = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 19V5m-6 6 6-6 6 6" />
  </svg>
);

export const IconArrowDown = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 5v14m6-6-6 6-6-6" />
  </svg>
);

export const IconArrowUpRight = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M7 17 17 7m-8.5 0H17v8.5" />
  </svg>
);

export const IconRestore = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3.5 5v4.5H8" />
    <path d="M4.6 13.5a8 8 0 1 0 .9-6.7L3.5 9.5" />
  </svg>
);

export const IconDoc = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V7.8L14 3Z" />
    <path d="M14 3v4.8h4.8M9 12h6M9 15.5h6" />
  </svg>
);

export const IconFaq = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.2a2.5 2.5 0 0 1 4.85.8c0 1.6-2.35 2-2.35 3.4" />
    <path d="M12 16.8h.01" />
  </svg>
);

export const IconEye = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconEyeOff = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-3.2 3.9M6.6 6.9A16.4 16.4 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const IconPublish = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 15V4m-4 4 4-4 4 4" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconUnpublish = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 4v11m-4-4 4 4 4-4" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconArchive = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8" />
    <path d="M10 12h4" />
  </svg>
);

export const IconTrash = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 6.5h18M8 6.5V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8v1.7M5.5 6.5 6.4 19a2 2 0 0 0 2 1.9h7.2a2 2 0 0 0 2-1.9l.9-12.5" />
    <path d="M10 10.5v6m4-6v6" />
  </svg>
);

export const IconEdit = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.4-9.4Z" />
  </svg>
);

export const IconLock = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);
