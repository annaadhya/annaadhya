/**
 * Money utilities — all monetary values in the platform are stored as
 * **integer paise** (1 rupee = 100 paise). Floating point must never be used
 * for arithmetic on money. These helpers are the only sanctioned way to parse,
 * transform and format amounts.
 */
import { z } from "zod";

export const MAX_MONEY = 9_000_000_000_000; // ~₹90,000,000,000 in paise — sanity bound

export class MoneyError extends Error {}

/** Parse a rupee string/number (e.g. `"₹1,099.00"`, `"199"`, 349.5) into integer paise. */
export function toPaise(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyError("Non-finite amount");
    const p = Math.round(input * 100);
    assertSafeAmount(p);
    return p;
  }
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new MoneyError(`Invalid rupee amount: "${input}"`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  const fracPaise = frac.length === 0 ? 0 : frac.length === 1 ? Number(frac) * 10 : Number(frac);
  const p = Number(whole) * 100 + fracPaise;
  assertSafeAmount(p);
  return p;
}

/** Format integer paise as an INR string, e.g. 109900 -> "₹1,099.00". */
export function formatINR(paise: number, opts: { withDecimals?: boolean } = {}): string {
  assertSafeAmount(paise);
  const withDecimals = opts.withDecimals ?? true;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const rupeeStr = rupees.toLocaleString("en-IN");
  const out = withDecimals ? `₹${rupeeStr}.${String(rem).padStart(2, "0")}` : `₹${rupeeStr}`;
  return negative ? `-${out}` : out;
}

/** Percentage of an amount, computed in integer paise with half-up rounding. */
export function percentOf(paise: number, percent: number): number {
  assertSafeAmount(paise);
  if (!Number.isFinite(percent)) throw new MoneyError("Invalid percent");
  const raw = (paise * percent) / 100;
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw));
  assertSafeAmount(rounded);
  return rounded;
}

/** Basis-points discount (e.g. 500 bps = 5%) applied to an amount in paise. */
export function applyBps(paise: number, bps: number): number {
  assertSafeAmount(paise);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new MoneyError("bps must be 0..10000");
  const raw = (paise * bps) / 10000;
  return Math.sign(raw) * Math.round(Math.abs(raw));
}

export function sumPaise(values: number[]): number {
  const total = values.reduce((acc, v) => {
    assertSafeAmount(v);
    return acc + v;
  }, 0);
  assertSafeAmount(total);
  return total;
}

function assertSafeAmount(paise: number): void {
  if (!Number.isInteger(paise)) throw new MoneyError(`Money must be an integer number of paise, got ${paise}`);
  if (Math.abs(paise) > MAX_MONEY) throw new MoneyError("Amount out of supported range");
}

/** Zod schema: non-negative integer paise amount. */
export const paiseSchema = z
  .number({ invalid_type_error: "Amount must be a number" })
  .int("Amount must be an integer number of paise")
  .min(0, "Amount cannot be negative")
  .max(MAX_MONEY, "Amount out of supported range");

/** Zod schema: positive integer quantity. */
export const quantitySchema = z.number().int().min(1, "Quantity must be at least 1").max(9999);
