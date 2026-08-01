import { useEffect, useMemo, useState } from "react";

import { normSearch } from "@/components/dashboard/marketer/lib/format";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";
import { empCycle, empFmtDate, empIsDue, empIsPaid, empPayableCount } from "../lib/employees";
import { dispPhone, initials, money } from "../lib/format";
import type { Employee } from "../lib/types";
import { Money } from "../ui/Money";
import { EmployeeFormOverlay } from "./EmployeeFormOverlay";
import { EmployeeHistoryOverlay } from "./EmployeeHistoryOverlay";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
];

/** Employee number, phones, email, employment date and notes, folded away —
 *  the card only shows what you need to decide whether to pay someone. */
function MoreInfo({ e }: { e: Employee }) {
  const [open, setOpen] = useState(false);
  const phones = [e.phone, e.phone2].filter(Boolean).map((p) => dispPhone(p)).join("  /  ");
  const rows: Array<[string, string]> = [
    ["Employee number", e.employee_number || "—"],
    ["Phone numbers", phones || "—"],
    ["Email", e.email || "—"],
    ["Employment date", empFmtDate(e.hired_at)],
    ["Notes", e.notes || "—"],
  ];
  return (
    <div className="adm-emp-more">
      <button className="adm-emp-more-hd" onClick={() => setOpen((v) => !v)}>
        <span>More info</span>
        <svg
          className={"adm-emp-more-chev" + (open ? " open" : "")}
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="adm-emp-more-body">
          {rows.map(([k, v]) => (
            <div className="adm-emp-more-row" key={k}>
              <span className="adm-emp-more-k">{k}</span>
              <span className="adm-emp-more-v" data-no-i18n>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeesPage({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { employees, loadEmployees, loadMetrics, loading, failed, api } = useAdminData();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<{ employee: Employee | null } | null>(null);
  const [histFor, setHistFor] = useState<Employee | null>(null);

  /* The whole list loads at boot for the payable badge, so searching happens
     in the browser: the server's ilike could not fold Arabic letter variants
     and never looked at the phone numbers at all. */
  useEffect(() => {
    if (active) void loadEmployees("");
  }, [active, loadEmployees]);

  const matchesSearch = (e: Employee) => {
    const q = normSearch(search);
    if (!q) return true;
    return normSearch(
      [e.full_name, e.employee_number, e.job_title, e.email, e.phone, e.phone2, e.notes]
        .filter(Boolean)
        .join(" "),
    ).includes(q);
  };

  const cycles = useMemo(() => {
    const map = new Map<string, ReturnType<typeof empCycle>>();
    employees.forEach((e) => map.set(e.id, empCycle(e)));
    return map;
  }, [employees]);

  const totals = useMemo(() => {
    let totalSalary = 0;
    let paidAmt = 0;
    let pendingAmt = 0;
    employees.forEach((e) => {
      const cyc = cycles.get(e.id)!;
      const sal = Number(e.monthly_salary || 0);
      totalSalary += sal;
      if (empIsPaid(e, cyc)) paidAmt += sal;
      else pendingAmt += sal;
    });
    return { totalSalary, paidAmt, pendingAmt };
  }, [employees, cycles]);

  // Only the tapped chip shows its number, matching the order filters on the
  // business dashboard.
  /* "Pending" means payable right now. Somebody whose payday has not arrived
     yet is not waiting on the admin for anything — their button reads "Pending"
     and does nothing — so listing them here only buried the ones that do need
     action. They are still under "All". */
  const isPending = (e: Employee) => {
    const cyc = cycles.get(e.id)!;
    return !empIsPaid(e, cyc) && empIsDue(cyc);
  };

  const counts = useMemo(() => {
    const searched = employees.filter(matchesSearch);
    const c: Record<string, number> = { "": searched.length, pending: 0, paid: 0 };
    searched.forEach((e) => {
      if (empIsPaid(e, cycles.get(e.id)!)) c.paid++;
      else if (isPending(e)) c.pending++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, cycles, search]);

  const filtered = employees.filter((e) => {
    if (!matchesSearch(e)) return false;
    if (filter === "paid") return empIsPaid(e, cycles.get(e.id)!);
    if (filter === "pending") return isPending(e);
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
      await loadEmployees("");
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
      const payable = !paid && due;
      const paydayLabel = empFmtDate(paid ? cyc.nextPayday : cyc.payday);
      return (
        /* Somebody who can be paid right now is the only thing on this page
           that needs acting on, so the whole card carries the tint — not just
           its button. */
        <div className={"adm-emp-row" + (payable ? " payable" : "")} key={e.id}>
          <div className="adm-emp-top">
            <div className="adm-emp-av" data-no-i18n>{initials(e.full_name)}</div>
            <div className="adm-emp-name" data-no-i18n>{e.full_name}</div>
            <span className="adm-emp-role" data-no-i18n>{e.job_title || "—"}</span>
          </div>
          <div className="adm-emp-facts">
            <div className="adm-emp-fact">
              <span className="adm-emp-fact-k">Pay day</span>
              <span className="adm-emp-fact-v" data-no-i18n>{paydayLabel}</span>
            </div>
            <div className="adm-emp-fact">
              <span className="adm-emp-fact-k">Salary</span>
              <span className="adm-emp-fact-v amt"><Money n={e.monthly_salary} /></span>
            </div>
          </div>
          <MoreInfo e={e} />
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
      <PageHeader title="Employees & Payroll" onBack={onBack} count={empPayableCount(employees)} />
      <div className="adm-stat-grid">
        <div className="adm-stat full">
          <div className="adm-stat-label">Total Monthly Salaries</div>
          <div className="adm-stat-value"><Money n={totals.totalSalary} /></div>
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
            {f.label}{filter === f.key ? ` (${counts[f.key] || 0})` : ""}
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
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="adm-section">{body}</div>

      <EmployeeFormOverlay
        seed={formFor}
        onClose={() => setFormFor(null)}
        onSaved={() => { setFormFor(null); void loadEmployees(""); }}
      />
      <EmployeeHistoryOverlay employee={histFor} onClose={() => setHistFor(null)} />
    </>
  );
}
