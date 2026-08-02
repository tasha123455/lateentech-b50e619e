import type { AdminPageId } from "../lib/types";

const ITEMS: Array<{ id: AdminPageId; label: string; path: React.ReactNode }> = [
  /* Named for what the page is. It is the platform's numbers — orders, fees,
     users, the chart — not a landing page, and calling it Home only made the
     admin open it expecting something to do. */
  {
    id: "adm-home",
    label: "Analytics",
    path: <><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>,
  },
  /* Receipts coming in and payouts going out are two tabs of one page — the
     platform's money in a single slot. */
  { id: "adm-money", label: "Money", path: <path d="M3 7h18v10H3zM3 11h18M7 15h2" /> },
  {
    id: "adm-users",
    label: "Users",
    path: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11h5M18.5 8.5v5" /></>,
  },
  /* Reports and deletion requests: the only pages where somebody is waiting
     on the admin to decide something, so they get the slot the catalogue had. */
  {
    id: "adm-requests",
    label: "Requests",
    path: (
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </>
    ),
  },
];

/** Employees moved into the menu, so the last slot opens the menu instead of
 *  being a sixth page. `menuOpen` keeps it lit while the sheet is up. */
export function BottomNav({
  page, onGo, onMenu, menuOpen, menuCount = 0, counts = {}, allow,
}: {
  page: AdminPageId;
  onGo: (id: AdminPageId) => void;
  onMenu: () => void;
  menuOpen: boolean;
  /** Everything waiting behind the menu, added up — the pages themselves are
   *  out of sight, so the slot that opens them carries their total. */
  menuCount?: number;
  /** What is waiting on a slot that is in plain sight. */
  counts?: Partial<Record<AdminPageId, number>>;
  /** Whether this admin may open a slot. A slot they cannot open is left out
   *  rather than shown greyed: a door that opens onto an error is worse than
   *  no door. */
  allow?: (id: AdminPageId) => boolean;
}) {
  const shown = allow ? ITEMS.filter((it) => allow(it.id)) : ITEMS;
  return (
    <nav className="adm-bottom-nav">
      {shown.map((it) => (
        <div
          key={it.id}
          className={"adm-nav-item" + (page === it.id && !menuOpen ? " active" : "")}
          onClick={() => onGo(it.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5">{it.path}</svg>
          <span className="adm-nav-label">{it.label}</span>
          {!!counts[it.id] && <span className="adm-nav-count" data-no-i18n>{counts[it.id]}</span>}
        </div>
      ))}
      <div
        className={"adm-nav-item" + (menuOpen ? " active" : "")}
        id="adm-nav-menu"
        onClick={onMenu}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span className="adm-nav-label">Menu</span>
        {menuCount > 0 && <span className="adm-nav-count" data-no-i18n>{menuCount}</span>}
      </div>
    </nav>
  );
}
