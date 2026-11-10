/**
 * Compact relative timestamps for catalogue tables ("Today, 09:40 AM" / "Yesterday" /
 * "12 Oct"), IST — matching the rest of the platform's reporting timezone.
 */
const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

function istDateKey(millis: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(millis));
}

/** epoch millis → "Today, 09:40 AM" | "Yesterday" | "12 Oct" | "12 Oct 2025" (older years). */
export function relativeDayTime(millis: number, now: number = Date.now()): string {
  const key = istDateKey(millis);
  const today = istDateKey(now);
  const yesterday = istDateKey(now - 24 * 60 * 60 * 1000);
  if (key === today) return `Today, ${timeFormatter.format(new Date(millis))}`;
  if (key === yesterday) return "Yesterday";
  const withYear = new Date(millis).getUTCFullYear() !== new Date(now).getUTCFullYear();
  return dayFormatter.format(new Date(millis)) + (withYear ? ` ${new Date(millis).getUTCFullYear()}` : "");
}
