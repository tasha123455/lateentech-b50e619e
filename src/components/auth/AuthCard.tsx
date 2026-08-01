import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useLanguage } from "@/i18n/LanguageContext";

type Props = {
  role: "marketer" | "business";
  children: ReactNode;
  /** Absolute path (already language-prefixed). Defaults to the language root. */
  backTo?: string;
};

export function AuthCard({ role, children, backTo }: Props) {
  const tint = role === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const label = role === "marketer" ? "Marketer" : "Business";
  const { lang, otherLangPath, withLang } = useLanguage();
  const langLabel = lang === "en" ? "العربية" : "English";
  const effectiveBack = backTo ?? withLang("/");

  /* Back and language are the same kind of thing — small ways out of this page
     — so they are built from the same chip. The language pill used to carry a
     block of inline colours that had drifted away from every token near it. */
  const chip =
    "inline-flex h-9 items-center rounded-xl border border-border bg-surface-2 text-text-2 transition hover:bg-surface hover:text-text-1";

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-x-hidden bg-background px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Link to={effectiveBack} aria-label="Back" className={`${chip} w-9 justify-center text-base`}>
            <span aria-hidden className="-mt-px">‹</span>
          </Link>
          <Link
            data-no-i18n
            to={otherLangPath}
            aria-label="Toggle language"
            className={`${chip} gap-1.5 px-3 text-xs font-medium`}
          >
            <span aria-hidden className="text-sm">🌐</span>
            <span>{langLabel}</span>
          </Link>
        </div>

        {/* Centred, the way the front page introduces itself — and it gives the
            lockup room to read as the logo rather than as an icon squeezed in
            beside a badge. */}
        <div className="mb-6 flex flex-col items-center">
          <LateenLogo variant="wordmark" lang={lang === "ar" ? "ar" : "en"} size={52} showTagline={false} />
          <span className={`mt-3 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${tint}`}>
            {label}
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
