import { useEffect, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import { profT } from "./profileText";

/** Asks the admin to change details the marketer can't edit himself.
 *
 *  It used to hand the request to WhatsApp with the message pre-written, which
 *  put it somewhere the admin panel could not count or close and left the
 *  marketer with nothing to look at afterwards. It now files a request that
 *  shows up on the admin's own page, and asking again replaces the last ask
 *  rather than adding a second one. */
export function ChangeRequestOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useMarketerData();
  const [checks, setChecks] = useState({ phone: false, email: false, country: false });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setChecks({ phone: false, email: false, country: false }); setNote(""); setBusy(false); }
  }, [open]);

  const t = profT();
  const ar = isAr();
  const any = checks.phone || checks.email || checks.country;

  const send = async () => {
    const fields = (Object.keys(checks) as Array<keyof typeof checks>).filter((k) => checks[k]);
    if (!fields.length || busy) return;
    setBusy(true);
    try {
      await api.submitChangeRequest(fields, note);
      onClose();
      alert(t.crSent);
    } catch (e) {
      alert((ar ? "تعذّر الإرسال: " : "Could not send: ") + (e as Error).message);
    }
    setBusy(false);
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

        {/* What they want it changed to. Without it the admin gets a card that
            says "email" and nothing else, and has to go and ask. */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.crNote}
          rows={3}
          style={{
            width: "100%", marginBottom: 14, padding: "10px 12px", fontSize: 13, lineHeight: 1.5,
            borderRadius: 10, border: "0.5px solid #2a2a2a", background: "#141414",
            color: "var(--color-text-primary)", outline: "none", resize: "none",
            fontFamily: "var(--font-sans)",
          }}
        />

        <button
          type="button"
          disabled={!any || busy}
          onClick={() => void send()}
          style={{
            width: "100%", background: "#8b83e8", color: "#fff", border: "none", borderRadius: 12,
            padding: 13, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: any && !busy ? 1 : 0.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span>{busy ? t.crSending : t.crSend}</span>
        </button>
      </div>
    </div>
  );
}
