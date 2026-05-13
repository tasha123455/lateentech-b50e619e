import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useAuth } from "@/auth/AuthContext";
import { useLang } from "@/i18n/LanguageContext";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lateen — Performance marketing, zero upfront cost" },
      { name: "description", content: "Lateen connects businesses with marketers. Pay only when you sell." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();
  const { t, ready, hasChosen } = useLang();
  const nav = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!hasChosen) { nav({ to: "/language" }); return; }
    if (!loading && user && role) nav({ to: "/dashboard" });
  }, [ready, hasChosen, loading, user, role, nav]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <LateenLogo size={68} />
      <h1 className="mt-5 font-serif text-3xl font-medium tracking-tight text-text-1">Lateen</h1>
      <p className="mt-2 text-[13px] tracking-wide text-text-2">{t("Performance marketing, zero upfront cost")}</p>
      <div className="my-9 h-px w-7 bg-border" />
      <p className="mb-4 text-[13px] tracking-wide text-text-2">{t("Who are you?")}</p>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <RoleButton to="/marketer/signin" tone="marketer" title={t("Marketer")} sub={t("Promote products & earn commission")} />
        <RoleButton to="/business/signin" tone="business" title={t("Business")} sub={t("List products & grow your sales")} />
      </div>
      <p className="mt-10 max-w-[300px] text-center text-[11px] leading-relaxed text-text-3">
        {t("New here? Selecting a role will walk you through sign-up.")}
        <br />
        {t("By continuing you agree to our")} <span className="underline">{t("Terms")}</span> · <span className="underline">{t("Privacy Policy")}</span>.
      </p>
    </main>
  );
}

function RoleButton({ to, tone, title, sub }: { to: string; tone: "marketer" | "business"; title: string; sub: string }) {
  const tint = tone === "marketer" ? "bg-marketer-tint" : "bg-business-tint";
  const Icon = tone === "marketer" ? StarIcon : LockIcon;
  return (
    <Link to={to} className="group flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition hover:-translate-y-0.5 hover:bg-surface-2">
      <span className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}><Icon /></span>
        <span className="text-left">
          <span className="block text-[15px] font-medium text-text-1">{title}</span>
          <span className="mt-0.5 block text-[11px] text-text-2">{sub}</span>
        </span>
      </span>
      <span className="text-base text-text-3 transition group-hover:text-text-1">›</span>
    </Link>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2L12.09 7.26L18 7.64L13.5 11.47L15.18 17L10 14L4.82 17L6.5 11.47L2 7.64L7.91 7.26L10 2Z" fill="#6c64d4" stroke="#a89ee8" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="9" width="16" height="10" rx="2.5" fill="#1a5c42" stroke="#2dbd8f" strokeWidth="1.2" />
      <path d="M6.5 9V7C6.5 4.52 8.02 3 10 3C11.98 3 13.5 4.52 13.5 7V9" stroke="#2dbd8f" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="14.5" r="1.5" fill="#2dbd8f" />
    </svg>
  );
}
