import { useEffect, useState } from "react";

import { useAuth } from "@/auth/AuthContext";

import { useBusinessData } from "../BusinessDataProvider";
import { isAr } from "../lib/format";
import { ListerIcon } from "./ProductListerOverlay";

export function MenuDrawer({
  open,
  onClose,
  onOpenProfile,
  onOpenLister,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenLister: () => void;
}) {
  const { profile } = useBusinessData();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const ar = isAr();
  // refreshProfile(): menu-sub is "<business name> · Business", not the bare
  // business name — the suffix stayed even when a business name was set.
  const bizLabel = ar ? "تاجر" : "Business";
  const name = profile?.full_name || (ar ? "أهلاً بك" : "Welcome");
  const biz = (profile?.business_name ? profile.business_name + " · " : "") + bizLabel;
  const avatarUrl = profile?.avatar_signed_url as string | undefined;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      console.error("[Lateen] sign-out failed", err);
      setSigningOut(false);
      try {
        alert(ar ? "تعذّر تسجيل الخروج. حاول مرة أخرى." : "Sign out failed. Please try again.");
      } catch { /* ignore */ }
    }
  };

  return (
    <div className={"menu-overlay" + (open ? " open" : "")} id="menu-overlay">
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-drawer">
        <button className="menu-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="menu-user" onClick={onOpenProfile} style={{ cursor: "pointer" }} role="button" tabIndex={0}>
          <div className="avatar" id="menu-avatar" style={{ background: "#0A3C2A" }}>
            {avatarUrl ? <img src={avatarUrl} alt="" loading="eager" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: "inherit" }} /> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-name" id="menu-name" data-no-i18n="">{name}</div>
            <div className="menu-sub" id="menu-sub" data-no-i18n="">{biz}</div>
          </div>
        </div>

        <div
          className="menu-item"
          onClick={() => { const w = window as unknown as { __lateenToggleLang?: () => void }; w.__lateenToggleLang?.(); }}
          role="button"
          tabIndex={0}
          data-no-i18n=""
        >
          <div className="menu-icon-wrap mi-purple">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a89ee8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-item-label" id="lang-row-primary">{ar ? "اللغة" : "Language"}</div>
            <div className="menu-item-sub" id="lang-row-secondary">{ar ? "Language" : "اللغة"}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Not built yet, so it sits between the language row and sign-out and
            says so on its face. The subtitle is what the service does, not what
            it is called, because the name alone does not tell a shop owner why
            they would want it. */}
        <div className="menu-item" onClick={onOpenLister} role="button" tabIndex={0}>
          <div className="menu-icon-wrap mi-rose">
            <ListerIcon size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-item-label" data-no-i18n>
              {ar ? "مُدرِج المنتجات" : "Product Lister"}
              <span className="soon-badge" style={{ marginInlineStart: 6 }} data-no-i18n>
                {ar ? "قريباً" : "Soon"}
              </span>
            </div>
            <div className="menu-item-sub" data-no-i18n>
              {ar ? "ارتاح واحنا ندخّل بضاعتك نيابةً عنك" : "We list your products for you"}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Signing out swaps the label and nothing else, the way the
            marketer's drawer does it. The old version threw away the row's
            whole contents — icon included — and left a bare line of text where
            a menu row had been, which is the jolt that read as tacky. */}
        <div
          className="menu-item"
          data-action="sign-out"
          onClick={handleSignOut}
          aria-busy={signingOut || undefined}
          style={{
            marginTop: "auto", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14,
            ...(signingOut ? { pointerEvents: "none" as const, opacity: 0.6 } : null),
          }}
        >
          <div className="menu-icon-wrap mi-red">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="1.8" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </div>
          <div>
            <div className="menu-item-label" style={{ color: "#e07070" }}>
              {signingOut ? (ar ? "جارٍ تسجيل الخروج…" : "Signing out…") : "Sign out"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
