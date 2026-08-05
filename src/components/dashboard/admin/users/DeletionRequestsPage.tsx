import { useEffect, useMemo, useState } from "react";

import { normSearch, searchMatcher } from "@/components/dashboard/marketer/lib/format";
import { useAccordion } from "@/lib/useAccordion";

import { useAdminData } from "../AdminDataProvider";
import { dispPhone, initials, money, when, whenFull } from "../lib/format";
import type { DeletionRequest } from "../lib/types";
import { goToAccount } from "./UserCard";

/* Only the two states an admin acts on or waits out. Rejected and cancelled
   requests are finished with — like reports, they stay in the database without
   taking up room on the page. */
const FILTERS: Array<{ key: string; label: string }> = [
  { key: "wallet_review", label: "Needs Review" },
  { key: "scheduled", label: "Scheduled" },
];

/** Everything a request can be found by, normalised so typing in either
 *  language matches. */
function searchText(r: DeletionRequest): string {
  const p = r.person || {};
  return normSearch(
    [p.full_name, p.business_name, p.email, p.phone, r.role, r.admin_comment].filter(Boolean).join(" "),
  );
}

/** Collapsed, the head row is the whole card: who, which role, how long ago.
 *  Contact details, the wallet and the decision open on tap. */
function DeletionCard({
  r, comment, onComment, onResolve, open, onToggle,
}: {
  r: DeletionRequest;
  comment: string;
  onComment: (v: string) => void;
  onResolve: (id: string, action: "approve" | "reject") => Promise<void>;
  open: boolean;
  onToggle: () => void;
}) {
  const person = r.person || {};
  const name = person.business_name || person.full_name || "Unknown user";
  const wallet = r.live_wallet || {};
  const bal = Number(wallet.balance != null ? wallet.balance : r.wallet_balance) || 0;
  const pending = Number(wallet.pending != null ? wallet.pending : r.wallet_pending) || 0;
  const hasFunds = bal > 0 || pending > 0;
  const needsReview = r.status === "wallet_review";

  return (
    <div className={"del-card" + (open ? " open" : "")}>
      <button className="del-head" onClick={onToggle}>
        <div className="adm-user-av" data-no-i18n>
          {person.avatar_signed_url
            ? <img src={person.avatar_signed_url} alt="" loading="lazy" decoding="async" />
            : initials(name)}
        </div>
        <div className="del-head-mid">
          <div className="del-head-name" data-no-i18n>{name}</div>
          <div className="del-head-sub">
            <span className="rpt-type-pill">{r.role === "business" ? "Business" : "Marketer"}</span>
            {/* Only where an answer is actually wanted. Accounts with no
                activity schedule their own deletion, and a red dot on every
                one of those is a queue that never empties — so the dot stops
                meaning "look at this". It is kept for the requests held for
                review, which are the ones that do need a decision. */}
            {hasFunds && needsReview && <span className="del-funds-dot" title="Wallet still has money">●</span>}
          </div>
        </div>
        <span className="del-ago" data-no-i18n>{when(r.requested_at)}</span>
        <svg
          className={"rpt-head-chev" + (open ? " open" : "")}
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="del-body">
          <div className="del-top">
            <button className="adm-go-btn" onClick={() => goToAccount(r.user_id, r.role || "marketer", name)}>
              Go to Account
            </button>
          </div>

          <div className="del-rows">
            <div className="del-row">
              <span className="del-k">Name</span>
              <span className="del-v" data-no-i18n>{name}</span>
            </div>
            <div className="del-row">
              <span className="del-k">Phone number</span>
              <span className="del-v" data-no-i18n>{dispPhone(person.phone) || "—"}</span>
            </div>
            <div className="del-row">
              <span className="del-k">Email</span>
              <span className="del-v" data-no-i18n>{person.email || "—"}</span>
            </div>
          </div>

          {hasFunds ? (
            <div className="del-wallet has-funds">
              <span>Wallet balance</span>
              <b data-no-i18n>{money(bal)}</b>
              {pending > 0 ? <span className="del-wallet-pending">· Pending: <b data-no-i18n>{money(pending)}</b></span> : null}
            </div>
          ) : (
            <div className="del-wallet">Wallet is empty.</div>
          )}

          {needsReview ? (
            <>
              <textarea
                className="rpt-comment-ta del-note"
                placeholder="Optional note for approval, or the reason if you're rejecting this request"
                value={comment}
                onChange={(e) => onComment(e.target.value)}
              />
              <div className="del-actions">
                <button className="del-btn del-btn-reject" onClick={() => void onResolve(r.id, "reject")}>
                  Reject
                </button>
                <button className="del-btn del-btn-approve" onClick={() => void onResolve(r.id, "approve")}>
                  Approve &amp; schedule deletion
                </button>
              </div>
            </>
          ) : (
            <div className="del-wallet">
              <span>Scheduled for</span>
              <b data-no-i18n>{whenFull(r.scheduled_for)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The Deletions half of the Requests page — list, its two states and search;
 *  the header and tabs belong to the page. */
export function DeletionsTab({ active }: { active: boolean }) {
  const { deletionRequests, loadDeletionRequests, api } = useAdminData();
  const [filter, setFilter] = useState("wallet_review");
  const [search, setSearch] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);
  const { isOpen, toggle } = useAccordion();

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

  const counts = useMemo(() => {
    const c: Record<string, number> = { wallet_review: 0, scheduled: 0 };
    deletionRequests.forEach((r) => { if (r.status && r.status in c) c[r.status]++; });
    return c;
  }, [deletionRequests]);

  const list = useMemo(() => {
    const inFilter = deletionRequests.filter((r) => r.status === filter);
    if (!search.trim()) return inFilter;
    const match = searchMatcher(search);
    return inFilter.filter((r) => match(searchText(r)));
  }, [deletionRequests, filter, search]);

  let body: React.ReactNode;
  if (!deletionRequests.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">{search ? "No requests match your search." : "No requests here."}</div>;
  } else {
    body = list.map((r) => <DeletionCard key={r.id} r={r} comment={comments[r.id] || ""}
      onComment={(v) => setComments((prev) => ({ ...prev, [r.id]: v }))}
      onResolve={resolve} open={isOpen(r.id)} onToggle={() => toggle(r.id)} />);
  }

  return (
    <>
      <div className="adm-filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={"adm-filter-chip" + (filter === f.key ? " on" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label}{filter === f.key ? ` (${counts[f.key] || 0})` : ""}
          </button>
        ))}
      </div>
      <input
        className="adm-search"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div>{body}</div>
    </>
  );
}
