import { AR_MONTHS, MON_ABBR, WDAYS } from "./format";
import type { DateSelection, HomeRaw, MetricKey } from "./types";

/** Does this timestamp fall inside the selected weekday/month/year combination?
    An empty selection matches everything. */
export function inSelectedRange(iso: string | null | undefined, selected: DateSelection): boolean {
  if (!iso) return false;
  if (!selected.day && !selected.month && !selected.year) return true;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  if (selected.day && WDAYS[d.getDay()] !== selected.day) return false;
  if (selected.month && MON_ABBR[d.getMonth()] !== selected.month) return false;
  if (selected.year && String(d.getFullYear()) !== selected.year) return false;
  return true;
}

/** Platform fees for the selected range. A refund is its own dated event: the
    fee still counts on the day the order was created, and the refund subtracts
    the same amount back out on the day the refund actually happened. */
export function getFees(raw: HomeRaw | null, selected: DateSelection): number {
  if (!raw) return 0;
  let sum = 0;
  raw.orders.forEach((o) => {
    if (inSelectedRange(o.created_at, selected)) sum += Number(o.fee || 0);
    if (o.refunded_at && inSelectedRange(o.refunded_at, selected)) sum -= Number(o.fee || 0);
  });
  return Math.round(sum * 100) / 100;
}

/** Employee salaries actually marked paid in the selected range. These rows
    survive an employee being deleted, so a deletion never changes this total. */
export function getEmployeeSalaryPaid(raw: HomeRaw | null, selected: DateSelection): number {
  if (!raw || !raw.employeePayments) return 0;
  const rows = raw.employeePayments.filter((p) => inSelectedRange(p.paid_at, selected));
  const sum = rows.reduce((s, p) => s + Number(p.amount || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Point-in-time snapshot of a metric "as of" a timestamp — used for both the
    stat totals and every point on the chart, so the two always agree. */
export function metricValueAsOf(raw: HomeRaw | null, key: MetricKey, ts: number): number {
  if (!raw) return 0;

  if (key === "totalUsers") {
    return raw.profiles.filter((p) => new Date(p.created_at as string).getTime() <= ts).length;
  }
  if (key === "totalProducts") {
    return raw.products.filter((p) => new Date(p.created_at as string).getTime() <= ts).length;
  }
  if (key === "platformFee") {
    // Cumulative, with the same refund reversal the hero card applies.
    return raw.orders.reduce((s, o) => {
      let v = 0;
      if (new Date(o.created_at as string).getTime() <= ts) v += Number(o.fee || 0);
      if (o.refunded_at && new Date(o.refunded_at).getTime() <= ts) v -= Number(o.fee || 0);
      return s + v;
    }, 0);
  }
  if (key === "succeeded") {
    // Counts once reviewed; a refund reverses it out from the refund's own
    // timestamp, so the line only dips on the date it actually happened.
    return raw.orders.reduce((s, o) => {
      if (!o.reviewed_at || new Date(o.reviewed_at).getTime() > ts) return s;
      if (o.refunded_at && new Date(o.refunded_at).getTime() <= ts) return s;
      return s + 1;
    }, 0);
  }
  if (key === "succeededPieces") {
    return raw.orders.reduce((s, o) => {
      if (!o.delivered_at) return s;
      if (new Date(o.delivered_at).getTime() > ts) return s;
      // A post-delivery refund removes those pieces from the moment it happened.
      if (o.refunded_at && new Date(o.refunded_at).getTime() <= ts) return s;
      return s + Number(o.qty || 0);
    }, 0);
  }
  if (key === "activeUsers") {
    const windowStart = ts - 30 * 86400000;
    const set = new Set<string>();
    raw.orders.forEach((o) => {
      const t = new Date(o.created_at as string).getTime();
      if (t > windowStart && t <= ts) {
        if (o.marketer_id) set.add(o.marketer_id);
        if (o.business_id) set.add(o.business_id);
      }
    });
    return set.size;
  }
  return 0;
}

export const CHART_LEN = 14;

function buildChartDates(n: number): string[] {
  const arr: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    arr.push(d.getDate() + "/" + (d.getMonth() + 1));
  }
  return arr;
}

/** Chart buckets for the current selection, with the real end-of-bucket
    timestamp for each point so metricValueAsOf() gives a true snapshot. */
export function getChartConfig(selected: DateSelection): { labels: string[]; len: number; ends: number[] } {
  const anySel = selected.day || selected.month || selected.year;
  const today = new Date();

  if (!anySel) {
    // Last 14 days, one point per day. "Today" uses the current instant so the
    // final point is truly live.
    const ends: number[] = [];
    for (let i = CHART_LEN - 1; i >= 0; i--) {
      if (i === 0) {
        ends.push(Date.now());
        continue;
      }
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      ends.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime());
    }
    return { labels: buildChartDates(CHART_LEN), len: CHART_LEN, ends };
  }

  // Year-only selection keeps the monthly view.
  if (selected.year && !selected.month && !selected.day) {
    const year = parseInt(selected.year, 10);
    const isCurrentYear = year === today.getFullYear();
    const monthCount = isCurrentYear ? today.getMonth() + 1 : 12;
    const labels = AR_MONTHS.slice(0, monthCount);
    const ends: number[] = [];
    for (let m = 1; m <= monthCount; m++) ends.push(new Date(year, m, 0, 23, 59, 59, 999).getTime());
    return { labels, len: monthCount, ends };
  }

  // Otherwise: every calendar day matching the selection, most recent 30.
  const years = selected.year
    ? [parseInt(selected.year, 10)]
    : [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2];
  const labels: string[] = [];
  const ends: number[] = [];
  const start = new Date(Math.max(...years), 11, 31);
  const cursor = new Date(Math.min(start.getTime(), today.getTime()));
  const stop = new Date(Math.min(...years), 0, 1).getTime();
  while (cursor.getTime() >= stop && labels.length < 30) {
    if (inSelectedRange(cursor.toISOString(), selected)) {
      labels.unshift(cursor.getDate() + "/" + (cursor.getMonth() + 1));
      ends.unshift(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999).getTime());
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  if (!labels.length) return { labels: ["—"], len: 1, ends: [Date.now()] };
  return { labels, len: labels.length, ends };
}

export const CHART_METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: "activeUsers", label: "المستخدمون النشطون", color: "#7fa8d9" },
  { key: "totalUsers", label: "إجمالي المستخدمين", color: "#9d8fd9" },
  { key: "totalProducts", label: "إجمالي المنتجات", color: "#d98fa0" },
  { key: "platformFee", label: "رسوم المنصة", color: "#7fd9a8" },
  { key: "succeeded", label: "Succeeded Upfronts", color: "#caa05a" },
  { key: "succeededPieces", label: "Succeeded Pieces Sold", color: "#5ec9c4" },
];
