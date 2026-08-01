import { useEffect, useMemo, useState } from "react";

import { searchMatcher } from "@/components/dashboard/marketer/lib/format";

import { useAdminData } from "../AdminDataProvider";
import { UserCard } from "./UserCard";

const ROLE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "marketer", label: "Marketers" },
  { key: "business", label: "Businesses" },
  { key: "admin", label: "Admins" },
];

export function UsersPage({ active, onNotify }: { active: boolean; onNotify: () => void }) {
  const { users, loadUsers, loading, failed } = useAdminData();

  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (active) void loadUsers();
  }, [active, loadUsers]);

  /* The shared matcher rather than a plain lowercase compare: it folds the
     Arabic letter variants, so "احمد" finds "أحمد", and it forgives a typo, so
     a name half-remembered still finds its row. */
  const match = searchMatcher(search);
  const matchesSearch = (u: (typeof users)[number]) =>
    match([u.full_name, u.business_name, u.email, u.phone].filter(Boolean).join(" "));

  // Counts for the chips. Only the tapped chip shows its number, matching the
  // order filters on the business dashboard.
  const counts = useMemo(() => {
    const searched = (users || []).filter(matchesSearch);
    const c: Record<string, number> = { "": searched.length, marketer: 0, business: 0, admin: 0 };
    searched.forEach((u) => { const r = u.role || "marketer"; if (r in c) c[r]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search]);

  const filtered = useMemo(() => {
    let out = (users || []).filter(matchesSearch);
    if (roleFilter) out = out.filter((u) => (u.role || "marketer") === roleFilter);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, roleFilter, search]);

  let body: React.ReactNode;
  if (loading.users) body = <div className="adm-empty">Loading…</div>;
  else if (failed.users) body = <div className="adm-empty">Failed to load.</div>;
  else if (!filtered.length) body = <div className="adm-empty">No users found.</div>;
  else body = filtered.map((u) => <UserCard key={u.id} u={u} onChanged={() => void loadUsers()} />);

  return (
    <>
      <div className="adm-filter-row">
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
