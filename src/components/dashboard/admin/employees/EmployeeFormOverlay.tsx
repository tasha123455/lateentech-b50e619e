import { useEffect, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

import { useAdminData } from "../AdminDataProvider";
import { empFmtDate } from "../lib/employees";
import type { Employee } from "../lib/types";

type Fields = {
  name: string; num: string; job: string; email: string;
  phone: string; phone2: string; salary: string; notes: string;
};

const EMPTY = (): Fields => ({
  name: "", num: "", job: "", email: "", phone: "", phone2: "", salary: "", notes: "",
});

const digits = (s: string): string => s.replace(/\D/g, "");

export function EmployeeFormOverlay({
  seed, onClose, onSaved,
}: {
  seed: { employee: Employee | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  /* Only while the sheet is actually up. This component stays mounted
     with a null prop when it is closed, so locking unconditionally held
     the page still for the whole session. */
  useScrollLock(!!seed);
  const { api } = useAdminData();
  const [f, setF] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const editing = seed?.employee || null;

  /* The hire date is not an input. It is the day the employee was listed, it
     drives every pay cycle from then on, and there is nothing an admin would
     legitimately change it to — so it is set once, on create, and shown
     read-only afterwards. */
  const hiredAt = editing?.hired_at || new Date().toISOString().slice(0, 10);

  // Re-seed each time the form opens, for a new or an existing employee.
  useEffect(() => {
    if (!seed) return;
    setErr("");
    const e = seed.employee;
    setF(
      e
        ? {
            name: e.full_name || "",
            num: e.employee_number || "",
            job: e.job_title || "",
            email: e.email || "",
            phone: e.phone || "",
            phone2: e.phone2 || "",
            salary: String(e.monthly_salary ?? 0),
            notes: e.notes || "",
          }
        : EMPTY(),
    );
  }, [seed]);

  const set = (patch: Partial<Fields>) => setF((prev) => ({ ...prev, ...patch }));

  /** Everything but the notes is required. */
  const problem = (): string => {
    if (!f.name.trim()) return "Full name is required.";
    if (!f.num.trim()) return "Employee number is required.";
    if (!f.job.trim()) return "Job title is required.";
    if (!f.email.trim()) return "Email is required.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "That email does not look right.";
    if (!digits(f.phone)) return "Phone number 1 is required.";
    if (!digits(f.phone2)) return "Phone number 2 is required.";
    if (digits(f.phone) === digits(f.phone2)) return "The two phone numbers have to be different.";
    if (!f.salary.trim()) return "Monthly salary is required.";
    if (!Number.isFinite(Number(f.salary)) || Number(f.salary) < 0) return "Monthly salary has to be a number.";
    return "";
  };

  const save = async () => {
    const bad = problem();
    if (bad) {
      setErr(bad);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        full_name: f.name.trim(),
        employee_number: f.num.trim(),
        job_title: f.job.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        phone2: f.phone2.trim(),
        monthly_salary: Number(f.salary.trim()) || 0,
        hired_at: hiredAt,
        notes: f.notes.trim() || null,
      };
      if (editing) payload.id = editing.id;
      await api.admin.upsertEmployee(payload as never);
      onSaved();
    } catch (e) {
      setErr("Save failed: " + (e as Error).message);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirm("Delete this employee and their payment history? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api.admin.deleteEmployee(editing.id);
      onSaved();
    } catch (e) {
      setErr("Delete failed: " + (e as Error).message);
    }
    setBusy(false);
  };

  const open = !!seed;

  /** inputMode="numeric" is what raises the number pad on a phone; type stays
      "tel" so a leading + and spaces are still accepted. */
  const phoneInput = (val: string, onChange: (v: string) => void, placeholder: string) => (
    <input
      type="tel"
      inputMode="numeric"
      autoComplete="off"
      className="adm-emp-inp"
      placeholder={placeholder}
      value={val}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div
      className={"adm-pdetail" + (open ? " open" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm-pdetail-card">
        <button className="adm-pdetail-close" onClick={onClose}>×</button>
        <div style={{ padding: "18px 18px 8px", fontSize: 16, fontWeight: 600 }}>
          {editing ? "Edit Employee" : "New Employee"}
        </div>
        <div className="adm-emp-form-body">
          <label className="adm-emp-lbl">
            Full name
            <input className="adm-emp-inp" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="adm-emp-lbl">
            Employee number
            <input className="adm-emp-inp" placeholder="EMP-001" value={f.num} onChange={(e) => set({ num: e.target.value })} />
          </label>
          <label className="adm-emp-lbl">
            Job title
            <input className="adm-emp-inp" value={f.job} onChange={(e) => set({ job: e.target.value })} />
          </label>
          <label className="adm-emp-lbl">
            Email
            <input type="email" className="adm-emp-inp" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </label>
          <label className="adm-emp-lbl">
            Phone number 1
            {phoneInput(f.phone, (v) => set({ phone: v }), "0912345678")}
          </label>
          <label className="adm-emp-lbl">
            Phone number 2
            {phoneInput(f.phone2, (v) => set({ phone2: v }), "0923456789")}
          </label>
          <label className="adm-emp-lbl">
            Monthly salary
            <input
              type="number" inputMode="decimal" min="0" step="0.01" className="adm-emp-inp"
              value={f.salary} onChange={(e) => set({ salary: e.target.value })}
            />
          </label>
          <div className="adm-emp-fixed">
            <span className="adm-emp-fixed-lbl">Employment date</span>
            <span className="adm-emp-fixed-val" data-no-i18n>{empFmtDate(hiredAt)}</span>
          </div>
          <label className="adm-emp-lbl">
            Notes (optional)
            <textarea rows={3} className="adm-emp-inp" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
          {!!err && <div className="adm-emp-err">{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button className="adm-btn adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="adm-btn adm-btn-acc" disabled={busy} onClick={() => void save()}>Save</button>
          </div>
          {!!editing && (
            <button
              className="adm-btn adm-btn-no"
              style={{ marginTop: 8, display: "block" }}
              disabled={busy}
              onClick={() => void remove()}
            >
              Delete employee
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
