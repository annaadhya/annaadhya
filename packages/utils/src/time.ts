/** Time helpers — Firestore stores server timestamps; these helpers normalise I/O shapes. */

export type TimeMillis = number;

export function nowMillis(): TimeMillis {
  return Date.now();
}

export function toIso(millis: TimeMillis): string {
  return new Date(millis).toISOString();
}

/** IST-aware date key (YYYY-MM-DD) for daily grouping — India is UTC+5:30 year-round. */
export function istDateKey(millis: TimeMillis): string {
  const ist = new Date(millis + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function startOfIstDay(millis: TimeMillis): TimeMillis {
  const key = istDateKey(millis);
  // IST midnight == 18:30 previous UTC day
  return Date.parse(`${key}T00:00:00+05:30`);
}

export function addDays(millis: TimeMillis, days: number): TimeMillis {
  return millis + days * 24 * 60 * 60 * 1000;
}

export function addMinutes(millis: TimeMillis, minutes: number): TimeMillis {
  return millis + minutes * 60 * 1000;
}

export function formatDateIN(millis: TimeMillis): string {
  return new Date(millis).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
