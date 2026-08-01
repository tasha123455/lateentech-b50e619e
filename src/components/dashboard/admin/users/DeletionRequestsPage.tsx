import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";
import { initials, money, when, whenFull } from "../lib/format";
import { goToAccount } from "./UserCard";

const STATUS_LABEL = (s?: string | null) =>
  s === "wallet_review" ? "Needs Review"
    : s === "scheduled" ? "Scheduled"
      : s === "rejected" ? "Rejected"
        : s === "cancelled" ? "Cancelled" : "Completed";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "wallet_review", label: "Needs Review" },
  { key: "scheduled", label: "Scheduled" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

export function DeletionRequestsPage({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { deletionRequests, loadDeletionRequests, api } = useAdminData();
  const [filter, setFilter] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!active) return;
    void loadDeletionRequests().then(() => setLoadedOnce(true));
  }, [active, loadDeletionRequests]);

  const resolve = async (id: string, action: "approve" | "reject") => {
    const comment = (comments[id] || "").trim();
    if (action === "reject") {
      if (!comment) {
        alert("Write a reason before rejecting this request.");
        return;
      }
      if (!confirm("Reject this deletion request? The user will be notified with your reason.")) return;
    } else {
      if (!confirm("Approve this deletion request? The account will be permanently deleted in 14 days, and the user will be notified.")) return;
    }
    try {
      await api.admin.resolveDeletionRequest(id, action, comment || null);
      await loadDeletionRequests();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const list = filter ? deletionRequests.filter((r) => r.status === filter) : deletionRequests;

  let body: React.ReactNode;
  if (!deletionRequests.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">No requests{filter ? " in this filter" : ""}.</div>;
  } else {
    body = list.map((r) => {
      const person = r.person || {};
      const name = person.business_name || person.full_name || "Unknown user";
      const wallet = r.live_wallet || {};
      const bal = Number(wallet.balance != null ? wallet.balance : r.wallet_balance) || 0;
      const pending = Number(wallet.pending != null ? wallet.pending : r.wallet_pending) || 0;
      const hasFunds = bal > 0 || pending > 0;
      const needsReview = r.status === "wallet_review";

      return (
        <div className="rpt-card" key={r.id}>
          <div className="rpt-top">
            <span className="rpt-type-pill">{r.role === "business" ? "Business" : "Marketer"}</span>
            <span className={"rpt-status-pill " + (needsReview ? "rpt-status-open" : "rpt-status-resolved")}>
              {STATUS_LABEL(r.status)}
            </span>
          </div>
          <div className="rpt-reporter-row">
            <div className="adm-user-av" data-no-i18n>{initials(name)}</div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div className="rpt-name" data-no-i18n>{name}</div>
              <div className="rpt-sub">{(person.phone || "no phone") + " · Requested " + when(r.requested_at)}</div>
            </div>
            <button className="adm-go-btn" onClick={() => goToAccount(r.user_id, r.role || "marketer", name)}>
              Go to Account
            </button>
          </div>

          {hasFunds ? (
            <div className="rpt-resolved-note" style={{ background: "#2a1a1a", color: "#f0c0c0" }}>
              Wallet balance: <b>{money(bal)}</b>
              {pending > 0 ? <> · Pending: <b>{money(pending)}</b></> : null}
            </div>
          ) : (
            <div className="rpt-resolved-note">Wallet is empty.</div>
          )}

          {needsReview ? (
            <div className="rpt-comment-box">
              <textarea
                className="rpt-comment-ta"
                placeholder="Optional note for approval, or the reason if you're rejecting this request"
                value={comments[r.id] || ""}
                onChange={(e) => setComments((prev) => ({ ...prev, [r.id]: e.target.value }))}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="adm-btn adm-btn-acc" style={{ flex: 1 }} onClick={() => void resolve(r.id, "approve")}>
                  Approve &amp; schedule deletion
                </button>
                <button
                  className="adm-go-btn"
                  style={{ flex: 1, background: "#fee", color: "#c00", borderColor: "#fcc" }}
                  onClick={() => void resolve(r.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          ) : r.status === "scheduled" ? (
            <div className="rpt-resolved-note"><b>Scheduled for:</b> {whenFull(r.scheduled_for)}</div>
          ) : (
            <div className="rpt-resolved-note">
              <b>Admin comment:</b> <span data-no-i18n>{r.admin_comment || ""}</span>
              <div style={{ marginTop: 4, opacity: 0.8, fontSize: 11 }}>Reviewed {when(r.resolved_at)}</div>
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <>
      <PageHeader title="Deletion Requests" onBack={onBack} count={deletionRequests.filter((r) => r.status === "wallet_review").length} />
        <div className="adm-filter-row" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={"adm-filter-chip" + (filter === f.key ? " on" : "")}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      <div>{body}</div>
    </>
  );
}
