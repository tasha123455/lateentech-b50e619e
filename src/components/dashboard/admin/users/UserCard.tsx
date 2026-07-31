import { useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { initials, when } from "../lib/format";
import type { AdminUser } from "../lib/types";
import { PhotoPicker } from "../ui/PhotoPicker";

/** Impersonation hands the target account off to the dashboard on reload. */
export function goToAccount(userId: string, role: string, name: string) {
  if (!confirm("Open " + name + "’s account?\n\nYou’ll see their dashboard for support purposes. You can exit anytime via the banner at the top.")) return;
  try {
    sessionStorage.setItem("lateen_impersonate", JSON.stringify({ userId, role, name }));
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
            {(u.email || "no email") + " · " + (u.phone || "no phone") + " · " + when(u.created_at)}
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
        </div>

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
      </div>
    </div>
  );
}
