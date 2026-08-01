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
  { id: "adm-verify", label: "Verify", path: <path d="M9 12l2 2 4-4M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
  { id: "adm-payouts", label: "Payouts", path: <path d="M3 7h18v10H3zM3 11h18M7 15h2" /> },
  {
    id: "adm-users",
    label: "Users",
    path: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 11h5M18.5 8.5v5" /></>,
  },
  { id: "adm-products", label: "Products", path: <path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" /> },
];

/** Employees moved into the menu, so the last slot opens the menu instead of
 *  being a sixth page. `menuOpen` keeps it lit while the sheet is up. */
export function BottomNav({
  page, onGo, onMenu, menuOpen, menuCount = 0,
}: {
  page: AdminPageId;
  onGo: (id: AdminPageId) => void;
  onMenu: () => void;
  menuOpen: boolean;
  /** Everything waiting behind the menu, added up — the pages themselves are
   *  out of sight, so the slot that opens them carries their total. */
  menuCount?: number;
}) {
  return (
    <nav className="adm-bottom-nav">
      {ITEMS.map((it) => (
        <div
          key={it.id}
          className={"adm-nav-item" + (page === it.id && !menuOpen ? " active" : "")}
          onClick={() => onGo(it.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5">{it.path}</svg>
          <span className="adm-nav-label">{it.label}</span>
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
