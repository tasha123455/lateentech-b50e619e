import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useAuth } from "@/auth/AuthContext";

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
  const nav = useNavigate();
  const [shopperSoonOpen, setShopperSoonOpen] = useState(false);

  useEffect(() => {
    if (!loading && user && role) nav({ to: "/dashboard" });
  }, [loading, user, role, nav]);

  // While the auth check is still running, or once we know this is a
  // signed-in user who's about to be bounced to /dashboard, don't render
  // the "Who are you?" screen at all — that's what caused every app
  // re-open to show a flash of the sign-in/role picker before jumping to
  // the dashboard. Only signed-out visitors ever see the real landing UI.
  if (loading || (user && role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <LateenLogo size={56} />
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <LateenLogo size={68} />
      <h1 className="mt-5 font-serif text-3xl font-medium tracking-tight text-text-1">Lateen</h1>
      <div className="my-9 h-px w-7 bg-border" />
      <p className="mb-4 text-[13px] tracking-wide text-text-2">Who are you?</p>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <RoleButton
          tone="shopper"
          title="Where can I find it?"
          sub="Browse products & buy easily"
          soon
          onClick={() => setShopperSoonOpen(true)}
        />
        <RoleButton to="/marketer/signin" tone="marketer" title="Marketer" sub="Promote products & earn your commissions instantly" />
        <RoleButton to="/business/signin" tone="business" title="Business" sub="List your products and let marketers increase your sales" />
      </div>
      <p className="mt-10 max-w-[300px] text-center text-[11px] leading-relaxed text-text-3">
        New here? Selecting a role will walk you through sign-up.
        <br />
        By continuing you agree to our <span className="underline">Terms</span> · <span className="underline">Privacy Policy</span>.
      </p>
      {shopperSoonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShopperSoonOpen(false)} />
          <div className="relative z-10 w-full max-w-[300px] rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
            <p className="text-[15px] text-text-1">
              Where can I find it?{" "}
              <span className="ms-1 inline-block rounded-md bg-destructive/15 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-destructive">
                Soon
              </span>
            </p>
            <button
              type="button"
              onClick={() => setShopperSoonOpen(false)}
              className="mt-5 rounded-xl bg-foreground px-7 py-2 text-[13px] font-semibold text-background"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function RoleButton({
  to,
  onClick,
  tone,
  title,
  sub,
  soon,
}: {
  to?: string;
  onClick?: () => void;
  tone: "shopper" | "marketer" | "business";
  title: string;
  sub: string;
  soon?: boolean;
}) {
  const tint = tone === "marketer" ? "bg-marketer-tint" : tone === "business" ? "bg-business-tint" : "bg-shopper-tint";
  const Icon = tone === "marketer" ? DollarIcon : tone === "business" ? BriefcaseIcon : BagIcon;
  const content = (
    <>
      <span className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}><Icon /></span>
        <span className="text-start">
          <span className="flex items-center gap-2">
            <span className="block text-[15px] font-medium text-text-1">{title}</span>
            {soon && (
              <span className="inline-block rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                Soon
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11px] text-text-2">{sub}</span>
        </span>
      </span>
      <span className="text-base text-text-3 transition group-hover:text-text-1">›</span>
    </>
  );
  const className =
    "group flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-5 py-4 transition hover:-translate-y-0.5 hover:bg-surface-2";
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function BagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5.3 7.3H14.7L14.1 17H5.9L5.3 7.3Z" fill="#7a2436" stroke="#e0637a" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7.2 7.3V6C7.2 4.34 8.49 3 10 3C11.51 3 12.8 4.34 12.8 6V7.3" stroke="#e0637a" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5V17.5" stroke="#a89ee8" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.2 6.2C12.9 4.9 11.7 4.1 10 4.1C8.1 4.1 6.7 5.1 6.7 6.5C6.7 7.9 8 8.4 10 8.8C12 9.2 13.3 9.7 13.3 11.1C13.3 12.5 11.9 13.5 10 13.5C8.3 13.5 7.1 12.7 6.8 11.4" fill="none" stroke="#6c64d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="7" width="15" height="9" rx="2" fill="#1a5c42" stroke="#2dbd8f" strokeWidth="1.2" />
      <path d="M7 7V5.8C7 4.7 7.9 3.8 9 3.8H11C12.1 3.8 13 4.7 13 5.8V7" stroke="#2dbd8f" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M2.5 11.5H17.5" stroke="#2dbd8f" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
