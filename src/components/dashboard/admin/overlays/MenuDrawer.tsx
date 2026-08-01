import { useAdminData } from "../AdminDataProvider";
import { empPayableCount } from "../lib/employees";

/** Everything waiting anywhere in the admin, in one place: the Requests slot
 *  in the nav badges its own two lists, and the Menu slot badges the total of
 *  the pages hidden behind it. */
export function useAdminCounts() {
  const { deletionRequests, reports, employees, verifyMarketers, payouts } = useAdminData();
  const deletions = deletionRequests.filter((r) => r.status === "wallet_review").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  const payable = empPayableCount(employees);
  const receipts = verifyMarketers.reduce((n, m) => n + (m.pending ? m.pending.length : 0), 0);
  return {
    deletions,
    reports: openReports,
    requests: deletions + openReports,
    receipts,
    /* Both halves of the Money page: receipts to check and payouts to send. */
    money: receipts + payouts.length,
    employees: payable,
    /* Products carries no number — nothing on it is waiting on the admin. */
    menuTotal: payable,
  };
}

/** Bottom-sheet menu behind the last slot of the nav bar.
 *
 *  Holds exactly the four entries that used to be scattered across the Users
 *  and Products headers (plus the Employees tab), so each one now lives in a
 *  single place. */
export function MenuDrawer({
  open, onClose, onProducts, onEmployees,
  onSignOut, signingOut,
}: {
  open: boolean;
  onClose: () => void;
  onProducts: () => void;
  onEmployees: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const counts = useAdminCounts();
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";

  const items = [
    /* Browsing the catalogue is something the admin chooses to do, not
       something waiting on them, so it moved off the nav bar and in here. */
    {
      key: "products",
      label: "Product Review",
      count: 0,
      onClick: onProducts,
      icon: (
        <>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <line x1="12" y1="11" x2="12" y2="21" />
        </>
      ),
    },
    {
      key: "employees",
      label: "Employees",
      count: counts.employees,
      onClick: onEmployees,
      icon: (
        <>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 21c1-4 4-6 7-6s6 2 7 6" />
        </>
      ),
    },
  ];

  return (
    <div className={"adm-menu-overlay" + (open ? " open" : "")}>
      <div className="adm-menu-backdrop" onClick={onClose} />
      <div className="adm-menu-drawer">
        <button className="adm-menu-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="adm-menu-head">
          <div className="adm-avatar">A</div>
          <div>
            <div className="adm-menu-head-name">Admin Console</div>
            <div className="adm-menu-head-sub">Wasla platform control</div>
          </div>
        </div>
        {items.map((it) => (
          <button key={it.key} className="adm-menu-item" onClick={it.onClick}>
            <span className="adm-menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {it.icon}
              </svg>
            </span>
            <span className="adm-menu-text">
              <span className="adm-menu-label">{it.label}</span>
              </span>
            {it.count > 0 && <span className="adm-menu-count">{it.count}</span>}
            <svg className="adm-menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}

        {/* Same switch the business and marketer menus carry, driven by the
            same global toggle the language layout installs. */}
        <button
          className="adm-menu-item"
          data-no-i18n
          onClick={() => {
            const w = window as unknown as { __lateenToggleLang?: () => void };
            w.__lateenToggleLang?.();
          }}
        >
          <span className="adm-menu-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </span>
          <span className="adm-menu-text">
            <span className="adm-menu-label">{ar ? "اللغة" : "Language"}</span>
            <span className="adm-menu-sub">{ar ? "Language" : "اللغة"}</span>
          </span>
          <svg className="adm-menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Sits at the bottom of the drawer, the way the business and marketer
            menus do — it used to be a button in the header of every page. */}
        <button className="adm-menu-item adm-menu-signout" onClick={onSignOut} aria-busy={signingOut || undefined}>
          <span className="adm-menu-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </span>
          <span className="adm-menu-text">
            <span className="adm-menu-label">{signingOut ? "Signing out…" : "Sign out"}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
