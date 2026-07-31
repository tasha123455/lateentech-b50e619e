import { useEffect, useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { UserCard } from "./UserCard";

const ROLE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "marketer", label: "Marketers" },
  { key: "business", label: "Businesses" },
  { key: "admin", label: "Admins" },
];

export function UsersPage({ active }: { active: boolean }) {
  const { users, loadUsers, loading, failed } = useAdminData();

  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (active) void loadUsers();
  }, [active, loadUsers]);

  const matchesSearch = (u: (typeof users)[number]) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [u.full_name, u.business_name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(q));
  };

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
      </div>

      <input
        className="adm-search"
        placeholder="Search by name, email, phone, business…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="adm-section">{body}</div>
    </>
  );
}
