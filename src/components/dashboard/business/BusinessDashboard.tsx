import { DashboardShell } from "../DashboardShell";
import { BalanceCard } from "../BalanceCard";
import { StatsRow } from "../StatsRow";
import { RevenueChart } from "../RevenueChart";
import { ProductList } from "../ProductList";
import { NotificationsPage } from "../NotificationsPage";
import { businessMock } from "@/lib/mock-data";

export function BusinessDashboard({ name }: { name: string }) {
  const m = businessMock;
  return (
    <DashboardShell
      accent="business"
      name={name || m.greetingName}
      subtitle="Business workspace"
      pages={{
        home: (
          <>
            <BalanceCard
              label="Available balance"
              amount={m.balance}
              sub="Updated just now"
              cta="Payout"
              meta={[
                { label: "Pending", value: `£${m.pendingPayout}` },
                { label: "Next payout", value: "Fri" },
              ]}
            />
            <StatsRow stats={m.stats} />
            <RevenueChart title="Revenue" accent="business" />
          </>
        ),
        products: <ProductList products={m.products} label="Your products" />,
        alerts: <NotificationsPage items={m.notifications} />,
        menu: null,
      }}
    />
  );
}
