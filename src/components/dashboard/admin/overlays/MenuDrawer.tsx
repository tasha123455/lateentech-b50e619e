import { useAdminData } from "../AdminDataProvider";
import { empPayableCount } from "../lib/employees";

/** The numbers the menu entries carry, so the nav's Menu slot can badge their
 *  total without the drawer being open. */
export function useMenuCounts() {
  const { deletionRequests, reports, employees } = useAdminData();
  const deletions = deletionRequests.filter((r) => r.status === "wallet_review").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  const payable = empPayableCount(employees);
  return { deletions, reports: openReports, employees: payable, total: deletions + openReports + payable };
}

/** Bottom-sheet menu behind the last slot of the nav bar.
 *
 *  Holds exactly the four entries that used to be scattered across the Users
 *  and Products headers (plus the Employees tab), so each one now lives in a
 *  single place. */
export function MenuDrawer({
  open, onClose, onDeletionRequests, onReports, onEmployees, onNotifications,
  onSignOut, signingOut,
}: {
  open: boolean;
  onClose: () => void;
  onDeletionRequests: () => void;
  onReports: () => void;
  onEmployees: () => void;
  onNotifications: () => void;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const counts = useMenuCounts();
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";

  const items = [
    {
      key: "deletions",
      label: "Deletion Requests",
      count: counts.deletions,
      onClick: onDeletionRequests,
      icon: (
        <>
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </>
      ),
    },
    {
      key: "reports",
      label: "Reports",
      count: counts.reports,
      onClick: onReports,
      icon: (
        <>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
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
    {
      key: "notifications",
      label: "Send Notification",
      count: 0,
      onClick: onNotifications,
      icon: (
        <>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
