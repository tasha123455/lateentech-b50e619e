import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/pages/Dashboard";

export const Route = createFileRoute("/ar/dashboard")({
  head: () => ({ meta: [{ title: "لوحة التحكم · وصلة" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    prod: typeof s.prod === "string" ? s.prod : undefined,
    order: typeof s.order === "string" ? s.order : undefined,
  }),
  component: ArDashboard,
});

function ArDashboard() {
  const { prod } = Route.useSearch();
  return <Dashboard prod={prod} />;
}
