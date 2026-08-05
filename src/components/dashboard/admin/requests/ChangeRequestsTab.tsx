import { useEffect, useMemo, useState } from "react";

import { normSearch, searchMatcher } from "@/components/dashboard/marketer/lib/format";
import { useAccordion } from "@/lib/useAccordion";

import { useAdminData } from "../AdminDataProvider";
import { dispPhone, initials, whenFull } from "../lib/format";
import type { ChangeRequest } from "../lib/types";
import { goToAccount } from "../users/UserCard";

const FIELD_LABELS: Record<string, string> = {
  phone: "Phone number",
  email: "Email",
  country: "Country",
};
const fieldLabel = (f: string) => FIELD_LABELS[f] || f;

/** Everything a request can be found by, normalised so typing in either
 *  language matches. */
function searchText(r: ChangeRequest): string {
  const p = r.person || {};
  return normSearch(
    [p.full_name, p.business_name, p.email, p.phone, r.note, ...(r.fields || []).map(fieldLabel)]
      .filter(Boolean)
      .join(" "),
  );
}

/** Collapsed, the head row is the whole card: who, what they want changed, how
 *  long ago. Their details, what they wrote and the way into their account
 *  open on tap. */
function ChangeCard({
  r, comment, onComment, onResolve, open, onToggle,
}: {
  r: ChangeRequest;
  comment: string;
  onComment: (v: string) => void;
  onResolve: (id: string) => Promise<void>;
  open: boolean;
  onToggle: () => void;
}) {
  const person = r.person || {};
  const name = person.business_name || person.full_name || "Unknown user";
  const fields = r.fields || [];

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
            {fields.map((f) => (
              <span className="crq-field-pill" key={f}>{fieldLabel(f)}</span>
            ))}
          </div>
        </div>
        <span className="del-ago" data-no-i18n>{whenFull(r.created_at)}</span>
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
          {/* The way in is the whole point of the card: the change itself is
              made on their profile, behind the unlock code. */}
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

          <div className="crq-note-lbl">What they wrote</div>
          <div className="rpt-msg" data-no-i18n>
            {r.note ? r.note : <span style={{ opacity: 0.6 }}>Nothing written</span>}
          </div>

          <textarea
            className="rpt-comment-ta del-note"
            placeholder="What you did, in a line — they see this as the reason their details changed"
            value={comment}
            onChange={(e) => onComment(e.target.value)}
          />
          <div className="del-actions">
            <button className="del-btn del-btn-approve" onClick={() => void onResolve(r.id)}>
              Mark as done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The Change info half of the Requests page. */
export function ChangeRequestsTab({ active }: { active: boolean }) {
  const { changeRequests, loadChangeRequests, api } = useAdminData();
  const [search, setSearch] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);
  const { isOpen, toggle } = useAccordion();

  useEffect(() => {
    if (!active) return;
    void loadChangeRequests().then(() => setLoadedOnce(true));
  }, [active, loadChangeRequests]);

  const resolve = async (id: string) => {
    const comment = (comments[id] || "").trim();
    if (!confirm("Mark this request as done? They will be notified.")) return;
    try {
      await api.admin.resolveChangeRequest(id, comment);
      await loadChangeRequests();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const list = useMemo(() => {
    if (!search.trim()) return changeRequests;
    const match = searchMatcher(search);
    return changeRequests.filter((r) => match(searchText(r)));
  }, [changeRequests, search]);

  let body: React.ReactNode;
  if (!changeRequests.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">{search ? "No requests match your search." : "No requests here."}</div>;
  } else {
    body = list.map((r) => (
      <ChangeCard
        key={r.id}
        r={r}
        comment={comments[r.id] || ""}
        onComment={(v) => setComments((prev) => ({ ...prev, [r.id]: v }))}
        onResolve={resolve}
        open={isOpen(r.id)}
        onToggle={() => toggle(r.id)}
      />
    ));
  }

  return (
    <>
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
