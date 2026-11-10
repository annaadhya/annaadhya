/**
 * Formatting helpers. Money rules:
 *  - the wire format is integer paise everywhere; never do parseFloat arithmetic on paise
 *  - rupee *inputs* are converted once at the boundary: paise = Math.round(rupees * 100)
 *  - display uses Indian digit grouping (en-IN)
 */

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 123456 paise → "₹1,234.56" (Indian grouping). */
export function formatINR(paise: number): string {
  return inrFormatter.format(paise / 100);
}

/** Whole-rupee display for tight KPI cards: 123456 paise → "₹1,235". */
export function formatINRRounded(paise: number): string {
  return inrCompactFormatter.format(Math.round(paise / 100));
}

const numberFormatter = new Intl.NumberFormat("en-IN");

/** 1234567 → "12,34,567" (Indian grouping). */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Convert a rupee amount typed by the user into integer paise.
 * Accepts "1,234.5" style input; Math.round guards the float boundary.
 * Returns NaN for empty/invalid input so callers can validate.
 */
export function rupeesToPaise(rupees: string): number {
  // Tolerant to how people actually type money: "₹49", "1,299", " 49 " all parse.
  const cleaned = rupees.replace(/[₹,\s]/g, "").trim();
  if (cleaned === "") return NaN;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

/** paise → editable rupee string with exactly 2 decimals ("1234.50"). */
export function paiseToRupeeInput(paise: number): string {
  return (paise / 100).toFixed(2);
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** epoch millis → "05 Feb 2026" (IST, the platform's reporting timezone). */
export function formatDate(millis: number): string {
  return dateFormatter.format(new Date(millis));
}

/** epoch millis → "05 Feb 2026, 03:42 pm" (IST). */
export function formatDateTime(millis: number): string {
  return dateTimeFormatter.format(new Date(millis));
}

const dateTimeCompactFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kolkata",
});

/** epoch millis → "05 Feb, 03:42 pm" (IST) — compact table cells. */
export function formatDateTimeCompact(millis: number): string {
  return dateTimeCompactFormatter.format(new Date(millis));
}

/** "2026-02-05" → epoch millis (UTC midnight of that calendar day). */
export function dateInputToMillis(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

/** epoch millis → "2026-02-05" for <input type="date">. */
export function millisToDateInput(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

const IST_OFFSET_MINUTES = 330; // the platform's reporting timezone (UTC+05:30, no DST)

/** Start of the IST day containing `millis`, as epoch millis. */
export function istDayStart(millis: number): number {
  const shifted = millis + IST_OFFSET_MINUTES * 60_000;
  return Math.floor(shifted / 86_400_000) * 86_400_000 - IST_OFFSET_MINUTES * 60_000;
}

/** Last millisecond of the IST day containing `millis`. */
export function istDayEnd(millis: number): number {
  return istDayStart(millis) + 86_400_000 - 1;
}

/** Human label for a machine status ("pending_payment" → "Pending payment"). */
export function humanize(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
