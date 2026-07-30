import { isAr } from "../lib/format";

export function SupportOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ar = isAr();
  return (
    <div className="overlay" id="support-overlay" style={{ zIndex: 150, alignItems: "center", display: open ? "flex" : "none" }}>
      <div className="overlay-bg" onClick={onClose} />
      <div style={{ position: "relative", zIndex: 1, width: "min(86%,340px)", background: "#A82C34", borderRadius: 20, padding: "30px 24px 28px", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{ar ? "لديك مشكلة؟" : "Have a problem?"}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 20 }}>{ar ? "تواصل مع الأدمن" : "Contact admin"}</div>
        <a
          href="https://wa.me/218915756638"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: "50%", background: "#25D366", marginBottom: 16, textDecoration: "none" }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.35a9.9 9.9 0 004.62 1.14h.01c5.46 0 9.9-4.45 9.9-9.9C21.95 6.44 17.5 2 12.04 2zm5.7 14.2c-.24.68-1.39 1.3-1.92 1.37-.49.07-1.1.1-1.78-.11a16.3 16.3 0 01-1.63-.6c-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.56-1.17-2.98s.72-2.11 1-2.4c.28-.29.6-.36.8-.36h.58c.19 0 .43-.07.67.51.24.58.83 2.01.9 2.16.07.15.12.32.02.51-.1.19-.15.31-.3.48-.14.17-.3.38-.44.51-.14.14-.29.29-.13.58.17.29.75 1.24 1.61 2.01 1.11 1 2.04 1.31 2.33 1.46.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.63.77 1.92.91.29.14.48.21.55.33.07.12.07.68-.17 1.36z" />
          </svg>
        </a>
        <a
          href="https://wa.me/218915756638"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "0.3px", textDecoration: "none", cursor: "pointer", border: "1.5px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 22px" }}
          dir="ltr"
          data-no-i18n=""
        >
          +218 91 575 6638
        </a>
      </div>
    </div>
  );
}
