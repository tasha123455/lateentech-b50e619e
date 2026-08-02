import { useCallback, useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";

type AdminRow = {
  email: string;
  user_id: string | null;
  full_name: string | null;
  phone: string | null;
  is_master: boolean;
  markets: string[] | null;
  pages: string[];
  active: boolean;
};

type PageOpt = { id: string; label: string };
type MarketOpt = { code: string; name_en: string };

/**
 * Who can get into the admin console, and how much of it they see.
 *
 * Only the master admin can open this — but that is decided in the database,
 * not here. Every call this page makes is refused for anyone else, so hiding
 * the page is a courtesy rather than the lock.
 */
export function AdminsPage({ onBack }: { onBack: () => void }) {
  const { api } = useAdminData();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [pages, setPages] = useState<PageOpt[]>([]);
  const [markets, setMarkets] = useState<MarketOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pg, mk] = await Promise.all([
        api.admin.listAdmins(),
        api.admin.listAdminPages(),
        api.admin.listMarkets(),
      ]);
      setRows(list as unknown as AdminRow[]);
      setPages(pg);
      setMarkets(mk.map((m) => ({ code: m.code, name_en: m.name_en })));
      setErr("");
    } catch (e) {
      setErr((e as Error)?.message || "Could not load the admins");
    }
    setLoading(false);
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const setActive = async (row: AdminRow, active: boolean) => {
    try {
      await api.admin.setAdminActive(row.email, active);
      await load();
    } catch (e) {
      setErr((e as Error)?.message || "Could not change that admin");
    }
  };

  return (
    <>
      <PageHeader title="Admins" onBack={onBack} />
      <button
        className="adm-btn adm-btn-acc adm-admins-add"
        onClick={() => { setEditing(null); setAdding(true); }}
      >
        + Add admin
      </button>

      {!!err && <div className="adm-admins-err">{err}</div>}

      {loading ? (
        <div className="adm-empty">Loading…</div>
      ) : (
        <div className="adm-admins-list">
          {rows.map((r) => (
            <div className={"adm-admin-card" + (r.active ? "" : " off")} key={r.email}>
              <div className="adm-admin-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="adm-admin-name" data-no-i18n>
                    {r.full_name || r.email}
                    {r.is_master && <span className="adm-admin-master">Master</span>}
                    {/* An invited admin who has never signed in yet. */}
                    {!r.user_id && <span className="adm-admin-pending">Invited</span>}
                  </div>
                  <div className="adm-admin-email" dir="ltr" data-no-i18n>{r.email}</div>
                  {!!r.phone && <div className="adm-admin-phone" dir="ltr" data-no-i18n>{r.phone}</div>}
                </div>
                {!r.is_master && (
                  <button
                    className="adm-btn adm-btn-ghost"
                    onClick={() => { setAdding(false); setEditing(r); }}
                  >
                    Edit
                  </button>
                )}
              </div>

              <div className="adm-admin-scope">
                <span className="adm-admin-kv">
                  <span className="adm-admin-k">Countries</span>
                  <span className="adm-admin-v" data-no-i18n>
                    {r.is_master || r.markets === null || !r.markets.length
                      ? "All"
                      : r.markets.join(", ")}
                  </span>
                </span>
                <span className="adm-admin-kv">
                  <span className="adm-admin-k">Pages</span>
                  <span className="adm-admin-v" data-no-i18n>
                    {r.is_master
                      ? "All"
                      : r.pages.length
                        ? r.pages
                            .map((p) => pages.find((x) => x.id === p)?.label || p)
                            .join(", ")
                        : "None"}
                  </span>
                </span>
              </div>

              {!r.is_master && (
                <button
                  className={"adm-btn " + (r.active ? "adm-btn-rej" : "adm-btn-acc")}
                  onClick={() => void setActive(r, !r.active)}
                >
                  {r.active ? "Suspend" : "Restore"}
                </button>
              )}
            </div>
          ))}
          {!rows.length && <div className="adm-empty">No admins yet.</div>}
        </div>
      )}

      {(adding || editing) && (
        <AdminForm
          row={editing}
          pages={pages}
          markets={markets}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

/** Add or edit one admin. The email is the login and the key, so it is fixed
 *  once the row exists — changing it would strand the invite. */
function AdminForm({
  row, pages, markets, onClose, onSaved,
}: {
  row: AdminRow | null;
  pages: PageOpt[];
  markets: MarketOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useAdminData();
  const [email, setEmail] = useState(row?.email ?? "");
  const [name, setName] = useState(row?.full_name ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [allMarkets, setAllMarkets] = useState(row ? row.markets === null : true);
  const [picked, setPicked] = useState<string[]>(row?.markets ?? []);
  const [pagePick, setPagePick] = useState<string[]>(row?.pages ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.admin.upsertAdmin({
        email: email.trim(),
        fullName: name.trim() || undefined,
        phone: phone.trim() || undefined,
        // Null is the "every country" answer, which is not the same as
        // picking none — the database reads them differently.
        markets: allMarkets ? null : picked,
        pages: pagePick,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message || "Could not save");
      setBusy(false);
    }
  };

  return (
    <div className="adm-sheet-overlay open">
      <div className="adm-sheet-backdrop" onClick={onClose} />
      <div className="adm-sheet">
        <div className="adm-sheet-title">{row ? "Edit admin" : "Add admin"}</div>

        <label className="adm-lbl">Email (this is how they sign in)</label>
        <input
          className="adm-inp"
          dir="ltr"
          type="email"
          value={email}
          disabled={!!row}
          placeholder="name@example.com"
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="adm-lbl">Name</label>
        <input className="adm-inp" value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} />

        <label className="adm-lbl">Phone (so you can reach them)</label>
        <input className="adm-inp" dir="ltr" value={phone} placeholder="091xxxxxxx" onChange={(e) => setPhone(e.target.value)} />

        <label className="adm-lbl">Which countries do they see?</label>
        <label className="adm-check">
          <input type="checkbox" checked={allMarkets} onChange={(e) => setAllMarkets(e.target.checked)} />
          <span>All countries</span>
        </label>
        {!allMarkets && markets.map((m) => (
          <label className="adm-check" key={m.code}>
            <input
              type="checkbox"
              checked={picked.includes(m.code)}
              onChange={() => toggle(picked, setPicked, m.code)}
            />
            <span data-no-i18n>{m.name_en}</span>
          </label>
        ))}

        <label className="adm-lbl">Which pages can they open?</label>
        {pages.map((p) => (
          <label className="adm-check" key={p.id}>
            <input
              type="checkbox"
              checked={pagePick.includes(p.id)}
              onChange={() => toggle(pagePick, setPagePick, p.id)}
            />
            <span data-no-i18n>{p.label}</span>
          </label>
        ))}

        {!!err && <div className="adm-admins-err">{err}</div>}

        <div className="adm-sheet-actions">
          <button className="adm-btn adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="adm-btn adm-btn-acc" onClick={() => void save()} disabled={busy || !email.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
