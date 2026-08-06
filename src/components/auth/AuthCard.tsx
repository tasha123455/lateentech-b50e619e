import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useLanguage } from "@/i18n/LanguageContext";

type Props = {
  role: "marketer" | "business";
  children: ReactNode;
  /** Absolute path (already language-prefixed). Defaults to the language root. */
  backTo?: string;
  /** The register form is long, so it gets a smaller lockup than sign-in. */
  logoSize?: number;
};

/* Sized in `svh`, not `dvh`.
 *
 * On a phone the address bar is showing when a page loads and slides away a
 * moment later. `dvh` follows it, so this box grew by the height of the bar
 * just after arriving — and a card centred in it slid down half of that. On a
 * desktop, and in every emulator, nothing moves and there is nothing to see;
 * on a real phone it reads as the logo jumping and then settling, on every
 * refresh. Measured at 35px on a 412×760 screen.
 *
 * `svh` is the height with the bar still there. It does not change when the
 * bar goes, so nothing moves. The cost is a strip of unused space at the
 * bottom once the bar has gone — a still page instead of a moving one. */
export function AuthCard({ role, children, backTo, logoSize = 120 }: Props) {
  const tint = role === "marketer" ? "bg-marketer-tint text-marketer-foreground" : "bg-business-tint text-business";
  const label = role === "marketer" ? "Marketer" : "Business";
  const { lang, otherLangPath, withLang } = useLanguage();
  const langLabel = lang === "en" ? "العربية" : "English";
  const effectiveBack = backTo ?? withLang("/");

  return (
    <div className="flex min-h-[100svh] items-center justify-center overflow-x-hidden bg-background px-4 py-10">
      {/* The back button sits above the card rather than inside it. The header
          row already carries the language switch and the role badge, and a
          third control turned it into a toolbar.
          It is in normal flow rather than positioned over the page, so a short
          screen scrolls it into view instead of clipping it, and `self-start`
          puts it at the reading start without needing a rule per direction. */}
      <div className="flex w-full max-w-[400px] flex-col gap-3">
        <Link
          to={effectiveBack}
          aria-label="Back"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-border bg-surface text-text-2 transition hover:bg-surface-2 hover:text-text-1"
        >
          <svg
            className="h-[18px] w-[18px] rtl:rotate-180"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        <div className="w-full rounded-3xl border border-border bg-surface px-6 pb-6 pt-5 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Link
              data-no-i18n
              to={otherLangPath}
              aria-label="Toggle language"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-[13px] font-medium text-text-1 transition hover:bg-surface"
            >
              <span aria-hidden className="text-[15px]">🌐</span>
              <span>{langLabel}</span>
            </Link>
            <span className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold ${tint}`}>{label}</span>
          </div>

          {/* Big, because with the heading gone it is the only thing on the
              page that says whose app this is — and it is vector now, so size
              costs nothing in sharpness. */}
          <div className="flex flex-col items-center pb-5 pt-3">
            <LateenLogo variant="wordmark" lang={lang === "ar" ? "ar" : "en"} size={logoSize} showTagline={false} />
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
