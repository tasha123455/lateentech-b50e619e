import { useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { ReportsTab } from "../products/ReportsPage";
import { ChangeRequestsTab } from "./ChangeRequestsTab";
import { TabBar } from "../ui/TabBar";
import { DeletionsTab } from "../users/DeletionRequestsPage";

type TabKey = "reports" | "deletions" | "changes";

/** Reports and deletion requests are the same job — a person asking the admin
 *  to decide something — so they share one page and switch with the tabs across
 *  the top, the way a feed app switches between its feeds. Each tab carries its
 *  own waiting count, so the ones you are not looking at can still tell you
 *  they need you. */
export function RequestsPage({
  active, onOpenProduct,
}: {
  active: boolean;
  onOpenProduct: (id: string) => void;
}) {
  const { reports, deletionRequests, changeRequests } = useAdminData();
  const [tab, setTab] = useState<TabKey>("reports");

  const counts: Record<TabKey, number> = {
    reports: reports.filter((r) => r.status === "open").length,
    deletions: deletionRequests.filter((r) => r.status === "wallet_review").length,
    changes: changeRequests.length,
  };

  return (
    <>
      <TabBar
        tab={tab}
        onTab={setTab}
        tabs={[
          { key: "reports", label: "Reports", count: counts.reports },
          { key: "deletions", label: "Deletions", count: counts.deletions },
          { key: "changes", label: "Info", count: counts.changes },
        ]}
      />

      {tab === "reports" && <ReportsTab active={active} onOpenProduct={onOpenProduct} />}
      {tab === "deletions" && <DeletionsTab active={active} />}
      {tab === "changes" && <ChangeRequestsTab active={active} />}
    </>
  );
}
