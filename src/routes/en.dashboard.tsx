import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/pages/Dashboard";

export const Route = createFileRoute("/en/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Wasla" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    prod: typeof s.prod === "string" ? s.prod : undefined,
    order: typeof s.order === "string" ? s.order : undefined,
  }),
  component: EnDashboard,
});

function EnDashboard() {
  const { prod } = Route.useSearch();
  return <Dashboard prod={prod} />;
}
