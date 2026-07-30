import { useEffect, useState } from "react";

import type { PageId } from "../lib/types";

const ACTIVE = "#7f77dd";
const IDLE = "var(--color-text-secondary)";

export function BottomNav({
  page, onGo, onMenu,
}: {
  page: PageId;
  onGo: (id: PageId) => void;
  onMenu: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  // Auto-hide on scroll down, show again on scroll up.
  useEffect(() => {
    let lastY = window.scrollY || 0;
    let ticking = false;
    const TH = 6;
    const upd = () => {
      const y = window.scrollY || 0;
      const d = y - lastY;
      if (Math.abs(d) > TH) {
        setHidden(d > 0 && y > 60);
        lastY = y;
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(upd);
        ticking = true;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const item = (id: PageId, label: string, path: React.ReactNode) => {
    const active = page === id;
    const stroke = active ? ACTIVE : IDLE;
    return (
      <div className={"nav-item" + (active ? " active" : "")} onClick={() => onGo(id)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {path}
        </svg>
        <span className="nav-label" style={active ? { color: ACTIVE } : undefined}>{label}</span>
      </div>
    );
  };

  return (
    <div className={"bottom-nav" + (hidden ? " nav-hidden" : "")}>
      {item("pg-home", "Home", <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />)}
      {item("pg-browse", "Browse", <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>)}
      {item("pg-orders", "Orders", <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />)}
      <div className="nav-item" onClick={onMenu}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={IDLE} strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span className="nav-label">Menu</span>
      </div>
    </div>
  );
}
