import { DOW, MON } from "./constants";
import { ddmmyyyy } from "./format";
import type { ChartData, EarnByCur, MarketerOrder, RingData } from "./types";

/** Earnings count from the moment an order leaves the marketer's hands;
    "ok"/pieces only once it is actually delivered. */
const isEarnStatus = (s: string) =>
  s === "approved" || s === "confirmed" || s === "delivered" || s === "cancelled";

/* A refund is a dated event, not an erasure.
 *
 * Refunding sets the status to 'cancelled', which is also what a failed
 * delivery uses. Reading "did this sell?" off the status therefore made a
 * refunded sale disappear from the day it happened, and made it look like a
 * delivery that had failed. Neither is true: it sold, and then it was
 * reversed, on two different days.
 *
 * delivered_at answers the first question and refunded_at dates the second.
 * They can be trusted: mark_failed refuses to touch a delivered order, and
 * nothing ever clears delivered_at. */

/** Did this order actually reach the customer, whatever happened after? */
const wasDelivered = (o: MarketerOrder) => !!o._deliveredAt;

/** A delivery that failed — as opposed to one that was reversed afterwards. */
const isFailedDelivery = (o: MarketerOrder) => (o._status || "pending") === "cancelled" && !o._deliveredAt;

type Series = {
  dayStart: Date; dayCount: number;
  monthsStart: Date; monthCount: number;
  startYear: number; yearCount: number;
  dayLabels: string[]; daySub: string[];
  monLabels: string[]; monSub: string[];
  yrLabels: string[]; yrSub: string[];
};

/** Axis buckets spanning at least the last 30 days / 5 years, extended back to
    the earliest order (or refund) when the marketer has older history. */
export function buildSeries(orders: MarketerOrder[]): Series {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let earliest: Date | null = null;
  orders.forEach((o) => {
    const c = o._createdAt;
    if (c && (!earliest || c < earliest)) earliest = c;
    const rf = o._refundedAt;
    if (rf && (!earliest || rf < earliest)) earliest = rf;
  });

  const minDayStart = new Date(today);
  minDayStart.setDate(today.getDate() - 29);
  let dayStart = earliest
    ? new Date((earliest as Date).getFullYear(), (earliest as Date).getMonth(), (earliest as Date).getDate())
    : new Date(today);
  if (dayStart > minDayStart) dayStart = minDayStart;
  const dayCount = Math.floor((today.getTime() - dayStart.getTime()) / 86400000) + 1;

  const minYear = now.getFullYear() - 5;
  const startYear = earliest ? Math.min((earliest as Date).getFullYear(), minYear) : minYear;
  const endYear = now.getFullYear();
  const yearCount = endYear - startYear + 1;
  const monthsStart = new Date(startYear, 0, 1);
  const monthCount = (endYear - startYear) * 12 + now.getMonth() + 1;

  const dayLabels: string[] = [];
  const daySub: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(dayStart);
    d.setDate(dayStart.getDate() + i);
    dayLabels.push(DOW[d.getDay()]);
    daySub.push(ddmmyyyy(d));
  }

  const monLabels: string[] = [];
  const monSub: string[] = [];
  for (let i = 0; i < monthCount; i++) {
    const m = new Date(monthsStart);
    m.setMonth(monthsStart.getMonth() + i);
    monLabels.push(MON[m.getMonth()]);
    monSub.push(String(m.getFullYear()));
  }

  const yrLabels: string[] = [];
  const yrSub: string[] = [];
  for (let i = 0; i < yearCount; i++) {
    yrLabels.push(String(startYear + i));
    yrSub.push("");
  }

  return { dayStart, dayCount, monthsStart, monthCount, startYear, yearCount, dayLabels, daySub, monLabels, monSub, yrLabels, yrSub };
}

export type Analytics = {
  chartData: ChartData;
  ring: RingData;
  earnByCur: EarnByCur;
  totals: { earn: number; pieces: number; ok: number; done: number; products: number };
};

export function computeAnalytics(orders: MarketerOrder[]): Analytics {
  const s = buildSeries(orders);
  const earnD = Array(s.dayCount).fill(0) as number[];
  const earnM = Array(s.monthCount).fill(0) as number[];
  const earnY = Array(s.yearCount).fill(0) as number[];
  const pcsD = Array(s.dayCount).fill(0) as number[];
  const pcsM = Array(s.monthCount).fill(0) as number[];
  const pcsY = Array(s.yearCount).fill(0) as number[];
  const ringD = { ok: 0, fail: 0 };
  const ringM = { ok: 0, fail: 0 };
  const ringY = { ok: 0, fail: 0 };

  let totEarn = 0;
  let totPieces = 0;
  let totOk = 0;
  let totDone = 0;
  const totProducts = new Set<string>();
  const earnByCur: EarnByCur = {};

  orders.forEach((o) => {
    const status = o._status || "pending";
    const c = o._createdAt;
    if (!c) return;
    const isEarn = isEarnStatus(status);
    const isOk = wasDelivered(o);
    const isFail = isFailedDelivery(o);
    const earn = (o.commPerUnit || 0) * (o.qty || 0);

    if (isEarn) {
      totEarn += earn;
      const cc = o._curCode || "USD";
      const ss = o._sym || "$";
      if (!earnByCur[cc]) earnByCur[cc] = { sym: ss, amount: 0 };
      earnByCur[cc].amount += earn;
    }
    if (isOk) {
      totPieces += o.qty || 0;
      totOk++;
      if (o.productKey) totProducts.add(o.productKey);
    }
    if (isOk || isFail) totDone++;

    const di = Math.floor((new Date(c.getFullYear(), c.getMonth(), c.getDate()).getTime() - s.dayStart.getTime()) / 86400000);
    if (di >= 0 && di < s.dayCount) {
      if (isEarn) earnD[di] += earn;
      if (isOk) { pcsD[di] += o.qty; ringD.ok++; }
      if (isFail) ringD.fail++;
    }
    const mi = (c.getFullYear() - s.startYear) * 12 + c.getMonth();
    if (mi >= 0 && mi < s.monthCount) {
      if (isEarn) earnM[mi] += earn;
      if (isOk) { pcsM[mi] += o.qty; ringM.ok++; }
      if (isFail) ringM.fail++;
    }
    const yi = c.getFullYear() - s.startYear;
    if (yi >= 0 && yi < s.yearCount) {
      if (isEarn) earnY[yi] += earn;
      if (isOk) { pcsY[yi] += o.qty; ringY.ok++; }
      if (isFail) ringY.fail++;
    }

    // A refund claws the commission back out on the day it happened, and the
    // pieces with it when the order had already been delivered.
    if (o._refundedAt) {
      const rc = o._refundedAt;
      const qty = isOk ? o.qty || 0 : 0;
      totEarn -= earn;
      totPieces -= qty;
      // totProducts is "how many distinct products you have sold", and one
      // refund does not un-sell a product the marketer moved ten of.
      if (isOk) totOk--;
      const rcc = o._curCode || "USD";
      if (earnByCur[rcc]) earnByCur[rcc].amount -= earn;
      const rdi = Math.floor((new Date(rc.getFullYear(), rc.getMonth(), rc.getDate()).getTime() - s.dayStart.getTime()) / 86400000);
      if (rdi >= 0 && rdi < s.dayCount) { earnD[rdi] -= earn; pcsD[rdi] -= qty; }
      const rmi = (rc.getFullYear() - s.startYear) * 12 + rc.getMonth();
      if (rmi >= 0 && rmi < s.monthCount) { earnM[rmi] -= earn; pcsM[rmi] -= qty; }
      const ryi = rc.getFullYear() - s.startYear;
      if (ryi >= 0 && ryi < s.yearCount) { earnY[ryi] -= earn; pcsY[ryi] -= qty; }
    }
  });

  const round2 = (v: number) => +v.toFixed(2);
  const chartData: ChartData = {
    earnings: {
      D: { labels: s.dayLabels, sub: s.daySub, values: earnD.map(round2) },
      M: { labels: s.monLabels, sub: s.monSub, values: earnM.map(round2) },
      Y: { labels: s.yrLabels, sub: s.yrSub, values: earnY.map(round2) },
    },
    pieces: {
      D: { labels: s.dayLabels, sub: s.daySub, values: pcsD },
      M: { labels: s.monLabels, sub: s.monSub, values: pcsM },
      Y: { labels: s.yrLabels, sub: s.yrSub, values: pcsY },
    },
  };

  const ring = {} as RingData;
  ([["D", ringD], ["M", ringM], ["Y", ringY]] as const).forEach(([k, r]) => {
    const total = r.ok + r.fail;
    ring[k] = { ok: r.ok, fail: r.fail, failPct: total > 0 ? Math.round((r.fail / total) * 100) : 0 };
  });

  return {
    chartData,
    ring,
    earnByCur,
    totals: { earn: totEarn, pieces: totPieces, ok: totOk, done: totDone, products: totProducts.size },
  };
}

/* ── Breakdown card (Day / Month / Year filters) ── */

export type BreakdownSelection = { day: string | null; month: string | null; year: string | null };

export function dateMatches(d: Date | null | undefined, sel: BreakdownSelection): boolean {
  if (!d) return false;
  if (sel.day && DOW[d.getDay()] !== sel.day) return false;
  if (sel.month && MON[d.getMonth()] !== sel.month) return false;
  if (sel.year && String(d.getFullYear()) !== sel.year) return false;
  return true;
}

export function breakdownData(orders: MarketerOrder[], sel: BreakdownSelection, cur: string | null) {
  const noFilter = !sel.day && !sel.month && !sel.year;
  const list = noFilter ? orders || [] : (orders || []).filter((o) => dateMatches(o._createdAt, sel));
  let earnings = 0;
  let pieces = 0;
  let succeeded = 0;
  let failed = 0;

  list.forEach((o) => {
    const status = o._status || "pending";
    if (isEarnStatus(status)) {
      if (!cur || (o._curCode || "USD") === cur) earnings += (o.commPerUnit || 0) * (o.qty || 0);
    }
    if (wasDelivered(o)) {
      pieces += o.qty || 0;
      succeeded++;
    }
    if (isFailedDelivery(o)) failed++;
  });

  /* The reversal, on the day the refund happened. Filter to that day and the
     three figures read negative, which is the honest answer: nothing was
     earned or sold that day, something was given back. */
  (orders || []).forEach((o) => {
    if (!o._refundedAt) return;
    if (cur && (o._curCode || "USD") !== cur) return;
    if (!noFilter && !dateMatches(o._refundedAt, sel)) return;
    earnings -= (o.commPerUnit || 0) * (o.qty || 0);
    if (wasDelivered(o)) {
      pieces -= o.qty || 0;
      succeeded--;
    }
  });

  return { earnings, pieces, succeeded, failed };
}

/** Arabic pluralisation for "N orders". */
export const ordFrac = (n: number): string =>
  n === 1 ? "طلبيه واحده" : n === 2 ? "طلبيتين" : n + " طلبيات";
