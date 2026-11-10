/* Suppliers console icons — 24px grid, same stroke style as the console's shared icons. */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconLeaf = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M5 19c8 1 14-4 14-13-9 0-14 5-14 13Z" />
    <path d="M5 19c2-5 5-8 9-10" />
  </svg>
);

export const IconEstate = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 21V9l6-4 6 4v12" />
    <path d="M15 21V11l6 3v7M3 21h18M6.5 12h2m-2 3.5h2m4-3.5h2m-2 3.5h2" />
  </svg>
);

export const IconCoop = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconPackage = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M21 8.2v9.2a1.8 1.8 0 0 1-1.06 1.64l-7.2 2.7a2 2 0 0 1-1.48 0l-7.2-2.7A1.8 1.8 0 0 1 3 17.4V8.2" />
    <path d="M3.3 7.1 12 3.6l8.7 3.5L12 10.6 3.3 7.1Z" />
    <path d="M12 10.6V22" />
  </svg>
);

export const IconOther = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconEdit = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.4-9.4Z" />
  </svg>
);

export const IconEye = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconPause = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="7" y="5" width="3.5" height="14" rx="1" />
    <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
  </svg>
);

export const IconPlay = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.2-7.2a.8.8 0 0 0 0-1.4L8.2 4.1a.8.8 0 0 0-1.2.7Z" />
  </svg>
);

export const IconPhone = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9Z" />
  </svg>
);

export const IconMail = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const IconPin = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const IconSparkle = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.7-5.7-2.8 2.8M9.1 14.9l-2.8 2.8m11.4 0-2.8-2.8M9.1 9.1 6.3 6.3" />
  </svg>
);

export const IconShield = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5L12 2Z" />
    <path d="m9 11.5 2 2 4-4.5" />
  </svg>
);

export const IconUsers = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconClose = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconTrash = ({ className = "" }: { className?: string }) => (
  <svg className={className} {...svgProps} aria-hidden>
    <path d="M3 6.5h18M8 6.5V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8v1.7M5.5 6.5 6.4 19a2 2 0 0 0 2 1.9h7.2a2 2 0 0 0 2-1.9l.9-12.5" />
    <path d="M10 10.5v6m4-6v6" />
  </svg>
);
