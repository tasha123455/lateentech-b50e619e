import { useEffect, useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { MON_ABBR, WDAYS } from "../lib/format";
import type { DateSelection } from "../lib/types";
import { EN_LABELS, DateFilterTabs, USERS_CLASSES, buildYearItems } from "../ui/DateFilterTabs";
import { PhotoPicker } from "../ui/PhotoPicker";
import { DeletionRequestsOverlay } from "./DeletionRequestsOverlay";
import { UserCard } from "./UserCard";

const dayItems = WDAYS.map((k) => ({ key: k, label: k }));
const monthItems = MON_ABBR.map((k) => ({ key: k, label: k }));

const ROLE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "marketer", label: "Marketers" },
  { key: "business", label: "Businesses" },
  { key: "admin", label: "Admins" },
];

export function UsersPage({ active }: { active: boolean }) {
  const { users, loadUsers, loading, failed, api, deletionRequests } = useAdminData();

  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DateSelection>({ day: null, month: null, year: null });
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [delReqOpen, setDelReqOpen] = useState(false);

  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcPhoto, setBcPhoto] = useState<string | null>(null);
  const [bcSending, setBcSending] = useState(false);

  useEffect(() => {
    if (active) void loadUsers();
  }, [active, loadUsers]);

  const needsReview = deletionRequests.filter((r) => r.status === "wallet_review").length;

  const dateMatches = (iso?: string | null) => {
    if (!selected.day && !selected.month && !selected.year) return true;
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return false;
    if (selected.day && WDAYS[d.getDay()] !== selected.day) return false;
    if (selected.month && MON_ABBR[d.getMonth()] !== selected.month) return false;
    if (selected.year && String(d.getFullYear()) !== selected.year) return false;
    return true;
  };

  const filtered = useMemo(() => {
    let out = users || [];
    if (roleFilter) out = out.filter((u) => (u.role || "marketer") === roleFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((u) =>
        [u.full_name, u.business_name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(q)),
      );
    }
    return out.filter((u) => dateMatches(u.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, roleFilter, search, selected]);

  const sendBroadcast = async () => {
    if (!bcTitle.trim()) {
      alert("Type the notification title first.");
      return;
    }
    if (!confirm("Send this notification to ALL marketers?")) return;
    setBcSending(true);
    try {
      const count = await api.admin.broadcastNotification(bcTitle.trim(), bcBody.trim(), bcPhoto);
      setBcTitle("");
      setBcBody("");
      setBcPhoto(null);
      alert("Notification sent to " + count + " marketer(s).");
      setBroadcastOpen(false);
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
    setBcSending(false);
  };

  const wipeAll = async () => {
    if (!confirm("Wipe ALL admin data?\n\nThis permanently deletes every order, product, payout, report, notification, review, favourite and employee record, and resets all wallet balances.\n\nUser accounts and email bans are kept. This cannot be undone.")) return;
    const typed = prompt("Type WIPE to confirm.");
    if ((typed || "").trim().toUpperCase() !== "WIPE") return;
    try {
      await api.admin.wipeAllData();
      alert("All admin data has been wiped.");
      location.reload();
    } catch (e) {
      alert("Failed: " + ((e as Error)?.message || e));
    }
  };

  let body: React.ReactNode;
  if (loading.users) body = <div className="adm-empty">Loading…</div>;
  else if (failed.users) body = <div className="adm-empty">Failed to load.</div>;
  else if (!filtered.length) body = <div className="adm-empty">No users found.</div>;
  else body = filtered.map((u) => <UserCard key={u.id} u={u} onChanged={() => void loadUsers()} />);

  return (
    <>
      <div className="adm-h1-row">
        <div className="adm-h1" style={{ marginBottom: 0 }}>User Directory</div>
        <button className="adm-broadcast-btn" onClick={() => setBroadcastOpen((v) => !v)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Send Notification
        </button>
        <button className="adm-reports-btn" onClick={() => setDelReqOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          Deletion Requests
          {needsReview > 0 && <span className="adm-reports-count">{needsReview}</span>}
        </button>
      </div>

      <div className={"adm-broadcast-panel" + (broadcastOpen ? " open" : "")}>
        <div className="adm-notif-lbl">Notification title (what marketers see first)</div>
        <input
          type="text"
          className="adm-notif-inp"
          placeholder="e.g. New update available"
          value={bcTitle}
          onChange={(e) => setBcTitle(e.target.value)}
        />
        <div className="adm-notif-lbl">Notification content (shown when tapped)</div>
        <textarea
          className="adm-notif-textarea"
          placeholder="Full message…"
          value={bcBody}
          onChange={(e) => setBcBody(e.target.value)}
        />
        <PhotoPicker url={bcPhoto} onChange={setBcPhoto} />
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <button className="adm-btn adm-btn-ghost" onClick={() => setBroadcastOpen(false)}>Cancel</button>
          <button className="adm-notif-send-btn" style={{ flex: 1 }} disabled={bcSending} onClick={() => void sendBroadcast()}>
            {bcSending ? "Sending…" : "Send to All Marketers"}
          </button>
        </div>
      </div>

      <div className="adm-filter-row">
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={"adm-filter-chip" + (roleFilter === f.key ? " on" : "")}
            data-role={f.key}
            onClick={() => setRoleFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DateFilterTabs
        selected={selected}
        onChange={setSelected}
        classes={USERS_CLASSES}
        labels={EN_LABELS}
        dayItems={dayItems}
        monthItems={monthItems}
        yearItems={buildYearItems()}
      />

      <input
        className="adm-search"
        placeholder="Search by name, email, phone, business…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ margin: "10px 0 4px" }}>
        <button
          className="adm-go-btn"
          style={{ width: "100%", background: "#c0392b", padding: "10px 12px", fontSize: 13 }}
          onClick={() => void wipeAll()}
        >
          Wipe all admin data
        </button>
        <div style={{ fontSize: 11, color: "#9e9b97", marginTop: 4 }}>
          Clears orders, products, payouts, reports, notifications, employees and reviews across all admin pages. User
          accounts and bans are kept.
        </div>
      </div>

      <div className="adm-section">{body}</div>

      <DeletionRequestsOverlay open={delReqOpen} onClose={() => setDelReqOpen(false)} />
    </>
  );
}
