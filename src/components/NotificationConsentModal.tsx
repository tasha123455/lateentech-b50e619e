import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  isInstalledPWA,
  requestPushPermissionAndSubscribe,
} from "@/lib/push-client";

const DISMISS_KEY = "wasla_push_prompt_dismissed_at";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

/**
 * Custom in-app modal that offers to enable push notifications.
 * Only shows when:
 *   - the app is running as an installed PWA (home-screen launch)
 *   - the user is signed in
 *   - the browser hasn't been asked yet (Notification.permission === "default")
 *   - the user hasn't dismissed it recently
 */
export function NotificationConsentModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lang =
    typeof document !== "undefined" && document.documentElement.lang === "ar"
      ? "ar"
      : "en";

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (!isInstalledPWA()) return;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw && Date.now() - Number(raw) < DISMISS_COOLDOWN_MS) return;
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
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      await requestPushPermissionAndSubscribe(user.id);
    } finally {
      setBusy(false);
      setOpen(false);
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
        background: "rgba(0,0,0,0.55)",
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
              background: "#0A3C2A",
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
