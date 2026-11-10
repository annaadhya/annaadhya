/** Deterministic, URL-safe slug generation for product/category names. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** Time-ordered, collision-resistant id without external deps: `<prefix>-<base36 ts>-<rand>`. */
export function newId(prefix: string, randomLen = 8): string {
  const ts = Date.now().toString(36);
  const rand = randomChars(randomLen);
  return prefix ? `${prefix}_${ts}${rand}` : `${ts}${rand}`;
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomChars(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[cryptoRandomInt(ALPHABET.length)];
  }
  return out;
}

function cryptoRandomInt(maxExclusive: number): number {
  // Web Crypto (Node >= 19 exposes crypto global; browsers always do)
  const g = globalThis as { crypto?: { getRandomValues(b: Uint32Array): Uint32Array } };
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    g.crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** Deterministic id for demo/seed records so re-imports are idempotent. */
export function stableId(...parts: (string | number)[]): string {
  const raw = parts.join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(36).padStart(7, "0") + (h2 >>> 0).toString(36).padStart(7, "0");
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
