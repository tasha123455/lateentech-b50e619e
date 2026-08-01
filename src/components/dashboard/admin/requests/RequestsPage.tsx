import { useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { ReportsTab } from "../products/ReportsPage";
import { DeletionsTab } from "../users/DeletionRequestsPage";

type TabKey = "reports" | "deletions";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "reports", label: "Reports" },
  { key: "deletions", label: "Deletions" },
];

/** Reports and deletion requests are the same job — a person asking the admin
 *  to decide something — so they share one page and switch with the two tabs
 *  across the top, the way a feed app switches between its two feeds. Each tab
 *  carries its own waiting count, so the one you are not looking at can still
 *  tell you it needs you. */
export function RequestsPage({
  active, onBack, onOpenProduct,
}: {
  active: boolean;
  onBack: () => void;
  onOpenProduct: (id: string) => void;
}) {
  const { reports, deletionRequests } = useAdminData();
  const [tab, setTab] = useState<TabKey>("reports");

  const counts: Record<TabKey, number> = {
    reports: reports.filter((r) => r.status === "open").length,
    deletions: deletionRequests.filter((r) => r.status === "wallet_review").length,
  };

  return (
    <>
      <div className="adm-tabbar">
        <button className="adm-back-btn" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="adm-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={"adm-tab" + (tab === t.key ? " on" : "")}
              onClick={() => setTab(t.key)}
            >
              <span className="adm-tab-lbl">{t.label}</span>
              {counts[t.key] > 0 && <span className="adm-tab-count" data-no-i18n>{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        {/* Balances the back button so the tabs sit centred on the page. */}
        <span className="adm-tabbar-pad" aria-hidden="true" />
      </div>

      {tab === "reports"
        ? <ReportsTab active={active} onOpenProduct={onOpenProduct} />
        : <DeletionsTab active={active} />}
    </>
  );
}
