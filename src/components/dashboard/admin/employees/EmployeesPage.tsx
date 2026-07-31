import { useEffect, useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { empCycle, empFmtDate, empIsDue, empIsPaid } from "../lib/employees";
import { initials, money } from "../lib/format";
import type { Employee } from "../lib/types";
import { Money } from "../ui/Money";
import { EmployeeFormOverlay } from "./EmployeeFormOverlay";
import { EmployeeHistoryOverlay } from "./EmployeeHistoryOverlay";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
];

export function EmployeesPage({ active }: { active: boolean }) {
  const { employees, loadEmployees, loadMetrics, loading, failed, api } = useAdminData();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<{ employee: Employee | null } | null>(null);
  const [histFor, setHistFor] = useState<Employee | null>(null);

  // Debounced server-side search, same 250ms as the original.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => { void loadEmployees(search); }, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [active, search, loadEmployees]);

  const cycles = useMemo(() => {
    const map = new Map<string, ReturnType<typeof empCycle>>();
    employees.forEach((e) => map.set(e.id, empCycle(e)));
    return map;
  }, [employees]);

  const totals = useMemo(() => {
    let totalSalary = 0;
    let paidAmt = 0;
    let pendingAmt = 0;
    let paidCount = 0;
    employees.forEach((e) => {
      const cyc = cycles.get(e.id)!;
      const sal = Number(e.monthly_salary || 0);
      totalSalary += sal;
      if (empIsPaid(e, cyc)) {
        paidAmt += sal;
        paidCount++;
      } else {
        pendingAmt += sal;
      }
    });
    return { totalSalary, paidAmt, pendingAmt, paidCount };
  }, [employees, cycles]);

  const filtered = employees.filter((e) => {
    const paid = empIsPaid(e, cycles.get(e.id)!);
    if (filter === "paid" && !paid) return false;
    if (filter === "pending" && paid) return false;
    return true;
  });

  const payEmp = async (e: Employee) => {
    const cyc = cycles.get(e.id)!;
    if (empIsPaid(e, cyc)) return;
    if (!empIsDue(cyc)) return;
    const due = empFmtDate(cyc.payday);
    const amount = Number(e.monthly_salary || 0);
    if (!confirm("Mark " + e.full_name + " as paid for the cycle due " + due + " (" + money(amount) + ")?")) return;
    try {
      await api.admin.payEmployee({
        employee_id: e.id, period_year: cyc.y, period_month: cyc.m, amount,
      });
      await loadEmployees(search);
      void loadMetrics();
    } catch (err) {
      alert("Failed: " + (err as Error).message);
    }
  };

  let body: React.ReactNode;
  if (loading.employees) body = <div className="adm-empty">Loading…</div>;
  else if (failed.employees) body = <div className="adm-empty">Failed to load.</div>;
  else if (!filtered.length) body = <div className="adm-empty">No employees match.</div>;
  else {
    body = filtered.map((e) => {
      const cyc = cycles.get(e.id)!;
      const paid = empIsPaid(e, cyc);
      const due = empIsDue(cyc);
      const paydayLabel = empFmtDate(paid ? cyc.nextPayday : cyc.payday);
      return (
        <div className="adm-emp-row" key={e.id}>
          <div className="adm-emp-top">
            <div className="adm-emp-av" data-no-i18n>{initials(e.full_name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="adm-emp-name" data-no-i18n>
                {e.full_name} <span style={{ color: "#9e9b97", fontWeight: 400 }}>· {e.employee_number}</span>
              </div>
              <div className="adm-emp-sub" data-no-i18n>
                {(e.job_title || "—") + " · " + (e.email || "no email")}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 500, color: "#f5b441" }}>
              <Money n={e.monthly_salary} />
            </div>
          </div>
          <div className="adm-emp-meta">
            <div>Hired <b>{empFmtDate(e.hired_at)}</b></div>
            <div>Payday <b>{paydayLabel}</b></div>
            <div style={{ gridColumn: "1/-1" }}>
              Status:{" "}
              {paid ? (
                <span style={{ color: "#2dbd8f" }}>Paid · next due {paydayLabel}</span>
              ) : due ? (
                <span style={{ color: "#e07070" }}>Pending · due {paydayLabel}</span>
              ) : (
                <span style={{ color: "#9e9b97" }}>Pending · due {paydayLabel}</span>
              )}
            </div>
            {!!e.notes && (
              <div style={{ gridColumn: "1/-1", color: "#9e9b97", fontStyle: "italic" }} data-no-i18n>{e.notes}</div>
            )}
          </div>
          <div className="adm-emp-actions">
            <button
              className={"adm-emp-pay-btn " + (paid ? "paid" : due ? "" : "not-due")}
              disabled={paid || !due}
              onClick={() => void payEmp(e)}
            >
              {paid ? "Paid ✓" : due ? "Mark as Paid" : "Pending"}
            </button>
            <button className="adm-emp-link-btn" onClick={() => setHistFor(e)}>History</button>
            <button className="adm-emp-link-btn" onClick={() => setFormFor({ employee: e })}>Edit</button>
          </div>
        </div>
      );
    });
  }

  return (
    <>
      <div className="adm-h1">Employees &amp; Payroll</div>
      <div className="adm-stat-grid">
        <div className="adm-stat full">
          <div className="adm-stat-label">Total Monthly Salaries</div>
          <div className="adm-stat-value"><Money n={totals.totalSalary} /></div>
          <div className="adm-stat-sub">
            <span>{employees.length}</span> employees · <span>{totals.paidCount}</span> paid this cycle
          </div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Paid This Cycle</div>
          <div className="adm-stat-value"><Money n={totals.paidAmt} /></div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-label">Pending This Cycle</div>
          <div className="adm-stat-value" style={{ color: "var(--danger)" }}><Money n={totals.pendingAmt} /></div>
        </div>
      </div>

      <div className="adm-filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={"adm-filter-chip" + (filter === f.key ? " on" : "")}
            data-emp-filter={f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <button
          className="adm-filter-chip"
          style={{ marginLeft: "auto", background: "var(--accent)", color: "#1a1a1a", borderColor: "var(--accent)" }}
          onClick={() => setFormFor({ employee: null })}
        >
          + New
        </button>
      </div>

      <input
        className="adm-search"
        placeholder="Search by name, number, role, email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="adm-section">{body}</div>

      <EmployeeFormOverlay
        seed={formFor}
        onClose={() => setFormFor(null)}
        onSaved={() => { setFormFor(null); void loadEmployees(search); }}
      />
      <EmployeeHistoryOverlay employee={histFor} onClose={() => setHistFor(null)} />
    </>
  );
}
