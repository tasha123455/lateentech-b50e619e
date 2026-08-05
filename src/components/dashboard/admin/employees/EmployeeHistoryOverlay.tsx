import { empFmtDate, empPaydayFor } from "../lib/employees";
import { useScrollLock } from "@/lib/useScrollLock";
import type { Employee } from "../lib/types";
import { Money } from "../ui/Money";

export function EmployeeHistoryOverlay({
  employee, onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  /* Only while the sheet is actually up. This component stays mounted
     with a null prop when it is closed, so locking unconditionally held
     the page still for the whole session. */
  useScrollLock(!!employee);
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
              {/* Two separate lines rather than one sentence with the amount
                  spliced into the middle of it: in Arabic that ran the label,
                  an LTR amount and an untranslated "across N payments" into a
                  single scrambled line. */}
              <div className="adm-emp-hist-total">
                <span className="adm-emp-hist-total-lbl">Total paid</span>
                <b className="adm-emp-hist-total-val"><Money n={total} /></b>
              </div>
              <div className="adm-emp-hist-count">
                <span>Payments</span>
                <span data-no-i18n>{pays.length}</span>
              </div>
            </div>
            <div className="adm-section" style={{ margin: "0 18px 18px" }}>
              {pays.length ? (
                <>
                  {/* The columns were unlabelled, so which date was which was
                      anybody's guess. */}
                  <div className="adm-emp-hist-row head">
                    <span>Paid at</span>
                    <span>Pay day</span>
                    <span>Payment</span>
                  </div>
                  {pays.map((p, i) => (
                    <div className="adm-emp-hist-row" key={i}>
                      <span data-no-i18n>{empFmtDate(p.paid_at)}</span>
                      <span style={{ color: "#9e9b97" }} data-no-i18n>
                        {empFmtDate(empPaydayFor(employee, p.period_year, p.period_month))}
                      </span>
                      <b><Money n={p.amount} /></b>
                    </div>
                  ))}
                </>
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
