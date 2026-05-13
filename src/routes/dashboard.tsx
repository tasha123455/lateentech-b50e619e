import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthContext";
import { LateenShell } from "@/components/dashboard/lateen/LateenShell";

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

  return <LateenShell role={role} />;
}
