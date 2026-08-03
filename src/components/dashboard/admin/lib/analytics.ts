import { AR_MONTHS, MON_ABBR, WDAYS } from "./format";
import type { DateSelection, HomeRaw, MetricKey, MetricsDay } from "./types";

/** A bucket's date as a local Date at midnight.
 *
 *  The string arrives as YYYY-MM-DD, already in the market's own timezone, so
 *  it is split by hand rather than parsed: `new Date("2026-07-01")` is read as
 *  UTC midnight and comes back as the previous day for anyone west of London.
 *  Building it field by field keeps the day the database said it was. */
function dayDate(d: string): Date {
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, day || 1);
}

/** End of that day, which is the instant a bucket's totals are true as of. */
function dayEnd(d: string): number {
  const x = dayDate(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

/** Does this day fall inside the selected weekday/month/year combination?
    An empty selection matches everything. */
export function inSelectedDay(d: string, selected: DateSelection): boolean {
  if (!selected.day && !selected.month && !selected.year) return true;
  const dt = dayDate(d);
  if (isNaN(dt.getTime())) return false;
  if (selected.day && WDAYS[dt.getDay()] !== selected.day) return false;
  if (selected.month && MON_ABBR[dt.getMonth()] !== selected.month) return false;
  if (selected.year && String(dt.getFullYear()) !== selected.year) return false;
  return true;
}

/** Kept for the timestamp-shaped callers that still exist. */
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

const days = (raw: HomeRaw | null): MetricsDay[] => raw?.days ?? [];

/** Platform fees for the selected range. A refund is its own dated event: the
    fee still counts on the day the order was created, and the refund subtracts
    the same amount back out on the day the refund actually happened. */
export function getFees(raw: HomeRaw | null, selected: DateSelection): number {
  let sum = 0;
  for (const b of days(raw)) {
    if (!inSelectedDay(b.d, selected)) continue;
    sum += Number(b.fee_earned || 0) - Number(b.fee_refunded || 0);
  }
  return Math.round(sum * 100) / 100;
}

/** Employee salaries actually marked paid in the selected range. These rows
    survive an employee being deleted, so a deletion never changes this total. */
export function getEmployeeSalaryPaid(raw: HomeRaw | null, selected: DateSelection): number {
  let sum = 0;
  for (const b of days(raw)) {
    if (!inSelectedDay(b.d, selected)) continue;
    sum += Number(b.salary_paid || 0);
  }
  return Math.round(sum * 100) / 100;
}

/** Point-in-time snapshot of a metric "as of" a timestamp — used for both the
    stat totals and every point on the chart, so the two always agree.
    Every one of these is a running total, so it is the sum of every bucket up
    to and including the day that timestamp falls in. */
export function metricValueAsOf(raw: HomeRaw | null, key: MetricKey, ts: number): number {
  let sum = 0;
  for (const b of days(raw)) {
    if (dayEnd(b.d) > ts) break; // buckets arrive in date order
    if (key === "totalUsers") sum += b.users_created;
    else if (key === "totalProducts") sum += b.products_created;
    else if (key === "platformFee") sum += Number(b.fee_earned || 0) - Number(b.fee_refunded || 0);
    else if (key === "succeeded") sum += b.approved_added - b.approved_removed;
    else if (key === "succeededPieces") sum += b.pieces_added - b.pieces_removed;
  }
  return key === "platformFee" ? Math.round(sum * 100) / 100 : sum;
}

export const CHART_LEN = 14;

/** The earliest day anywhere in the data — where "all time" starts. */
function firstEventTime(raw: HomeRaw | null): number {
  const d = days(raw);
  return d.length ? dayDate(d[0].d).getTime() : Date.now();
}

/** Chart buckets for the current selection, with the real end-of-bucket
    timestamp for each point so metricValueAsOf() gives a true snapshot. */
export function getChartConfig(raw: HomeRaw | null, selected: DateSelection): { labels: string[]; len: number; ends: number[] } {
  const anySel = selected.day || selected.month || selected.year;
  const today = new Date();

  if (!anySel) {
    /* All time: month by month from the first thing that ever happened to
       now, so the default view is the whole history rather than an arbitrary
       fortnight. Falls back to the current month for an empty platform, and
       caps the number of buckets so a long-running platform stays readable.
       The last point uses the current instant so it is truly live. */
    const first = firstEventTime(raw);
    const start = new Date(first);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const months: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= today && months.length < 400) {
      months.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (!months.length) months.push(new Date(today.getFullYear(), today.getMonth(), 1));
    // Keep at most 24 buckets so the labels stay legible on a phone.
    const kept = months.slice(-24);
    const labels = kept.map((d) => MON_ABBR[d.getMonth()] + " " + String(d.getFullYear()).slice(2));
    const ends = kept.map((d, i) =>
      i === kept.length - 1
        ? Date.now()
        : new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
    );
    return { labels, len: labels.length, ends };
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

/* English labels so the shared dictionary can translate them, like the rest
   of the dashboard — these used to be hardcoded Arabic and stayed Arabic in
   the English build. */
export const CHART_METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: "totalUsers", label: "Total Users", color: "#9d8fd9" },
  { key: "totalProducts", label: "Total Products", color: "#d98fa0" },
  { key: "platformFee", label: "Platform Fees", color: "#7fd9a8" },
  { key: "succeeded", label: "Succeeded Upfronts", color: "#caa05a" },
  { key: "succeededPieces", label: "Succeeded Pieces Sold", color: "#5ec9c4" },
];
