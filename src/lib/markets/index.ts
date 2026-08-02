/**
 * The markets the app runs in.
 *
 * Today there is one. The point of the registry is that adding a second is a
 * known, finite job rather than an archaeology exercise: write the file, put
 * it in MARKETS, insert the matching row in the `markets` table. The MarketSpec
 * type in ./types is the checklist — it will not compile until every question
 * a country has to answer has been answered.
 *
 * See ./README.md for the full procedure, including the parts that live in the
 * database and cannot be reached from here.
 */

import { LIBYA } from "./libya";
import type { MarketSpec, PayoutMethod } from "./types";

export type { MarketCity, MarketSpec, PayoutMethod } from "./types";

/** Every market, by code. Add a country here and nowhere else in this folder. */
export const MARKETS: Record<string, MarketSpec> = {
  [LIBYA.code]: LIBYA,
};

/**
 * The market the app falls back to.
 *
 * While there is one market this is also the answer for everybody. Once there
 * are two it stops being: it becomes the value for a session that has not
 * loaded a profile yet, and every screen that shows money, phone numbers or
 * cities has to ask for the *user's* market instead — `marketOf(profile.market)`.
 */
export const DEFAULT_MARKET_CODE = LIBYA.code;

/** The spec for a code, falling back rather than throwing — a profile carrying
 *  a market that has since been retired should still render. */
export function marketOf(code: string | null | undefined): MarketSpec {
  return (code && MARKETS[code]) || MARKETS[DEFAULT_MARKET_CODE];
}

/* ---- helpers derived from a market, so no caller re-implements the rule ---- */

/** What the platform keeps on one unit at this price, in the market's currency. */
export function platformFee(price: unknown, m: MarketSpec = marketOf(null)): number {
  const pr = Number(price) || 0;
  const { pct, fixed, threshold } = m.money.fee;
  return pr > threshold ? parseFloat((pr * pct).toFixed(2)) : fixed;
}

/** True when a national number is valid for the market. */
export function isLocalPhone(num: unknown, m: MarketSpec = marketOf(null)): boolean {
  return m.contact.localPhone.test(String(num ?? "").replace(/\D/g, ""));
}

/** Every prefix any payout method in the market accepts, in method order.
 *  Used as the permissive set when the chosen method does not narrow it. */
export function payoutPhonePrefixes(m: MarketSpec = marketOf(null)): string[] {
  const out: string[] = [];
  for (const method of m.payout.methods) {
    for (const p of method.phonePrefixes ?? []) if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** The payout method entry for a stored value, or null if it is not offered. */
export function payoutMethod(value: unknown, m: MarketSpec = marketOf(null)): PayoutMethod | null {
  const s = String(value ?? "");
  return m.payout.methods.find((x) => x.value === s) ?? null;
}
