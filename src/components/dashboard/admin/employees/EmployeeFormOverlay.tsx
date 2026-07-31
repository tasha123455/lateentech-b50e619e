import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import type { Employee } from "../lib/types";

type Fields = {
  name: string; num: string; job: string; email: string; salary: string; hired: string; notes: string;
};

const EMPTY = (): Fields => ({
  name: "", num: "", job: "", email: "", salary: "",
  hired: new Date().toISOString().slice(0, 10), notes: "",
});

export function EmployeeFormOverlay({
  seed, onClose, onSaved,
}: {
  seed: { employee: Employee | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useAdminData();
  const [f, setF] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);

  const editing = seed?.employee || null;

  // Re-seed each time the form opens, for a new or an existing employee.
  useEffect(() => {
    if (!seed) return;
    const e = seed.employee;
    setF(
      e
        ? {
            name: e.full_name || "",
            num: e.employee_number || "",
            job: e.job_title || "",
            email: e.email || "",
            salary: String(e.monthly_salary ?? 0),
            hired: (e.hired_at || "").slice(0, 10),
            notes: e.notes || "",
          }
        : EMPTY(),
    );
  }, [seed]);

  const set = (patch: Partial<Fields>) => setF((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!f.name.trim() || !f.num.trim()) {
      alert("Name and employee number are required.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: f.name.trim(),
        employee_number: f.num.trim(),
        job_title: f.job.trim() || null,
        email: f.email.trim() || null,
        monthly_salary: Number(f.salary.trim()) || 0,
        hired_at: f.hired.trim() || new Date().toISOString().slice(0, 10),
        notes: f.notes.trim() || null,
      };
      if (editing) payload.id = editing.id;
      await api.admin.upsertEmployee(payload as never);
      onSaved();
    } catch (e) {
      alert("Save failed: " + (e as Error).message);
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
      alert("Delete failed: " + (e as Error).message);
    }
    setBusy(false);
  };

  const open = !!seed;

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="adm-emp-lbl">
              Monthly salary ($)
              <input
                type="number" min="0" step="0.01" className="adm-emp-inp"
                value={f.salary} onChange={(e) => set({ salary: e.target.value })}
              />
            </label>
            <label className="adm-emp-lbl">
              Date of hire
              <input type="date" className="adm-emp-inp" value={f.hired} onChange={(e) => set({ hired: e.target.value })} />
            </label>
          </div>
          <label className="adm-emp-lbl">
            Notes
            <textarea rows={3} className="adm-emp-inp" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
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
