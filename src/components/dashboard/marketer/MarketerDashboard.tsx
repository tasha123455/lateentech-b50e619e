import { DashboardShell } from "../DashboardShell";
import { BalanceCard } from "../BalanceCard";
import { StatsRow } from "../StatsRow";
import { RevenueChart } from "../RevenueChart";
import { ProductList } from "../ProductList";
import { NotificationsPage } from "../NotificationsPage";
import { marketerMock } from "@/lib/mock-data";

export function MarketerDashboard({ name }: { name: string }) {
  const m = marketerMock;
  return (
    <DashboardShell
      accent="marketer"
      name={name || m.greetingName}
      subtitle="Marketer workspace"
      pages={{
        home: (
          <>
            <BalanceCard
              label="Total earnings"
              amount={m.earnings}
              sub="Lifetime commission"
              cta="Payout"
              meta={[
                { label: "Pending", value: `$${m.pendingPayout}` },
                { label: "Next payout", value: "Fri" },
              ]}
            />
            <StatsRow stats={m.stats} />
            <RevenueChart title="Earnings" accent="marketer" />
          </>
        ),
        products: <ProductList products={m.campaigns} label="Active campaigns" />,
        alerts: <NotificationsPage items={m.notifications} />,
        menu: null,
      }}
    />
  );
}
