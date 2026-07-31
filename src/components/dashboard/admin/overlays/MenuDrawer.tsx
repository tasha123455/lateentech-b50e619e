import { useAdminData } from "../AdminDataProvider";

/** Bottom-sheet menu behind the last slot of the nav bar.
 *
 *  Holds exactly the four entries that used to be scattered across the Users
 *  and Products headers (plus the Employees tab), so each one now lives in a
 *  single place. */
export function MenuDrawer({
  open, onClose, onDeletionRequests, onReports, onEmployees, onNotifications,
}: {
  open: boolean;
  onClose: () => void;
  onDeletionRequests: () => void;
  onReports: () => void;
  onEmployees: () => void;
  onNotifications: () => void;
}) {
  const { deletionRequests, reports } = useAdminData();
  const pendingDeletions = deletionRequests.filter((r) => r.status === "wallet_review").length;
  const openReports = reports.filter((r) => r.status === "open").length;

  const items = [
    {
      key: "deletions",
      label: "Deletion Requests",
      sub: "Accounts asking to be removed",
      count: pendingDeletions,
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
      sub: "Products flagged by marketers",
      count: openReports,
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
      sub: "Staff, pay cycles and history",
      count: 0,
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
      sub: "Broadcast to all marketers",
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
              <span className="adm-menu-sub">{it.sub}</span>
            </span>
            {it.count > 0 && <span className="adm-menu-count">{it.count}</span>}
            <svg className="adm-menu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
