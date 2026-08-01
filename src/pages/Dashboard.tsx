import { Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { createLateenApi } from "@/lib/lateen-api";
import { useLanguage } from "@/i18n/LanguageContext";
import { BusinessDashboardApp } from "@/components/dashboard/business/BusinessDashboardApp";
import { MarketerDashboardApp } from "@/components/dashboard/marketer/MarketerDashboardApp";
import { AdminDashboardApp } from "@/components/dashboard/admin/AdminDashboardApp";

type Impersonation = { userId: string; role: "marketer" | "business"; name: string; productId?: string };

function readImpersonation(): Impersonation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("lateen_impersonate");
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.userId === "string" && (v.role === "marketer" || v.role === "business")) return v;
    return null;
  } catch { return null; }
}

/** Marks the signed-in account as here, every minute, for as long as a
 *  dashboard is open. The admin home's live-user count reads the other end of
 *  this; nothing else depends on it, so a failed beat is ignored. */
function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const api = createLateenApi(userId);
    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState === "hidden") return;
      void api.touchPresence().catch(() => { /* presence is best-effort */ });
    };
    beat();
    const iv = setInterval(beat, 60000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      stopped = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [userId]);
}

export function Dashboard({ prod }: { prod?: string }) {
  const { user, role, loading } = useAuth();
  const { withLang } = useLanguage();
  const nav = useNavigate();
  const [impersonation, setImpersonation] = useState<Impersonation | null>(() => readImpersonation());

  // The real account, not the impersonated one — an admin looking at someone
  // else's dashboard is the admin being here, not that user.
  usePresenceHeartbeat(user?.id);

  useEffect(() => {
    if (!loading && !user) nav({ to: withLang("/") });
  }, [loading, user, nav, withLang]);

  useEffect(() => {
    if (impersonation && role && role !== "admin") {
      sessionStorage.removeItem("lateen_impersonate");
      setImpersonation(null);
    }
  }, [impersonation, role]);

  // Never swap an already-mounted dashboard for the loading screen: a
  // background session refresh must not tear down (and re-create) the shell,
  // which is what reset the view when returning to the app.
  if (loading && !user) {
    return <div className="flex min-h-screen items-center justify-center text-text-2">Loading…</div>;
  }

  if (!user) return <Navigate to={withLang("/")} />;

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

  const exitImpersonation = () => {
    sessionStorage.removeItem("lateen_impersonate");
    setImpersonation(null);
    window.location.reload();
  };

  if (role === "admin" && impersonation) {
    return (
      <div>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "linear-gradient(90deg,#b45309,#d97706)",
            color: "#fff",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span>👁 Viewing as {impersonation.name} ({impersonation.role === "marketer" ? "Marketer" : "Business"}) — read-only support mode</span>
          <button
            onClick={exitImpersonation}
            style={{
              background: "rgba(0,0,0,0.35)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Exit
          </button>
        </div>
        {impersonation.role === "business" ? (
          <BusinessDashboardApp userId={impersonation.userId} focusProductId={impersonation.productId} />
        ) : (
          <MarketerDashboardApp userId={impersonation.userId} />
        )}
      </div>
    );
  }

  if (role === "business") return <BusinessDashboardApp userId={user.id} />;

  if (role === "marketer") return <MarketerDashboardApp userId={user.id} prod={prod} />;

  return <AdminDashboardApp userId={user.id} />;
}
