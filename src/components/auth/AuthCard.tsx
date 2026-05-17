import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useT } from "@/i18n/LanguageContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

type Props = {
  role: "marketer" | "business";
  children: ReactNode;
  backTo?: string;
};

export function AuthCard({ role, children, backTo = "/" }: Props) {
  const tint = role === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const t = useT();
  const label = role === "marketer" ? t("Marketer") : t("Business");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Link to={backTo} className="inline-block text-xs text-text-2 hover:text-text-1">{t("‹ Back")}</Link>
          <LanguageSwitcher />
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
