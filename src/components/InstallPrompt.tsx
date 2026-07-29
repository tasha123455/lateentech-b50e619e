import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

const DISMISS_KEY = "lateen_install_dismissed_session";


type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  const navStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia?.("(display-mode: standalone)").matches || navStandalone === true;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

// "Not now" only silences the prompt for the current browsing session — on the
// next visit we ask again, until the app is actually installed.
function wasDismissedRecently(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}


export function InstallPrompt() {
  const { lang, dir } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isStandalone() || wasDismissedRecently()) return;

    if (isIosSafari()) {
      // iOS never fires beforeinstallprompt — there's no programmatic install,
      // so this is a text-only nudge toward the manual Share -> Add to Home Screen flow.
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    // The event may have already fired before React hydrated — the inline
    // script in the document shell stashes it on window.__waslaBIP.
    const stashed = (window as unknown as { __waslaBIP?: BeforeInstallPromptEvent | null }).__waslaBIP;
    if (stashed) {
      setDeferredEvent(stashed);
      setVisible(true);
    }

    const onBeforeInstall: EventListener = (e) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onStashed: EventListener = () => {
      const ev = (window as unknown as { __waslaBIP?: BeforeInstallPromptEvent | null }).__waslaBIP;
      if (ev) {
        setDeferredEvent(ev);
        setVisible(true);
      }
    };
    window.addEventListener("wasla-bip", onStashed);
    const onInstalled: EventListener = () => {
      markDismissed();
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("wasla-bip", onStashed);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mounted || !visible) return null;

  const handleInstall = async () => {
    if (!deferredEvent) return;
    setVisible(false);
    try {
      await deferredEvent.prompt();
      await deferredEvent.userChoice;
    } catch {
      /* ignore */
    }
    setDeferredEvent(null);
  };

  const handleDismiss = () => {
    markDismissed();
    setVisible(false);
  };

  const title = lang === "ar" ? "ثبّت تطبيق وصلة" : "Install Wasla";
  const body = showIosHint
    ? lang === "ar"
      ? 'اضغط زر المشاركة، ثم "إضافة إلى الشاشة الرئيسية".'
      : 'Tap the Share icon, then "Add to Home Screen".'
    : lang === "ar"
      ? "ثبّت التطبيق على جهازك للوصول السريع والإشعارات."
      : "Install the app for quicker access and notifications.";
  const installLabel = lang === "ar" ? "تثبيت" : "Install";
  const notNowLabel = lang === "ar" ? "ليس الآن" : "Not now";

  return (
    <div
      data-no-i18n
      role="dialog"
      aria-label={title}
      dir={dir}
      style={{
        position: "fixed",
        bottom: 14,
        left: 14,
        right: 14,
        zIndex: 70,
        maxWidth: 420,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(20,20,20,0.96)",
        color: "#f0eeeb",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontFamily:
          lang === "ar"
            ? "'Segoe UI', 'Tahoma', 'Noto Sans Arabic', system-ui, sans-serif"
            : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <img
        src="/wasla-mark-192.png"
        alt=""
        aria-hidden
        style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, objectFit: "contain" }}
      />
      <div style={{ flex: 1, minWidth: 0, textAlign: dir === "rtl" ? "right" : "left" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>{body}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {!showIosHint && (
          <button
            type="button"
            onClick={handleInstall}
            style={{
              background: "linear-gradient(90deg, #e82056 0%, #b42ddc 50%, #2ec478 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {installLabel}
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            background: "transparent",
            color: "#a8a8a8",
            border: "none",
            fontSize: 11,
            cursor: "pointer",
            padding: "4px 6px",
          }}
        >
          {notNowLabel}
        </button>
      </div>
    </div>
  );
}
