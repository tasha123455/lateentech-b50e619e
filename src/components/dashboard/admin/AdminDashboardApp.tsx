import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthContext";
import "@/styles/lateen-admin.css";
import "@/styles/admin-dashboard.css";

import { AdminDataProvider, useAdminData } from "./AdminDataProvider";
import { EmployeesPage } from "./employees/EmployeesPage";
import { HomePage } from "./home/HomePage";
import { readPage, readScroll, writePage, writeScroll } from "./lib/storage";
import type { AdminPageId } from "./lib/types";
import { PayoutsPage } from "./payouts/PayoutsPage";
import { ProductsPage } from "./products/ProductsPage";
import { BottomNav } from "./ui/BottomNav";
import { LightboxProvider } from "./ui/Lightbox";
import { UsersPage } from "./users/UsersPage";
import { VerifyPage } from "./verify/VerifyPage";

function Shell() {
  const { userId, loadMetrics } = useAdminData();
  const { signOut } = useAuth();

  const [page, setPage] = useState<AdminPageId>(() => readPage(userId) || "adm-home");
  const [signingOut, setSigningOut] = useState(false);

  const goTo = useCallback(
    (id: AdminPageId) => {
      setPage(id);
      writePage(id, userId);
    },
    [userId],
  );

  // Home re-pulls its metrics whenever it becomes the active page, matching
  // the old admGo() dispatch.
  useEffect(() => {
    if (page === "adm-home") void loadMetrics();
  }, [page, loadMetrics]);

  /* ── Scroll restore ──
     Runs against a growing page, so it keeps re-applying until the document is
     tall enough or 2.5s have passed. */
  const restoringRef = useRef(false);
  useEffect(() => {
    const target = readScroll(userId);
    if (!(target > 0)) return;
    restoringRef.current = true;
    const t0 = Date.now();
    const tick = () => {
      const max = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
      window.scrollTo(0, Math.min(target, max));
      if (max >= target - 2 && Math.abs((window.scrollY || 0) - target) < 3) {
        restoringRef.current = false;
        return;
      }
      if (Date.now() - t0 < 2500) requestAnimationFrame(tick);
      else restoringRef.current = false;
    };
    requestAnimationFrame(tick);
  }, [userId]);

  useEffect(() => {
    const flush = () => {
      if (restoringRef.current) return;
      writeScroll(window.scrollY || 0, userId);
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("scroll", flush, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);

  const onSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    void signOut().catch((err) => {
      console.error("[Lateen] sign-out failed", err);
      setSigningOut(false);
      try {
        alert(document.documentElement.lang === "ar" ? "تعذّر تسجيل الخروج. حاول مرة أخرى." : "Sign out failed. Please try again.");
      } catch { /* ignore */ }
    });
  };

  return (
    <div className="adm-app">
      <div className="adm-topbar">
        <div className="adm-tl">
          <div className="adm-avatar">A</div>
          <div>
            <div className="adm-greet">Admin Console</div>
            <div className="adm-greet-sub">Wasla platform control</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="adm-badge">Admin</span>
          <button className="adm-signout" onClick={onSignOut} aria-busy={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      <section className={"adm-page" + (page === "adm-home" ? " active" : "")} id="adm-home">
        <HomePage />
      </section>

      <section className={"adm-page" + (page === "adm-verify" ? " active" : "")} id="adm-verify">
        <VerifyPage active={page === "adm-verify"} />
      </section>

      <section className={"adm-page" + (page === "adm-payouts" ? " active" : "")} id="adm-payouts">
        <PayoutsPage active={page === "adm-payouts"} />
      </section>

      <section className={"adm-page" + (page === "adm-users" ? " active" : "")} id="adm-users">
        <UsersPage active={page === "adm-users"} />
      </section>

      <section className={"adm-page" + (page === "adm-products" ? " active" : "")} id="adm-products">
        <ProductsPage active={page === "adm-products"} />
      </section>

      <section className={"adm-page" + (page === "adm-employees" ? " active" : "")} id="adm-employees">
        <EmployeesPage active={page === "adm-employees"} />
      </section>

      <BottomNav page={page} onGo={goTo} />
    </div>
  );
}

const CAIRO_FONT = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap";

/** The Home page is set in Cairo. The stylesheet used to pull this in with an
    @import inside the injected <style>; a bundled CSS file can't inline a
    remote URL, so it is attached here instead — same moment, same effect. */
function useCairoFont() {
  useEffect(() => {
    if (document.querySelector(`link[data-lateen-font="cairo"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CAIRO_FONT;
    link.setAttribute("data-lateen-font", "cairo");
    document.head.appendChild(link);
  }, []);
}

export function AdminDashboardApp({ userId }: { userId: string }) {
  useCairoFont();
  return (
    <div className="lateen-admin">
      <AdminDataProvider userId={userId}>
        <LightboxProvider>
          <Shell />
        </LightboxProvider>
      </AdminDataProvider>
    </div>
  );
}
