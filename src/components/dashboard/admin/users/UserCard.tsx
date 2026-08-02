import { useState } from "react";
import { IMPERSONATION_KEY } from "@/lib/impersonation";

import { DEFAULT_MARKET_CODE, marketOf } from "@/lib/markets";

import { useAdminData } from "../AdminDataProvider";
import { dispPhone, initials, whenFull } from "../lib/format";
import type { AdminUser } from "../lib/types";
import { PhotoPicker } from "../ui/PhotoPicker";

/** The market's own name, so the row reads "Libya" rather than "LY". An
 *  unknown code is shown as it was stored rather than guessed at. */
function marketLabel(code: string | null | undefined): string {
  const c = code || DEFAULT_MARKET_CODE;
  const m = marketOf(c);
  return m.code === c ? m.nameEn : c;
}

/** Impersonation hands the target account off to the dashboard on reload.
 *  `productId` lands straight on that product instead of the dashboard's home
 *  — the reports page already knows which product is being complained about. */
export function goToAccount(userId: string, role: string, name: string, productId?: string) {
  if (!confirm("Open " + name + "’s account?\n\nYou’ll see their dashboard for support purposes. You can exit anytime via the banner at the top.")) return;
  try {
    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify({ userId, role, name, productId }));
    window.location.reload();
  } catch (e) {
    alert("Failed: " + (e as Error).message);
  }
}

export function UserCard({ u, onChanged }: { u: AdminUser; onChanged: () => void }) {
  const { api } = useAdminData();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeMsg, setWipeMsg] = useState("");

  const name = u.business_name || u.full_name || "Unnamed";
  const role = u.role || "marketer";
  const pillClass = role === "admin" ? "adm-role-admin" : role === "business" ? "adm-role-business" : "adm-role-marketer";
  const canImpersonate = role === "marketer" || role === "business";
  const isBanned = !!u.banned_at;
  const isFrozen = !!u.frozen_at;

  const removeUser = async () => {
    if (!confirm("Permanently delete " + name + "’s account?\n\nThe account and all their data will be removed from the database. They can register again with the same email. This cannot be undone.")) return;
    try {
      await api.admin.deleteUser(u.id);
      onChanged();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  /* Confirmation is typed into the card, not a native prompt(). Chrome blocks
     window.prompt() inside a cross-origin iframe — which is how the preview
     runs — so the old flow returned null and silently did nothing. */
  const wipeData = async () => {
    if (wipeText.trim().toUpperCase() !== "WIPE") return;
    setWiping(true);
    setWipeMsg("");
    try {
      const res = await api.admin.wipeAllData();
      const counts = res && typeof res === "object" ? res as Record<string, number> : {};
      const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
      setWipeMsg("Cleared" + (parts ? ": " + parts : "") + ". Reloading…");
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setWiping(false);
      setWipeMsg("Failed: " + ((e as Error)?.message || String(e)));
    }
  };

  const toggleBan = async () => {
    if (isBanned) {
      if (!confirm("Unban " + name + "’s account? They’ll be able to sign in again.")) return;
      try {
        await api.admin.unbanUser(u.id);
        onChanged();
      } catch (e) {
        alert("Failed: " + (e as Error).message);
      }
    } else {
      if (!confirm("Ban " + name + "’s account?\n\nThey’ll be signed out immediately and won’t be able to sign back in until you unban them.")) return;
      try {
        await api.admin.banUser(u.id);
        onChanged();
      } catch (e) {
        alert("Failed: " + (e as Error).message);
      }
    }
  };

  const toggleFreeze = async () => {
    if (isFrozen) {
      if (!confirm("Unfreeze " + name + "’s account? They’ll be able to submit orders / list products again.")) return;
      try {
        await api.admin.unfreezeUser(u.id);
        onChanged();
      } catch (e) {
        alert("Failed: " + (e as Error).message);
      }
    } else {
      if (!confirm("Freeze " + name + "’s account?\n\nThey’ll stay signed in but won’t be able to submit orders, list products, or verify/fail orders until you unfreeze them.")) return;
      try {
        await api.admin.freezeUser(u.id);
        onChanged();
      } catch (e) {
        alert("Failed: " + (e as Error).message);
      }
    }
  };

  const sendNotification = async () => {
    if (!title.trim()) {
      alert("Type the notification title first.");
      return;
    }
    setSending(true);
    try {
      await api.admin.sendUserNotification(u.id, title.trim(), body.trim(), photo || null);
      setTitle("");
      setBody("");
      setPhoto(null);
      alert("Notification sent to " + name + ".");
      setOpen(false);
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
    setSending(false);
  };

  return (
    <div className="adm-user-card">
      <div className="adm-user-row" onClick={() => setOpen((v) => !v)}>
        <div className="adm-user-av" data-no-i18n>
          {u.avatar_signed_url
            ? <img src={u.avatar_signed_url} alt="" loading="lazy" decoding="async" />
            : initials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="adm-row-name" data-no-i18n>{name}</div>
          <div className="adm-row-sub">
            {(u.email || "no email") + " · " + (dispPhone(u.phone) || "no phone")}
          </div>
          {(isBanned || isFrozen) && (
            <div style={{ marginTop: 2 }}>
              {isBanned && (
                <span style={{ fontSize: 11, color: "#c00", fontWeight: 600, marginInlineEnd: 8 }}>Banned</span>
              )}
              {isFrozen && <span style={{ fontSize: 11, color: "#004085", fontWeight: 600 }}>Frozen</span>}
            </div>
          )}
        </div>
        {/* Which market this account trades in. Silent while there is only
            one, so today's console looks exactly as it did — it appears the
            moment a second country exists and the answer starts to matter. */}
        {!!u.market && u.market !== DEFAULT_MARKET_CODE && (
          <span className="adm-market-pill" data-no-i18n>{u.market}</span>
        )}
        <span className={"adm-role-pill " + pillClass}>{role}</span>
        <span className={"adm-user-chev" + (open ? " open" : "")}>▾</span>
      </div>

      <div className={"adm-expand" + (open ? " open" : "")}>
        <div className="adm-user-actions">
          {canImpersonate && (
            <button className="adm-go-btn" onClick={() => goToAccount(u.id, role, name)}>Go to Account</button>
          )}
          {canImpersonate && (
            <button
              className="adm-go-btn"
              style={{
                background: isFrozen ? "#cce5ff" : "#e2e3e5",
                color: isFrozen ? "#004085" : "#495057",
                borderColor: isFrozen ? "#b8daff" : "#d6d8db",
              }}
              onClick={() => void toggleFreeze()}
            >
              {isFrozen ? "Unfreeze" : "Freeze"}
            </button>
          )}
          <button
            className="adm-go-btn"
            style={{ background: "#fee", color: "#c00", borderColor: "#fcc" }}
            onClick={() => void removeUser()}
          >
            Remove
          </button>
          <button
            className="adm-go-btn"
            style={{
              background: isBanned ? "#e2e3e5" : "#fff3cd",
              color: isBanned ? "#495057" : "#856404",
              borderColor: isBanned ? "#d6d8db" : "#ffeeba",
            }}
            onClick={() => void toggleBan()}
          >
            {isBanned ? "Unban" : "Ban Email"}
          </button>
          {role === "admin" && (
            <button
              className="adm-go-btn"
              style={{ background: "#fee", color: "#c00", borderColor: "#fcc" }}
              onClick={() => { setWipeOpen((v) => !v); setWipeText(""); setWipeMsg(""); }}
            >
              Delete data
            </button>
          )}
        </div>

        {/* Which market this account trades in — the data set it belongs to,
            not where the person lives. Always shown, because "which country's
            books is this on" is the question this row exists to answer. */}
        <div className="adm-joined-row">
          <span className="adm-joined-lbl">Country</span>
          <span className="adm-joined-val" data-no-i18n>{marketLabel(u.market)}</span>
        </div>

        <div className="adm-joined-row">
          <span className="adm-joined-lbl">Date joined</span>
          <span className="adm-joined-val" data-no-i18n>{whenFull(u.created_at) || "—"}</span>
        </div>

        {role === "admin" && wipeOpen && (
          <div className="adm-wipe-box">
            <div className="adm-wipe-warn">
              Deletes every order, product, payout, report, notification, review, favourite and
              employee record, and resets all wallet balances. User accounts and email bans are
              kept. This cannot be undone.
            </div>
            <input
              className="adm-notif-inp"
              placeholder="Type WIPE to confirm"
              value={wipeText}
              onChange={(e) => setWipeText(e.target.value)}
              autoComplete="off"
            />
            {wipeMsg && <div className="adm-wipe-msg">{wipeMsg}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="adm-btn adm-btn-ghost" onClick={() => setWipeOpen(false)}>Cancel</button>
              <button
                className="adm-go-btn"
                style={{ flex: 1, background: "#c0392b", color: "#fff", borderColor: "#c0392b" }}
                disabled={wiping || wipeText.trim().toUpperCase() !== "WIPE"}
                onClick={() => void wipeData()}
              >
                {wiping ? "Deleting…" : "Delete all data"}
              </button>
            </div>
          </div>
        )}

        {role !== "admin" && (
        <div className="adm-notif-box">
          <div className="adm-notif-lbl">Notification title (what they see first)</div>
          <input
            type="text"
            className="adm-notif-inp"
            placeholder="e.g. Your account was reviewed"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="adm-notif-lbl">Notification content (shown when tapped)</div>
          <textarea
            className="adm-notif-textarea"
            placeholder="Full message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <PhotoPicker url={photo} onChange={setPhoto} />
          <button className="adm-notif-send-btn" disabled={sending} onClick={() => void sendNotification()}>
            {sending ? "Sending…" : "Send Notification"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
