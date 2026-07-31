import { useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";
import { PhotoPicker } from "../ui/PhotoPicker";

/** The "Send Notification" composer. Same fields and same send call as the
 *  panel that used to sit inside the Users page header — it just opens from
 *  the menu now instead of pushing the user list down the screen. */
export function NotificationsPage({ onBack }: { onBack: () => void }) {
  const { api } = useAdminData();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim()) {
      alert("Type the notification title first.");
      return;
    }
    if (!confirm("Send this notification to ALL marketers?")) return;
    setSending(true);
    try {
      const count = await api.admin.broadcastNotification(title.trim(), body.trim(), photo);
      setTitle("");
      setBody("");
      setPhoto(null);
      alert("Notification sent to " + count + " marketer(s).");
      onBack();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
    setSending(false);
  };

  return (
    <>
      <PageHeader title="Send Notification" onBack={onBack} />

        <div className="adm-notif-lbl">Notification title (what marketers see first)</div>
        <input
          type="text"
          className="adm-notif-inp"
          placeholder="e.g. New update available"
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
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="adm-btn adm-btn-ghost" onClick={onBack}>Cancel</button>
          <button className="adm-notif-send-btn" style={{ flex: 1 }} disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send to All Marketers"}
          </button>
        </div>
    </>
  );
}
