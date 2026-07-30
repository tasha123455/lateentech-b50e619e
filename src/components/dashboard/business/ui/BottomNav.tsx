export type BizTab = "home" | "products" | "orders" | "notif";

export function BottomNav({
  tab,
  onTab,
  onMenu,
}: {
  tab: BizTab;
  onTab: (t: BizTab) => void;
  onMenu: () => void;
}) {
  return (
    <div className="bottom-nav">
      <div
        className={"nav-item" + (tab === "home" ? " active" : "")}
        id="nav-home"
        onClick={() => onTab("home")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === "home" ? "#34c77b" : "var(--color-text-secondary)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span className="nav-label" style={tab === "home" ? { color: "#34c77b" } : undefined}>Home</span>
      </div>
      <div
        className={"nav-item" + (tab === "products" ? " active" : "")}
        id="nav-products"
        onClick={() => onTab("products")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === "products" ? "#34c77b" : "var(--color-text-secondary)"} strokeWidth="1.8" strokeLinecap="round">
          <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        </svg>
        <span className="nav-label" style={tab === "products" ? { color: "#34c77b" } : undefined}>Products</span>
      </div>
      <div
        className={"nav-item" + (tab === "orders" ? " active" : "")}
        id="nav-orders"
        onClick={() => onTab("orders")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tab === "orders" ? "#34c77b" : "var(--color-text-secondary)"} strokeWidth="1.8" strokeLinecap="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="nav-label" style={tab === "orders" ? { color: "#34c77b" } : undefined}>Orders</span>
      </div>
      <div className="nav-item" id="nav-menu" onClick={onMenu}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span className="nav-label">Menu</span>
      </div>
    </div>
  );
}
