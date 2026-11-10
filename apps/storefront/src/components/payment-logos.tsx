import Image from "next/image";

/**
 * Accepted payment methods — authentic brand marks as local static assets.
 *
 * Asset provenance:
 *  - upi.svg / rupay.svg / mastercard.svg: official vector logos (Wikimedia Commons,
 *    the brands' published identity marks), sanitized to plain path data.
 *  - visa.svg: the Visa wordmark vector (Simple Icons), filled with the official
 *    Visa blue #1A1F71.
 *  - netbanking.svg: a generic bank glyph (Tabler Icons, MIT) — net banking is a
 *    method, not a brand, so it is shown as a clearly labelled glyph + text rather
 *    than a fabricated logo.
 *
 * Accuracy rule: this list mirrors what the configured gateway (Razorpay) actually
 * supports — UPI, cards (Visa, Mastercard, RuPay) and net banking. In demo/mock
 * mode the checkout hides the marks entirely instead of implying live support.
 * No payment logic is touched here — presentation only.
 */

const UPI_SRC = "/images/payments/upi.svg";
const RUPAY_SRC = "/images/payments/rupay.svg";
const VISA_SRC = "/images/payments/visa.svg";
const MASTERCARD_SRC = "/images/payments/mastercard.svg";
const NETBANKING_SRC = "/images/payments/netbanking.svg";

/** Rendered mark widths (px) — heights follow each brand's true aspect ratio.
 *  Tuned so every mark shares one optical line inside the chip. */
const MARKS = {
  upi: { src: UPI_SRC, label: "UPI", alt: "UPI", width: 46, ratio: 99.07 / 35.01 },
  rupay: { src: RUPAY_SRC, label: "RuPay", alt: "RuPay", width: 50, ratio: 71.87 / 18.91 },
  visa: { src: VISA_SRC, label: "Visa", alt: "Visa", width: 42, ratio: 1 },
  mastercard: { src: MASTERCARD_SRC, label: "Mastercard", alt: "Mastercard", width: 32, ratio: 999.2 / 776 },
  netbanking: { src: NETBANKING_SRC, label: "NetBanking", alt: "Net Banking", width: 17, ratio: 1 },
} as const;

export type PaymentMode = keyof typeof MARKS;

/** The store's accepted methods — exactly the current footer's set. */
export const DEFAULT_PAYMENT_MODES: PaymentMode[] = [
  "upi",
  "rupay",
  "visa",
  "mastercard",
  "netbanking",
];

export function PaymentLogos({
  modes = DEFAULT_PAYMENT_MODES,
  className = "",
}: {
  /** Ordered subset of the supported marks. */
  modes?: PaymentMode[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Accepted payment methods">
      {modes.map((mode) => {
        const mark = MARKS[mode];
        const height = Math.round(mark.width / mark.ratio);
        return (
          <li
            key={mode}
            title={mark.label}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-outline-variant/40 bg-white px-2 shadow-sm"
          >
            <Image
              src={mark.src}
              alt={mark.alt}
              width={mark.width}
              height={height}
              unoptimized
              style={{ width: mark.width, height: "auto" }}
            />
            {mode === "netbanking" && (
              <span className="text-[0.625rem] font-bold uppercase tracking-wide text-on-surface">
                NetBanking
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
