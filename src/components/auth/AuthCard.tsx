import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useLanguage } from "@/i18n/LanguageContext";

type Props = {
  role: "marketer" | "business";
  children: ReactNode;
  backTo?: string;
};

export function AuthCard({ role, children, backTo = "/" }: Props) {
  const tint = role === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const label = role === "marketer" ? "Marketer" : "Business";
  const { lang, toggle } = useLanguage();
  const langLabel = lang === "en" ? "العربية" : "English";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link to={backTo} className="inline-block text-xs text-text-2 hover:text-text-1">‹ Back</Link>
          <button
            data-no-i18n
            type="button"
            onClick={toggle}
            aria-label="Toggle language"
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(20,20,20,0.92)",
              color: "#f0eeeb",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden style={{ fontSize: 14 }}>🌐</span>
            <span>{langLabel}</span>
          </button>
        </div>
        <div className="mb-5 flex items-center gap-2">
          <LateenLogo size={34} />
          <span className="font-serif text-lg text-text-1">Lateen</span>
          <span className={`ms-auto rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${tint}`}>{label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
