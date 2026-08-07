import type { Money } from "@rtnads/contracts";

/**
 * Pure money helpers. All amounts are integer MINOR units. Division that would
 * divide by zero returns null — never Infinity/NaN — so downstream never sees a
 * fabricated ratio (docs/00 §3, docs/14 §2).
 */

export function money(amount_minor: number, currency: string): Money {
  return { amount_minor: Math.round(amount_minor), currency };
}

/** numeratorMinor / denominator → Money, or null when denominator ≤ 0. */
export function divideMoney(
  numeratorMinor: number,
  denominator: number,
  currency: string,
): Money | null {
  if (!(denominator > 0)) return null;
  return money(numeratorMinor / denominator, currency);
}

/** a / b → number, or null when b ≤ 0. */
export function ratio(a: number, b: number): number | null {
  if (!(b > 0)) return null;
  return a / b;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return money(a.amount_minor + b.amount_minor, a.currency);
}

export function subMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return money(a.amount_minor - b.amount_minor, a.currency);
}
