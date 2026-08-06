import { useEffect } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

import { isAr } from "../lib/format";

/** The clipboard the menu row and this sheet share, so the thing you tapped is
 *  the thing that opens. Drawn rather than set in an emoji: at 22px an emoji is
 *  a different typeface on every phone, and it is the only picture on the row. */
export function ListerIcon({ size = 22, stroke = "#e0637a" }: { size?: number; stroke?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M9 3h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M16 4.5h1.5A1.5 1.5 0 0 1 19 6v3.2" />
      <path d="M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h5" />
      <path d="M8.5 10h4M8.5 13.5h3" />
      <circle cx="17" cy="16.5" r="4.5" />
      <path d="m15.2 16.6 1.3 1.3 2.4-2.5" />
    </svg>
  );
}

/** Tapping the Product Lister row. It is not built yet, so this says what it
 *  will be and marks it Soon — the same shape as the marketer's points sheet,
 *  because a business owner who has used both should not have to learn two. */
export function ProductListerOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useScrollLock(open);

  if (!open) return null;
  const ar = isAr();

  return (
    <div style={{ display: "flex", position: "fixed", inset: 0, zIndex: 1000, alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.22)", backdropFilter: "blur(16px) saturate(125%)", WebkitBackdropFilter: "blur(16px) saturate(125%)" }} />
      <div
        style={{
          position: "relative", background: "#1e1e1e", border: "0.5px solid #333330", borderRadius: 20,
          padding: "26px 22px 22px", maxWidth: 340, width: "100%", textAlign: "center", zIndex: 1,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 14px", background: "#3a1f28",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ListerIcon size={28} />
        </div>

        <div style={{ fontSize: 16, fontWeight: 600, color: "#f0eeeb", lineHeight: 1.5, marginBottom: 8 }} data-no-i18n>
          {ar ? "تعبت وانت تدخل المنتجات وحدة بوحدة؟" : "Tired of listing products one by one?"}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16 }} data-no-i18n>
          {ar
            ? "فريقنا حيتولى إدخال منتجاتك وتنظيمها باحتراف، وإنت ركّز على تنمية تجارتك."
            : "Leave the manual entry to us while you focus on growing your business."}
        </div>

        <div style={{ marginBottom: 18 }}>
          <span className="soon-badge" data-no-i18n>{ar ? "قريباً" : "Soon"}</span>
        </div>

        <button
          onClick={onClose}
          style={{
            height: 42, width: "100%", borderRadius: 12, border: "none", background: "#f0eeeb",
            color: "#0D0D0D", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
          data-no-i18n
        >
          {ar ? "تمام" : "OK"}
        </button>
      </div>
    </div>
  );
}
