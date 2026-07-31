import { empFmtDate } from "../lib/employees";
import { MONTH_NAMES } from "../lib/format";
import type { Employee } from "../lib/types";
import { Money } from "../ui/Money";

export function EmployeeHistoryOverlay({
  employee, onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const open = !!employee;

  // Most recent cycle first.
  const pays = (employee?.payments || [])
    .slice()
    .sort((a, b) => b.period_year - a.period_year || b.period_month - a.period_month);
  const total = pays.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div
      className={"adm-pdetail" + (open ? " open" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm-pdetail-card">
        <button className="adm-pdetail-close" onClick={onClose}>×</button>
        {!employee ? (
          <div className="adm-empty">Not found.</div>
        ) : (
          <>
            <div style={{ padding: "18px 18px 8px" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }} data-no-i18n>{employee.full_name}</div>
              <div style={{ fontSize: 12, color: "#9e9b97", marginTop: 2 }} data-no-i18n>
                {employee.employee_number} · {employee.job_title || "—"}
              </div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Total paid: <b style={{ color: "#2dbd8f" }}><Money n={total} /></b> across {pays.length}{" "}
                payment{pays.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="adm-section" style={{ margin: "0 18px 18px" }}>
              {pays.length ? (
                pays.map((p, i) => (
                  <div className="adm-emp-hist-row" key={i}>
                    <span>{MONTH_NAMES[p.period_month - 1]} {p.period_year}</span>
                    <span style={{ color: "#9e9b97" }}>{empFmtDate(p.paid_at)}</span>
                    <b><Money n={p.amount} /></b>
                  </div>
                ))
              ) : (
                <div className="adm-empty">No payments recorded yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
