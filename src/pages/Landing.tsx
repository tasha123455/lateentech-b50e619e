import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LateenLogo } from "@/components/brand/LateenLogo";
import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { hasStoredSession, isFinishingSignIn } from "@/lib/storedSession";

export function Landing() {
  const { user, role, loading } = useAuth();
  const { lang, withLang } = useLanguage();
  const nav = useNavigate();
  const [shopperSoonOpen, setShopperSoonOpen] = useState(false);

  useEffect(() => {
    if (!loading && user && role) nav({ to: withLang("/dashboard") });
  }, [loading, user, role, nav, withLang]);

  /* Whether somebody is on their way in, which decides whether the wait for
     the real answer is worth showing anything for. Either they are holding a
     session already, or they are coming back from Google with one — that
     second case is every sign-in and every registration, because Google
     returns people to the site's root, which is this page.
     Read after the first render on purpose. The server has no localStorage and
     no address bar, so a first render that consulted either would disagree
     with the server's, and React would throw the page away and build it again
     — the very flash this is here to remove. */
  const [arriving, setArriving] = useState(false);
  useEffect(() => { setArriving(hasStoredSession() || isFinishingSignIn()); }, []);

  /* The shell script put `auth-pending` on the document before this page was
     painted, guessing from storage and the address that somebody is on their
     way in. This is where that guess is settled: kept while the wait is real,
     dropped the moment it turns out nobody is coming — a stale token, or a
     visitor who simply opened the site. Removed on the way out too, so that
     leaving this page never leaves the rest of the app hidden. */
  /* A wait has to end. If the answer never comes — a dead connection, a token
     the server will not answer about — the mark would otherwise be the whole
     site, forever, for somebody who could have been using it. After this it
     gives up and shows the page; if the session turns up later it redirects
     from there, which costs nothing. */
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => setWaitedLongEnough(true), 6000);
    return () => window.clearTimeout(id);
  }, [loading]);

  const waiting = (arriving && loading && !waitedLongEnough) || !!(user && role);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("auth-pending", waiting);
    return () => html.classList.remove("auth-pending");
  }, [waiting]);

  /* The mark alone, for somebody on their way to a dashboard.
   *
   * Not while the session is merely being checked. This page is served as
   * finished HTML before any of that has happened, so waiting on it meant the
   * front page arrived as a full-screen logo every single time and turned into
   * itself a moment later — which is what the flicker was. A visitor with no
   * session sees the page it says it is, immediately, and never sees this. */
  const isAr = lang === "ar";

  /* Both are rendered, always, and the stylesheet shows one of them. Choosing
     in JavaScript instead would mean choosing after React has arrived, and the
     half second before that is the whole of what this page kept getting wrong. */
  return (
    <>
      <main className="landing-splash min-h-[100svh] items-center justify-center overflow-x-hidden bg-background px-6">
        <LateenLogo variant="mark" size={280} glow />
      </main>

      <main className="landing-page relative flex min-h-[100svh] w-full items-center justify-center overflow-x-hidden bg-background px-6 py-8">
      <div className="flex w-full max-w-[420px] flex-col items-center">
      <LateenLogo variant="wordmark" lang={isAr ? "ar" : "en"} size={150} glow />
      <div className="my-7 h-px w-7 bg-border" />
      <p className="mb-4 text-[13px] tracking-wide text-text-2">Who are you?</p>
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <RoleButton
          tone="shopper"
          title="Where can I find it?"
          sub="Browse products & buy easily"
          soon
          onClick={() => setShopperSoonOpen(true)}
        />
        <RoleButton to={withLang("/marketer/signin")} tone="marketer" title="Marketer" sub="Promote products & earn your commissions instantly" />
        <RoleButton to={withLang("/business/signin")} tone="business" title="Business" sub="List your products and let marketers increase your sales" />
      </div>
      <p className="mt-10 max-w-[300px] text-center text-[11px] leading-relaxed text-text-3">
        New here? Selecting a role will walk you through sign-up.
        <br />
        By continuing you agree to our <span className="underline">Terms</span> · <span className="underline">Privacy Policy</span>.
      </p>
      </div>
      {shopperSoonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 wasla-scrim" onClick={() => setShopperSoonOpen(false)} />
          <div className="relative z-10 w-full max-w-[340px] rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
            <p className="text-[15px] text-text-1">
              Where can I find it?{" "}
              <span className="ms-1 inline-block rounded-md bg-destructive/15 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-destructive">
                Soon
              </span>
            </p>
            {/* Says what is coming, rather than only that something is. The
                copy is written out per language rather than left to the
                dictionary: it is a paragraph, and the page-wide translator
                matches whole text nodes. */}
            <p
              className="mt-3 text-[12.5px] leading-relaxed text-text-2"
              data-no-i18n
              style={{ textAlign: isAr ? "right" : "left" }}
            >
              {isAr
                ? "تعبت وأنت تدور من صفحة لصفحة و من محل لمحل؟ قريباً كل السوق الليبي بين يديك! صوّر أي منتج، قارن الأسعار بين مختلف المحلات، واعرف بالضبط وين تلقاه وفي أي مدينة و في أي محل."
                : "Tired of searching from page to page and from shop to shop? Soon, the entire Libyan market will be at your fingertips. Photograph any product, compare prices between different shops, and know exactly where to find it, in which city, and in which shop."}
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
    </>
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
