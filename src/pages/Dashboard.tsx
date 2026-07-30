import { Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { LateenShell } from "@/components/dashboard/lateen/LateenShell";
import { BusinessDashboardApp } from "@/components/dashboard/business/BusinessDashboardApp";

type Impersonation = { userId: string; role: "marketer" | "business"; name: string };

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

export function Dashboard({ prod }: { prod?: string }) {
  const { user, role, loading } = useAuth();
  const { withLang } = useLanguage();
  const nav = useNavigate();
  const [impersonation, setImpersonation] = useState<Impersonation | null>(() => readImpersonation());

  useEffect(() => {
    if (!loading && !user) nav({ to: withLang("/") });
  }, [loading, user, nav, withLang]);

  useEffect(() => {
    if (impersonation && role && role !== "admin") {
      sessionStorage.removeItem("lateen_impersonate");
      setImpersonation(null);
    }
  }, [impersonation, role]);

  useEffect(() => {
    if (!prod || role !== "marketer") return;
    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled) return;
      const w = window as unknown as {
        openD?: (id: string) => void;
        goTo?: (page: string) => void;
        __lateenGetProducts?: () => Array<{ id: string }>;
      };
      const list = typeof w.__lateenGetProducts === "function" ? w.__lateenGetProducts() : undefined;
      const ready = typeof w.openD === "function" && typeof w.goTo === "function" && Array.isArray(list) && list.some((p) => p.id === prod);
      if (ready) {
        try { w.goTo!("pg-browse"); } catch { /* ignore */ }
        try { w.openD!(prod); } catch { /* ignore */ }
        return;
      }
      if (Date.now() - start > 15000) return;
      setTimeout(tick, 150);
    };
    tick();
    return () => { cancelled = true; };
  }, [prod, role]);

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
          <BusinessDashboardApp userId={impersonation.userId} />
        ) : (
          <LateenShell role={impersonation.role} overrideUserId={impersonation.userId} />
        )}
      </div>
    );
  }

  if (role === "business") return <BusinessDashboardApp userId={user.id} />;

  return <LateenShell role={role} />;
}
