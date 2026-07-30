import { useEffect, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { ADMIN_WHATSAPP } from "../lib/constants";
import { isAr } from "../lib/format";
import { profT } from "./profileText";

/** Asks the admin (over WhatsApp) to change details the marketer can't edit. */
export function ChangeRequestOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useMarketerData();
  const [checks, setChecks] = useState({ phone: false, email: false, country: false });

  useEffect(() => {
    if (open) setChecks({ phone: false, email: false, country: false });
  }, [open]);

  const t = profT();
  const any = checks.phone || checks.email || checks.country;

  const send = () => {
    const ar = isAr();
    const items: string[] = [];
    if (checks.phone) items.push(ar ? "رقم الهاتف" : "Phone number");
    if (checks.email) items.push(ar ? "البريد الإلكتروني" : "Email");
    if (checks.country) items.push(ar ? "الدولة" : "Country");
    if (!items.length) return;

    const p = profile || {};
    const name = p.full_name || "";
    const lines = ar
      ? [
          "مرحباً، أرغب بطلب تغيير في بيانات حسابي على لاتين.",
          "الاسم: " + name,
          "الهاتف الحالي: " + (p.phone || "-"),
          "البريد الحالي: " + (p.email || "-"),
          "أريد تغيير: " + items.join("، "),
        ]
      : [
          "Hello, I would like to request a change to my Lateen account.",
          "Name: " + name,
          "Current phone: " + (p.phone || "-"),
          "Current email: " + (p.email || "-"),
          "I want to change: " + items.join(", "),
        ];
    window.open("https://wa.me/" + ADMIN_WHATSAPP + "?text=" + encodeURIComponent(lines.join("\n")), "_blank");
    onClose();
    alert(t.crSent);
  };

  const row = (key: keyof typeof checks, label: string, last?: boolean) => (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 4px",
        borderBottom: last ? undefined : "0.5px solid #2a2a2a", cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checks[key]}
        onChange={(e) => setChecks((prev) => ({ ...prev, [key]: e.target.checked }))}
        style={{ width: 18, height: 18, accentColor: "#8b83e8", flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{label}</span>
    </label>
  );

  return (
    <div className={"menu-overlay" + (open ? " open" : "")} style={{ zIndex: 110, alignItems: "center", justifyContent: "center" }}>
      <div className="menu-backdrop" onClick={onClose} />
      <div
        style={{
          position: "relative", width: "min(88%,360px)", background: "#1e1e1e", borderRadius: 16,
          padding: "1.25rem", border: "0.5px solid #2a2a2a",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>{t.crTitle}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ display: "grid", gap: 0, marginBottom: 16 }}>
          {row("phone", t.crPhone)}
          {row("email", t.crEmail)}
          {row("country", t.crCountry, true)}
        </div>

        <button
          type="button"
          disabled={!any}
          onClick={send}
          style={{
            width: "100%", background: "#8b83e8", color: "#fff", border: "none", borderRadius: 12,
            padding: 13, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: any ? 1 : 0.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          </svg>
          <span>{t.crSend}</span>
        </button>
      </div>
    </div>
  );
}
