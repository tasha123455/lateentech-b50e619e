import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { isInstalledPWA, requestPushPermissionAndSubscribe } from "@/lib/push-client";

/**
 * A way into notifications that is always there.
 *
 * Until now the only way to turn them on was a prompt that offers itself once
 * and then, if it is waved away, hides for the next twenty visits — and never
 * appears at all on an iPhone until the app has been added to the home screen,
 * because that is the only way iOS delivers push. Somebody who tapped "not
 * now", or who is reading this in Safari, had no way back and nothing to tell
 * them why.
 *
 * So this sits in the menu and says where things stand. It is not a second
 * prompt: it does nothing until it is tapped.
 */

type State = "unsupported" | "needs-install" | "off" | "on" | "blocked";

function read(): State {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (Notification.permission === "granted") return "on";
  if (Notification.permission === "denied") return "blocked";
  // iOS only delivers to an installed app, so asking in Safari leads nowhere.
  if (ios && !isInstalledPWA()) return "needs-install";
  return "off";
}

const WORDS = {
  en: {
    label: "Notifications",
    on: "On for this device",
    off: "Off — tap to turn on",
    blocked: "Blocked in your browser settings",
    needsInstall: "Add Wasla to your home screen first",
    unsupported: "Not available on this browser",
    working: "Turning on…",
    failed: "Could not turn on — try again",
  },
  ar: {
    label: "الإشعارات",
    on: "مفعّلة على هذا الجهاز",
    off: "متوقفة — اضغط للتفعيل",
    blocked: "محظورة من إعدادات المتصفح",
    needsInstall: "أضف وصلة إلى الشاشة الرئيسية أولاً",
    unsupported: "غير متاحة على هذا المتصفح",
    working: "جارٍ التفعيل…",
    failed: "ما نجح التفعيل — حاول مرة ثانية",
  },
};

export function NotificationsMenuRow({
  ar,
  className = "menu-item",
  labelClassName = "menu-item-label",
  subClassName = "menu-item-sub",
}: {
  ar: boolean;
  /** The menu's own row class — `menu-item` or `adm-menu-item`. */
  className?: string;
  labelClassName?: string;
  subClassName?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>("unsupported");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /* Read after mounting: the server has no navigator and no permission to
     report, so deciding this during the first render would make the two
     versions of the page disagree. */
  useEffect(() => { setState(read()); }, []);

  const t = ar ? WORDS.ar : WORDS.en;

  const sub =
    busy ? t.working
    : failed ? t.failed
    : state === "on" ? t.on
    : state === "blocked" ? t.blocked
    : state === "needs-install" ? t.needsInstall
    : state === "unsupported" ? t.unsupported
    : t.off;

  const canAct = state === "off" && !busy && !!user;

  const turnOn = useCallback(async () => {
    if (!canAct || !user) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await requestPushPermissionAndSubscribe(user.id);
      /* Whatever the answer, the question has now been asked deliberately, so
         the prompt's own "asked recently" memory is cleared — it should not
         re-ask somebody who just came here to answer. */
      try {
        localStorage.removeItem("wasla_push_prompt_dismissed_at");
        localStorage.removeItem("wasla_push_prompt_visits_since_dismiss");
      } catch { /* ignore */ }
      setState(read());
      if (result !== "granted") setFailed(result !== "denied");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [canAct, user]);

  return (
    <button
      type="button"
      className={className}
      data-no-i18n
      onClick={turnOn}
      disabled={!canAct}
      aria-label={t.label}
      style={{ cursor: canAct ? "pointer" : "default", opacity: canAct || state === "on" ? 1 : 0.7 }}
    >
      <span className="menu-icon-wrap mi-amber" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </span>
      <span className="menu-text" style={{ flex: 1, minWidth: 0, textAlign: ar ? "right" : "left" }}>
        <span className={labelClassName}>{t.label}</span>
        <span className={subClassName}>{sub}</span>
      </span>
    </button>
  );
}
