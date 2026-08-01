import { useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { ReportsTab } from "../products/ReportsPage";
import { TabBar } from "../ui/TabBar";
import { DeletionsTab } from "../users/DeletionRequestsPage";

type TabKey = "reports" | "deletions";

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
      <TabBar
        tab={tab}
        onTab={setTab}
        onBack={onBack}
        tabs={[
          { key: "reports", label: "Reports", count: counts.reports },
          { key: "deletions", label: "Deletions", count: counts.deletions },
        ]}
      />

      {tab === "reports"
        ? <ReportsTab active={active} onOpenProduct={onOpenProduct} />
        : <DeletionsTab active={active} />}
    </>
  );
}
