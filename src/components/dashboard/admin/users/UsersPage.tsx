import { useEffect, useMemo, useState } from "react";

import { searchMatcher, t } from "@/components/dashboard/marketer/lib/format";

import { useAdminData } from "../AdminDataProvider";
import { UserCard } from "./UserCard";

const ROLE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "marketer", label: "Marketers" },
  { key: "business", label: "Businesses" },
  { key: "admin", label: "Admins" },
];

/* What an account can currently be. These are states an admin puts an account
   into, or that it has asked to be put into — not roles, which the row of
   chips beside this already covers. */
type StatusKey = "" | "active" | "frozen" | "banned" | "deleting";
const STATUS_FILTERS: Array<{ key: StatusKey; en: string; ar: string }> = [
  { key: "", en: "Any status", ar: "كل الحالات" },
  { key: "active", en: "Active", ar: "نشط" },
  { key: "frozen", en: "Frozen", ar: "مجمّد" },
  { key: "banned", en: "Banned", ar: "محظور" },
  { key: "deleting", en: "Pending deletion", ar: "طلب حذف" },
];

/** The admin panel is English, but this row sits beside Arabic account names
 *  and the label was asked for in both. */
const statusLabel = (s: { en: string; ar: string }) => t(s.en, s.ar);

export function UsersPage({ active, onNotify }: { active: boolean; onNotify: () => void }) {
  const { users, loadUsers, loading, failed, deletionRequests, loadDeletionRequests } = useAdminData();

  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey>("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (active) void loadUsers();
  }, [active, loadUsers]);

  /* "Pending deletion" is not on the profile row — it is a request sitting on
     another table — so that list has to be here for the filter to know. */
  useEffect(() => {
    if (active) void loadDeletionRequests();
  }, [active, loadDeletionRequests]);

  const deleting = useMemo(() => {
    const open = new Set(["wallet_review", "scheduled"]);
    return new Set(
      (deletionRequests || [])
        .filter((r) => open.has(String(r.status || "")))
        .map((r) => r.user_id),
    );
  }, [deletionRequests]);

  const statusOf = (u: (typeof users)[number]): StatusKey =>
    u.banned_at ? "banned" : u.frozen_at ? "frozen" : deleting.has(u.id) ? "deleting" : "active";

  /* The shared matcher rather than a plain lowercase compare: it folds the
     Arabic letter variants, so "احمد" finds "أحمد", and it forgives a typo, so
     a name half-remembered still finds its row. */
  const match = searchMatcher(search);
  const matchesSearch = (u: (typeof users)[number]) =>
    match([u.full_name, u.business_name, u.email, u.phone].filter(Boolean).join(" "));

  // Counts for the chips. Only the tapped chip shows its number, matching the
  // order filters on the business dashboard.
  const counts = useMemo(() => {
    const searched = (users || []).filter(matchesSearch).filter((u) => !statusFilter || statusOf(u) === statusFilter);
    const c: Record<string, number> = { "": searched.length, marketer: 0, business: 0, admin: 0 };
    searched.forEach((u) => { const r = u.role || "marketer"; if (r in c) c[r]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, statusFilter, deleting]);

  /* How many accounts each status would leave, so the dropdown answers before
     it is picked rather than after. Counted under the search and the role
     already chosen — the number has to describe what tapping it would show. */
  const statusCounts = useMemo(() => {
    const base = (users || [])
      .filter(matchesSearch)
      .filter((u) => !roleFilter || (u.role || "marketer") === roleFilter);
    const c: Record<string, number> = { "": base.length, active: 0, frozen: 0, banned: 0, deleting: 0 };
    base.forEach((u) => { c[statusOf(u)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, roleFilter, deleting]);

  const filtered = useMemo(() => {
    let out = (users || []).filter(matchesSearch);
    if (roleFilter) out = out.filter((u) => (u.role || "marketer") === roleFilter);
    if (statusFilter) out = out.filter((u) => statusOf(u) === statusFilter);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, roleFilter, statusFilter, search, deleting]);

  let body: React.ReactNode;
  if (loading.users) body = <div className="adm-empty">Loading…</div>;
  else if (failed.users) body = <div className="adm-empty">Failed to load.</div>;
  else if (!filtered.length) body = <div className="adm-empty">No users found.</div>;
  else body = filtered.map((u) => <UserCard key={u.id} u={u} onChanged={() => void loadUsers()} />);

  return (
    <>
      <div className="adm-filter-row">
        {/* First in the row, because "who is frozen" is the question an admin
            comes to this page with more often than "who is a marketer" — and
            it is a dropdown rather than four more chips because the statuses
            are a list that will grow, and the row is already full. */}
        <button
          className={"adm-filter-chip adm-status-chip" + (statusFilter ? " on" : "") + (statusOpen ? " open" : "")}
          onClick={() => setStatusOpen((v) => !v)}
        >
          {/* Carries its count once a status is picked, the way the role
              chips beside it do. Shut, the chip was the only one in the row
              that named a filter without saying how much of the list it had
              left. */}
          <span>
            {statusFilter
              ? statusLabel(STATUS_FILTERS.find((s) => s.key === statusFilter)!) + ` (${statusCounts[statusFilter] || 0})`
              : t("Status", "الحاله")}
          </span>
          <span className="adm-status-chev">▾</span>
        </button>
        {ROLE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={"adm-filter-chip" + (roleFilter === f.key ? " on" : "")}
            data-role={f.key}
            onClick={() => setRoleFilter(f.key)}
          >
            {f.label}{roleFilter === f.key ? ` (${counts[f.key] || 0})` : ""}
          </button>
        ))}
        {/* Broadcasting goes to everybody in this list, so the way to send it
            sits at the end of the same row — the way "+ New" does on the
            employees page. It was only reachable from the menu before. */}
        <button className="adm-filter-chip adm-notify-chip" onClick={onNotify}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>Notify</span>
        </button>
      </div>

      <div className={"bd-dropdown-list" + (statusOpen ? " open" : "")}>
        {STATUS_FILTERS.map((s) => (
          <div
            key={s.key || "any"}
            className={"bd-dd-item" + (statusFilter === s.key ? " on" : "")}
            onClick={() => { setStatusFilter(s.key); setStatusOpen(false); }}
          >
            {statusLabel(s)}
            <span className="adm-status-count">{statusCounts[s.key || ""] || 0}</span>
          </div>
        ))}
      </div>

      <input
        className="adm-search"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="adm-section">{body}</div>
    </>
  );
}
