import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  enablePush,
  isInstalledPWA,
  pushFailureText,
  type PushFailure,
} from "@/lib/push-client";

const DISMISS_KEY = "wasla_push_prompt_dismissed_at";
const DISMISS_VISITS_KEY = "wasla_push_prompt_visits_since_dismiss";
/** Set the first time the app is opened from the home screen. */
const INSTALLED_SEEN_KEY = "wasla_push_installed_seen";
// After dismissing, the prompt comes back once the user has visited 20 more times.
const VISITS_BEFORE_REASK = 20;
function isIosLike(): boolean {
  try {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  } catch {
    return false;
  }
}

/** Whether asking is possible at all, before any question of when.
 *
 *  The browser only has an answer to give while permission is still
 *  "default" — once it is granted or denied there is no prompt left to show,
 *  and a modal offering one would lead nowhere. iOS only delivers push to an
 *  installed app, so in Safari there is nothing to subscribe to yet. */
function canAskNow(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "default") return false;
  if (isIosLike() && !isInstalledPWA()) return false;
  return true;
}

/** Installing is a fresh answer to the question, so it clears an older no.
 *
 *  Someone may have waved this away in the browser weeks ago. That dismissal
 *  otherwise rides into the installed app — both are the same origin and
 *  share the same storage — and suppresses the prompt for the next twenty
 *  visits. Choosing to install is a stronger signal than that dismissal.
 *  Marked as spent, so a later dismissal made inside the app means what it
 *  says. */
function clearDismissalOnce(): void {
  try {
    if (localStorage.getItem(INSTALLED_SEEN_KEY)) return;
    localStorage.setItem(INSTALLED_SEEN_KEY, "1");
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(DISMISS_VISITS_KEY);
  } catch {
    /* ignore */
  }
}


/**
 * Custom in-app modal that offers to enable push notifications.
 * Shows the moment the app is installed, and otherwise when:
 *   - the app is running as an installed PWA (home-screen launch)
 *   - the user is signed in
 *   - the browser hasn't been asked yet (Notification.permission === "default")
 *   - the user hasn't dismissed it recently
 */
export function NotificationConsentModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Shown in place of closing. A refusal that closes the sheet is a
     refusal nobody can report. */
  const [failure, setFailure] = useState<{ reason: PushFailure; detail?: string } | null>(null);
  const lang =
    typeof document !== "undefined" && document.documentElement.lang === "ar"
      ? "ar"
      : "en";

  /* The moment the app is installed, not the next time it happens to be
     opened. Installing is the point at which someone has said they want this
     on their phone, and it is the only moment we can be sure they are looking
     — the installed app may not be opened for days, and until it is, nothing
     has asked whether it may send anything. Android fires this in the tab
     that did the installing; iOS has no such event and is served by the
     standalone launch below. */
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const onInstalled = () => {
      if (!canAskNow()) return;
      clearDismissalOnce();
      setOpen(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!canAskNow()) return;
    try {
      if (isInstalledPWA()) clearDismissalOnce();
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        // Dismissed before: count this visit and only re-ask every 20 visits.
        const visits = Number(localStorage.getItem(DISMISS_VISITS_KEY) || "0") + 1;
        if (visits < VISITS_BEFORE_REASK) {
          localStorage.setItem(DISMISS_VISITS_KEY, String(visits));
          return;
        }
        // Threshold reached — show again and restart the 20-visit countdown.
        localStorage.setItem(DISMISS_VISITS_KEY, "0");
      }
      // Never dismissed → show on the very first visit.
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [user]);

  if (!open || !user) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      localStorage.setItem(DISMISS_VISITS_KEY, "0");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const enable = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const outcome = await enablePush(user.id);
      if (!outcome.ok) {
        /* Stays open, saying why. The whole point of this rewrite. */
        setFailure({ reason: outcome.reason, detail: outcome.detail });
        return;
      }
      try {
        localStorage.removeItem(DISMISS_KEY);
        localStorage.removeItem(DISMISS_VISITS_KEY);
      } catch {
        /* ignore */
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const t = {
    en: {
      title: "Turn on notifications",
      body: "Get instant alerts for orders, payouts and important updates from Wasla.",
      enable: "Enable notifications",
      later: "Not now",
    },
    ar: {
      title: "تفعيل الإشعارات",
      body: "احصل على تنبيهات فورية للطلبات والمدفوعات والتحديثات المهمة من وصلة.",
      enable: "تفعيل الإشعارات",
      later: "ليس الآن",
    },
  }[lang];

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "rgba(0,0,0,0.22)",
        backdropFilter: "blur(16px) saturate(125%)",
        WebkitBackdropFilter: "blur(16px) saturate(125%)",
        padding: "16px",
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#0D0D0D",
          color: "#fff",
          borderRadius: 20,
          padding: 20,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <img
            src="/wasla-notification-icon.png"
            alt=""
            width={44}
            height={44}
            style={{ borderRadius: 12 }}
          />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t.title}</h3>
        </div>
        <p style={{ margin: "6px 0 18px", fontSize: 14, opacity: 0.85, lineHeight: 1.45 }}>
          {t.body}
        </p>
        {/* The reason, on the sheet, in the reader's language — plus the
            browser's own words underneath, which are what identifies the
            fault when somebody reports it. */}
        {failure && (
          <div
            style={{
              margin: "0 0 14px", padding: "10px 12px", borderRadius: 12,
              background: "rgba(224,112,112,0.12)", border: "1px solid rgba(224,112,112,0.35)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              {pushFailureText(failure.reason, lang === "ar")}
            </p>
            {failure.detail && (
              <p
                data-no-i18n
                style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.65, wordBreak: "break-word", direction: "ltr", textAlign: "left" }}
              >
                {failure.reason}: {failure.detail}
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={dismiss}
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 12,
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
              fontWeight: 600,
            }}
          >
            {t.later}
          </button>
          <button
            onClick={enable}
            disabled={busy}
            style={{
              flex: 1.4,
              padding: "12px 14px",
              borderRadius: 12,
              background: "linear-gradient(90deg, #e82056 0%, #b42ddc 50%, #2ec478 100%)",
              color: "#fff",
              border: "none",
              fontWeight: 700,
            }}
          >
            {t.enable}
          </button>
        </div>
      </div>
    </div>
  );
}
