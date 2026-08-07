import { useEffect } from "react";
import { useScrollLock } from "@/lib/useScrollLock";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr } from "../lib/format";
import { Avatar } from "../ui/Avatar";
import { NotificationsMenuRow } from "@/components/NotificationsMenuRow";

export function MenuDrawer({
  open, onClose, onOpenProfile, onOpenPointsSoon, onSignOut, signingOut,
}: {
  open: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenPointsSoon: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const { profile, avatarUrl } = useMarketerData();

  useScrollLock(open);

  const ar = isAr();
  const name = profile?.full_name || "";

  return (
    <div className={"menu-overlay" + (open ? " open" : "")}>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="menu-drawer">
        <button className="menu-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="menu-user" onClick={onOpenProfile} style={{ cursor: "pointer" }} role="button" tabIndex={0}>
          <Avatar className="avatar" url={avatarUrl} name={name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-name" data-no-i18n>{name || "Welcome"}</div>
            <div className="menu-country">Marketer</div>
          </div>
        </div>

        <div
          className="menu-item"
          onClick={() => {
            const w = window as unknown as { __lateenToggleLang?: () => void };
            w.__lateenToggleLang?.();
          }}
          role="button"
          tabIndex={0}
          data-no-i18n
        >
          <div className="menu-icon-wrap mi-purple">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a89ee8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-item-label">{ar ? "اللغة" : "Language"}</div>
            <div className="menu-item-sub">{ar ? "Language" : "اللغة"}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        <NotificationsMenuRow ar={ar} />

        <div className="menu-item" onClick={onOpenPointsSoon} role="button" tabIndex={0}>
          <div className="menu-icon-wrap mi-amber">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8a33d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
              <path d="M7 5H4a2 2 0 0 0 0 4h1" />
              <path d="M17 5h3a2 2 0 0 1 0 4h-1" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="menu-item-label">
              Your points and prizes <span className="soon-badge" style={{ marginInlineStart: 6 }}>Soon</span>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        <div
          className="menu-item"
          onClick={onSignOut}
          aria-busy={signingOut}
          style={{
            marginTop: "auto", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14,
            ...(signingOut ? { pointerEvents: "none", opacity: 0.6 } : null),
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
