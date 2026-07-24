import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

const DISMISS_KEY = "lateen_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // don't re-prompt for 14 days after "Not now"

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

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return !Number.isNaN(at) && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
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

    const onBeforeInstall: EventListener = (e) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled: EventListener = () => {
      markDismissed();
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
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

  const title = lang === "ar" ? "ثبّت تطبيق لاتين" : "Install Lateen";
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
        src="/icon-192.png"
        alt=""
        aria-hidden
        style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }}
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
              background: "#2dbd8f",
              color: "#0d0d0d",
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
