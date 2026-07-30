import { useEffect, useRef, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import { pdT } from "./pdText";

type Stage = "pick" | "comment";

/** Two-step report flow: choose what is being reported, then describe it. */
export function ReportModal({
  productId, businessId, onClose,
}: {
  productId: string;
  businessId: string;
  onClose: () => void;
}) {
  const { api } = useMarketerData();
  const [stage, setStage] = useState<Stage>("pick");
  const [type, setType] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const t = pdT();

  useEffect(() => {
    if (stage !== "comment") return;
    const id = setTimeout(() => taRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [stage]);

  const optStyle: React.CSSProperties = {
    textAlign: isAr() ? "right" : "left",
    background: "var(--color-background-secondary)",
    color: "var(--color-text-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13.5,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    width: "100%",
  };

  const label = type === "product" ? t.reportProduct : type === "merchant" ? t.reportMerchant : t.reportOther;

  const send = async () => {
    const text = msg.trim();
    if (!text) {
      setErr(t.reportNeedText);
      return;
    }
    setSending(true);
    setErr("");
    try {
      if (!api.submitReport) throw new Error("no api");
      await api.submitReport({ type, productId, businessId, message: text });
      onClose();
      alert(t.reportSent);
    } catch (e) {
      console.error("[Lateen] submitReport", e);
      setSending(false);
      setErr(t.reportErr);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--color-background-primary)", borderRadius: 16, padding: 18,
          width: "100%", maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: stage === "pick" ? 14 : 4 }}>
          {t.reportTitle}
        </div>

        {stage === "pick" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["product", "merchant", "other"] as const).map((k) => (
              <button
                key={k}
                type="button"
                style={optStyle}
                onClick={() => { setType(k); setStage("comment"); }}
              >
                {k === "product" ? t.reportProduct : k === "merchant" ? t.reportMerchant : t.reportOther}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>{label}</div>
            <textarea
              ref={taRef}
              placeholder={t.reportPh}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              style={{
                width: "100%", minHeight: 90, background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-secondary)", borderRadius: 10,
                color: "var(--color-text-primary)", padding: 10, fontSize: 13,
                fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
              }}
            />
            {!!err && <div style={{ fontSize: 11.5, color: "#e24b4a", marginTop: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "var(--color-background-secondary)", color: "var(--color-text-primary)",
                  border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                {isAr() ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void send()}
                style={{
                  background: "#2dbd8f", color: "#08221a", border: 0, borderRadius: 10,
                  padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {sending ? t.reportSending : t.reportSend}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
