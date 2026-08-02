/* Helpers ported from business.script.js (mp-prefixed / __mp* functions). */
import { isAr, moneyParts } from "../lib/format";
import type { Order, PendingActiveStub, Product } from "../lib/types";

/** Five or fewer left counts as low. It drives the badge on the card, the
 *  "Low stock" filter and its count, and the warning colour in the analytics
 *  sheet — one number so those cannot disagree about what "low" means. */
export const LOW_STOCK_THRESHOLD = 5;
export const ACTIVE_MKT_STATUSES = new Set(["pending", "approved", "confirmed"]);

/** __mpEffectiveQty */
export function effectiveQty(p: Product): number {
  const groups = p.variantGroups || [];
  const groupTotals: number[] = [];
  groups.forEach((g) => {
    let gTotal = 0;
    let gTracked = false;
    ((g && (g as { items?: Array<{ qty?: unknown }> }).items) || []).forEach((it) => {
      const q = it && it.qty;
      if (q !== null && q !== undefined && q !== "" && Number.isFinite(Number(q))) {
        gTracked = true;
        gTotal += Math.max(0, Number(q));
      }
    });
    if (gTracked) groupTotals.push(gTotal);
  });
  return groupTotals.length ? Math.min(...groupTotals) : Number(p.qty) || 0;
}

/** mpActiveMarketerCount */
export function activeMarketerCount(p: Product, orders: Order[], pendingActiveStubs: PendingActiveStub[]): number {
  try {
    const pool: Array<{ productId: string; marketerId: string; _status: string }> = [
      ...orders,
      ...pendingActiveStubs,
    ];
    const ids = new Set(
      pool.filter((o) => o.productId === p.id && o.marketerId && ACTIVE_MKT_STATUSES.has(o._status)).map((o) => o.marketerId),
    );
    return ids.size;
  } catch {
    return 0;
  }
}

export function fmtMoney(p: Product, n: unknown): { amount: string; symbol: string; symbolFirst: boolean; spaced: boolean } {
  const sym = p.currency ? p.currency.symbol : "";
  return moneyParts(n, sym, p.currency?.code);
}

export function statusBadges(p: Product): Array<{ cls: string; label: string }> {
  const eq = effectiveQty(p);
  const b: Array<{ cls: string; label: string }> = [];
  if (p.status === "active") b.push({ cls: "mp-status-active", label: isAr() ? "نشط" : "Active" });
  else b.push({ cls: "mp-status-inactive", label: isAr() ? "متوقف" : "Paused" });
  if (eq === 0) b.push({ cls: "mp-status-outofstock", label: isAr() ? "نفدت الكمية" : "Out of stock" });
  else if (eq > 0 && eq <= LOW_STOCK_THRESHOLD) b.push({ cls: "mp-status-lowstock", label: isAr() ? "كمية منخفضة" : "Low stock" });
  return b;
}
