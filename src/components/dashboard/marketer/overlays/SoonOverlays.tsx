import { useScrollLock } from "@/lib/useScrollLock";

import { ADMIN_WHATSAPP, ADMIN_WHATSAPP_DISPLAY } from "../lib/constants";
import { isAr } from "../lib/format";
import { pdT } from "../browse/pdText";

/* These popups open over sheets that are themselves holding the page still,
   so they share the counted lock rather than keeping a private copy. The copy
   was a plain flag: closing one of these handed scrolling back to the page
   while the sheet underneath was still covering it. */

/** "Browse with pictures — soon" sheet from the camera button. */
export function BrowseSoonOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);
  const ar = isAr();
  return (
    <div className={"ov" + (open ? " open" : "")}>
      <div className="ob" onClick={onClose} />
      <div className="sh" style={{ textAlign: "center", paddingBottom: "1.75rem" }}>
        <div className="shh" />
        <div style={{ fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.6, marginBottom: 18 }}>
          <span>{ar ? "تصفح بالصور" : "Browse with pictures"}</span>{" "}
          <span className="soon-badge">{ar ? "قريباً" : "soon"}</span>
        </div>
        <button className="ab" style={{ marginTop: 0 }} onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

/** Affiliate-link "soon" popup from the product detail sheet. */
export function AffiliateSoonOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);
  const t = pdT();
  if (!open) return null;
  return (
    <div style={{ display: "flex", position: "fixed", inset: 0, zIndex: 1000, alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.22)", backdropFilter: "blur(16px) saturate(125%)", WebkitBackdropFilter: "blur(16px) saturate(125%)" }} />
      <div
        style={{
          position: "relative", background: "#1e1e1e", border: "0.5px solid #333330", borderRadius: 18,
          padding: "28px 24px", maxWidth: 300, width: "86%", textAlign: "center", zIndex: 1,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 10 }}>🔗</div>
        <div style={{ fontSize: 15, color: "#f0eeeb", marginBottom: 16, lineHeight: 1.5 }}>
          {t.soonTxt} <span className="soon-badge">{t.soonMsg}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            height: 40, padding: "0 28px", borderRadius: 10, border: "none", background: "#f0eeeb",
            color: "#0D0D0D", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

/** Points & prizes "soon" popup, bordered in red. */
export function PointsSoonOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);
  if (!open) return null;
  return (
    <div style={{ display: "flex", position: "fixed", inset: 0, zIndex: 1000, alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.22)", backdropFilter: "blur(16px) saturate(125%)", WebkitBackdropFilter: "blur(16px) saturate(125%)" }} />
      <div
        style={{
          position: "relative", background: "#1e1e1e", border: "1.5px solid #E24B4A", borderRadius: 18,
          padding: "28px 24px", maxWidth: 300, width: "86%", textAlign: "center", zIndex: 1,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 10 }}>🏆</div>
        <div style={{ fontSize: 15, color: "#f0eeeb", marginBottom: 16, lineHeight: 1.5 }}>
          Your points and prizes <span className="soon-badge">Soon</span>
        </div>
        <button
          onClick={onClose}
          style={{
            height: 40, padding: "0 28px", borderRadius: 10, border: "none", background: "#f0eeeb",
            color: "#0D0D0D", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export function SupportOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const waLink = "https://wa.me/" + ADMIN_WHATSAPP;
  return (
    <div className={"overlay" + (open ? " open" : "")} style={{ zIndex: 1300, position: "fixed", inset: 0, alignItems: "center" }}>
      <div className="overlay-bg" onClick={onClose} />
      <div
        style={{
          position: "relative", zIndex: 1, width: "min(86%,340px)", background: "#A82C34",
          borderRadius: 20, padding: "30px 24px 28px", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0,
          }}
        >
          ×
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }} data-i18n="Have a problem?">
          Have a problem?
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 20 }} data-i18n="Contact admin">
          Contact admin
        </div>
        <a
          href={waLink}
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", width: 58, height: 58,
            borderRadius: "50%", background: "#25D366", marginBottom: 16, textDecoration: "none",
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.35a9.9 9.9 0 004.62 1.14h.01c5.46 0 9.9-4.45 9.9-9.9C21.95 6.44 17.5 2 12.04 2zm5.7 14.2c-.24.68-1.39 1.3-1.92 1.37-.49.07-1.1.1-1.78-.11a16.3 16.3 0 01-1.63-.6c-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.56-1.17-2.98s.72-2.11 1-2.4c.28-.29.6-.36.8-.36h.58c.19 0 .43-.07.67.51.24.58.83 2.01.9 2.16.07.15.12.32.02.51-.1.19-.15.31-.3.48-.14.17-.3.38-.44.51-.14.14-.29.29-.13.58.17.29.75 1.24 1.61 2.01 1.11 1 2.04 1.31 2.33 1.46.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.63.77 1.92.91.29.14.48.21.55.33.07.12.07.68-.17 1.36z" />
          </svg>
        </a>
        <a
          href={waLink}
          target="_blank"
          rel="noopener"
          dir="ltr"
          data-no-i18n
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            fontWeight: 700, color: "#fff", letterSpacing: "0.3px", textDecoration: "none", cursor: "pointer",
            border: "1.5px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "10px 22px",
          }}
        >
          {ADMIN_WHATSAPP_DISPLAY}
        </a>
      </div>
    </div>
  );
}
