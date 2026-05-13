import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthContext";
import { BusinessDashboard } from "@/components/dashboard/business/BusinessDashboard";
import { MarketerDashboard } from "@/components/dashboard/marketer/MarketerDashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Lateen" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, role, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/" });
  }, [loading, user, nav]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-text-2">Loading…</div>;
  }
  if (!user) return <Navigate to="/" />;

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-text-2">Setting up your account…</p>
          <p className="mt-2 text-xs text-text-3">If this persists, sign out and pick a role again.</p>
        </div>
      </div>
    );
  }

  const name = (user.user_metadata?.full_name as string) || user.email?.split("@")[0] || "there";
  return role === "business" ? <BusinessDashboard name={name} /> : <MarketerDashboard name={name} />;
}
