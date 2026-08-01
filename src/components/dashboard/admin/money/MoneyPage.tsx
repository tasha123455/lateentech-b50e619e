import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PayoutsPage } from "../payouts/PayoutsPage";
import { TabBar } from "../ui/TabBar";
import { VerifyPage } from "../verify/VerifyPage";

type TabKey = "receipts" | "payouts";

/** Both halves of the money the platform moves — receipts coming in to be
 *  checked, payouts going out to be paid — behind one nav slot.
 *
 *  They stay two lists rather than one: checking a receipt and sending a
 *  transfer are different jobs with different buttons, and receipts arrive far
 *  more often than payouts do. Merged into a single feed the payouts would
 *  drown, and a marketer waiting on their money is the last person to lose. */
export function MoneyPage({ active }: { active: boolean }) {
  const { verifyMarketers, payouts, loadVerify, loadPayouts } = useAdminData();
  const [tab, setTab] = useState<TabKey>("receipts");

  /* Both lists load when the page opens, not just the tab on screen — the
     count on the other tab is the only thing telling you to go look at it. */
  useEffect(() => {
    if (!active) return;
    void loadVerify();
    void loadPayouts();
  }, [active, loadVerify, loadPayouts]);

  const pendingReceipts = verifyMarketers.reduce((n, m) => n + (m.pending ? m.pending.length : 0), 0);

  return (
    <>
      <TabBar
        tab={tab}
        onTab={setTab}
        tabs={[
          { key: "receipts", label: "Receipts", count: pendingReceipts },
          { key: "payouts", label: "Payouts", count: payouts.length },
        ]}
      />
      {tab === "receipts"
        ? <VerifyPage active={active} />
        : <PayoutsPage active={active} />}
    </>
  );
}
