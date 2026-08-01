import type { Employee } from "./types";

export function empFmtDate(d?: string | Date | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export type EmpCycle = { y: number; m: number; cycleIndex: number; payday: Date; nextPayday: Date };

/** Every employee's payday is exactly 30 days after they were hired, then every
    30 days after that — not tied to the calendar month. Returns the employee's
    current cycle: a (y,m) key used to look up/record payments (kept compatible
    with employee_payments' period_year/period_month columns, just counted from
    the hire date), plus this cycle's payday and the next one. */
export function empCycle(emp: Employee): EmpCycle {
  const hired = new Date((emp.hired_at || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const now = new Date();
  const daysSince = Math.max(0, Math.floor((now.getTime() - hired.getTime()) / 86400000));
  const cycleIndex = Math.floor(daysSince / 30);
  const totalMonths = hired.getFullYear() * 12 + hired.getMonth() + cycleIndex;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  // QA/testing account: employee_number "5050505050" is payable on the hire
  // date (and every 30 days after) instead of waiting a full month.
  const isQA = String(emp.employee_number || "").trim() === "5050505050";
  const payday = new Date(hired);
  payday.setDate(payday.getDate() + (cycleIndex + (isQA ? 0 : 1)) * 30);
  const nextPayday = new Date(hired);
  nextPayday.setDate(nextPayday.getDate() + (cycleIndex + (isQA ? 1 : 2)) * 30);
  return { y, m, cycleIndex, payday, nextPayday };
}

export const empIsPaid = (emp: Employee, cyc: EmpCycle): boolean =>
  (emp.payments || []).some((x) => x.period_year === cyc.y && x.period_month === cyc.m);

/** A freshly-listed employee's payday is 30 days out — the pay button stays a
    greyed-out "Pending" until that date arrives. */
export const empIsDue = (cyc: EmpCycle): boolean => new Date() >= cyc.payday;

/** The scheduled payday of one past cycle, from its (period_year, period_month)
    key. Same 30-day arithmetic empCycle() uses, run backwards. */
export function empPaydayFor(emp: Employee, year: number, month: number): Date {
  const hired = new Date((emp.hired_at || new Date().toISOString().slice(0, 10)) + "T00:00:00");
  const cycleIndex = year * 12 + (month - 1) - (hired.getFullYear() * 12 + hired.getMonth());
  const isQA = String(emp.employee_number || "").trim() === "5050505050";
  const payday = new Date(hired);
  payday.setDate(payday.getDate() + (cycleIndex + (isQA ? 0 : 1)) * 30);
  return payday;
}

/** How many employees can be paid right now — the number badged on the
    Employees page, its menu entry and the nav's Menu slot. */
export const empPayableCount = (emps: Employee[]): number =>
  (emps || []).reduce((n, e) => {
    const cyc = empCycle(e);
    return n + (!empIsPaid(e, cyc) && empIsDue(cyc) ? 1 : 0);
  }, 0);

/** Lowest tracked stock across a product's variant groups, falling back to the
    top-level qty when nothing is tracked. */
export function effectiveQty(p: { qty?: number | null; variant_groups?: Array<{ items?: unknown[] }> | null }): number {
  const groups = (p && p.variant_groups) || [];
  if (!groups.length) return Number(p && p.qty) || 0;
  const groupTotals: number[] = [];
  groups.forEach((g) => {
    let gTotal = 0;
    let gTracked = false;
    ((g && g.items) || []).forEach((raw) => {
      const it = raw as { qty?: unknown };
      const q = it && it.qty;
      if (q !== null && q !== undefined && q !== "" && Number.isFinite(Number(q))) {
        gTracked = true;
        gTotal += Math.max(0, Number(q));
      }
    });
    if (gTracked) groupTotals.push(gTotal);
  });
  return groupTotals.length ? Math.min(...groupTotals) : Number(p && p.qty) || 0;
}
