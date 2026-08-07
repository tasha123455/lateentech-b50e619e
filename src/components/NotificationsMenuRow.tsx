import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { isInstalledPWA, requestPushPermissionAndSubscribe } from "@/lib/push-client";

/**
 * Turning notifications on, from the menu, at any time.
 *
 * The prompt that used to be the only way in offers itself once and, if it is
 * waved away, hides for the next twenty visits — and on an iPhone never appears
 * at all until the app has been added to the home screen, which it does not
 * say. Somebody in either position had no way back.
 *
 * It reports what is actually true, which is not the same as what the browser
 * permission says. Granting permission and being subscribed are two different
 * things: the browser can say "granted" while the subscription failed to save,
 * and then there is a device that believes it is signed up and a server with
 * nobody to send to. That gap is exactly what happened here, so this asks the
 * push manager for the real subscription and only says "on" when there is one.
 * Anything short of that stays tappable, because the useful thing to do about
 * a half-finished subscription is to try it again.
 */

type State = "checking" | "unsupported" | "needs-install" | "off" | "granted-not-saved" | "on" | "blocked";

async function read(): Promise<State> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (Notification.permission === "default") {
    // iOS only delivers to an installed app, so asking in Safari leads nowhere.
    return ios && !isInstalledPWA() ? "needs-install" : "off";
  }

  // Permission is granted — but is this device actually subscribed?
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "granted-not-saved";
  } catch {
    return "granted-not-saved";
  }
}

const WORDS = {
  en: {
    label: "Notifications",
    checking: "Checking…",
    on: "On for this device",
    off: "Off — tap to turn on",
    notSaved: "Allowed, but not finished — tap to finish",
    blocked: "Blocked in your browser settings",
    needsInstall: "Add Wasla to your home screen first",
    unsupported: "Not available on this browser",
    working: "Turning on…",
    failed: "Did not finish — tap to try again",
  },
  ar: {
    label: "الإشعارات",
    checking: "جارٍ التحقق…",
    on: "مفعّلة على هذا الجهاز",
    off: "متوقفة — اضغط للتفعيل",
    notSaved: "مسموح بها، لكن ما كملت — اضغط للإكمال",
    blocked: "محظورة من إعدادات المتصفح",
    needsInstall: "أضف وصلة إلى الشاشة الرئيسية أولاً",
    unsupported: "غير متاحة على هذا المتصفح",
    working: "جارٍ التفعيل…",
    failed: "ما كملت — اضغط للمحاولة مرة ثانية",
  },
};

export function NotificationsMenuRow({
  ar,
  className = "menu-item",
  labelClassName = "menu-item-label",
  subClassName = "menu-item-sub",
  iconTint = "mi-amber",
}: {
  ar: boolean;
  /** The menu's own row class — `menu-item` or `adm-menu-item`. */
  className?: string;
  labelClassName?: string;
  subClassName?: string;
  iconTint?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /* Read after mounting: the server has no navigator and no permission to
     report, so deciding this during the first render would make the two
     versions of the page disagree. */
  useEffect(() => { void read().then(setState); }, []);

  const t = ar ? WORDS.ar : WORDS.en;

  const sub =
    busy ? t.working
    : failed ? t.failed
    : state === "checking" ? t.checking
    : state === "on" ? t.on
    : state === "granted-not-saved" ? t.notSaved
    : state === "blocked" ? t.blocked
    : state === "needs-install" ? t.needsInstall
    : state === "unsupported" ? t.unsupported
    : t.off;

  /* Tappable whenever trying again could achieve something. "Already on" is
     not one of those, and neither is a browser that has refused. */
  const canAct = !busy && !!user && (state === "off" || state === "granted-not-saved");

  const turnOn = useCallback(async () => {
    if (!canAct || !user) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await requestPushPermissionAndSubscribe(user.id);
      /* The question has now been answered deliberately, so the prompt's own
         memory of having asked is cleared — somebody who came to the menu to
         say yes should not be asked again a moment later. */
      try {
        localStorage.removeItem("wasla_push_prompt_dismissed_at");
        localStorage.removeItem("wasla_push_prompt_visits_since_dismiss");
      } catch { /* ignore */ }

      const next = await read();
      setState(next);
      // Granted but still not subscribed is a failure, whatever the browser said.
      setFailed(result !== "granted" || next !== "on");
    } catch {
      setState(await read());
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [canAct, user]);

  return (
    <div
      className={className}
      data-no-i18n
      onClick={turnOn}
      role="button"
      tabIndex={0}
      aria-label={t.label}
      aria-disabled={!canAct}
      style={{ cursor: canAct ? "pointer" : "default", opacity: state === "on" || canAct ? 1 : 0.7 }}
    >
      <div className={`menu-icon-wrap ${iconTint}`} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
      {/* Block elements, like every other row in these menus. Spans sat the
          label and the status on the same line with nothing between them. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={labelClassName}>{t.label}</div>
        <div className={subClassName}>{sub}</div>
      </div>
    </div>
  );
}
