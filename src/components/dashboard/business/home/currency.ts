/* Business-home wallet currency selection — ported verbatim from
   window.__bizSelSym / window.__bizWalletCur / the recomputeAnalytics
   currency-bucketing logic in business.script.js. */

import type { Order } from "../lib/types";

export type CurEarn = { sym: string; gross: number; comm: number; plat: number; net: number };

/** Buckets delivered orders by currency code, exactly like the original
 *  `byCur` map built inside the overridden `recomputeAnalytics`. */
export function computeEarnByCur(orders: Order[]): Record<string, CurEarn> {
  const byCur: Record<string, CurEarn> = {};
  orders.forEach((o) => {
    if (o._status !== "delivered") return;
    const code = o.curCode || "USD";
    const sym = o.sym || "$";
    if (!byCur[code]) byCur[code] = { sym, gross: 0, comm: 0, plat: 0, net: 0 };
    const gross = (Number(o.price) || 0) * (Number(o.qty) || 0);
    const comm = Number(o.commission) || 0;
    const plat = Number(o.platformFee) || 0;
    byCur[code].gross += gross;
    byCur[code].comm += comm;
    byCur[code].plat += plat;
    byCur[code].net += gross - comm - plat;
  });
  return byCur;
}

/** Picks the wallet currency to display: the previously-selected one if it
 *  still exists in `byCur`, otherwise the first available currency, else LYD. */
export function pickWalletCur(byCur: Record<string, CurEarn>, prev: string | null): string {
  const codes = Object.keys(byCur);
  if (prev && byCur[prev]) return prev;
  return codes[0] || "LYD";
}
