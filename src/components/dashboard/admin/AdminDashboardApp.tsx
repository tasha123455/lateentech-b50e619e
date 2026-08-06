import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthContext";
import { LateenLogo } from "@/components/brand/LateenLogo";
import "@/styles/lateen-admin.css";
import "@/styles/admin-dashboard.css";

import { AdminDataProvider, useAdminData } from "./AdminDataProvider";
import { EmployeesPage } from "./employees/EmployeesPage";
import { MenuDrawer, useAdminCounts } from "./overlays/MenuDrawer";
import { NotificationsPage } from "./overlays/NotificationsPage";
import { HomePage } from "./home/HomePage";
import { readPage, readScroll, writePage, writeScroll } from "./lib/storage";
import { RequestsPage } from "./requests/RequestsPage";
import type { AdminPageId } from "./lib/types";
import { MoneyPage } from "./money/MoneyPage";
import { ProductDetailOverlay } from "./products/ProductDetailOverlay";
import { ProductsPage } from "./products/ProductsPage";
import { BottomNav } from "./ui/BottomNav";
import { LightboxProvider } from "./ui/Lightbox";
import { UsersPage } from "./users/UsersPage";
import { AdminsPage } from "./admins/AdminsPage";
import { canOpen, firstAllowed } from "./lib/access";

/* Reached from the drawer, or — for notifications — from the Users page. */
const MENU_PAGES = new Set<AdminPageId>(["adm-employees", "adm-products", "adm-notify", "adm-admins"]);

function Shell() {
  const { userId, loadMetrics, access, accessLoading } = useAdminData();
  const counts = useAdminCounts();
  const { signOut } = useAuth();

  /* The page this admin left off on, or nothing if they have never been here.
     Read once: what matters is whether there was one when the console opened,
     not what it becomes afterwards. */
  const remembered = useRef<AdminPageId | null>(readPage(userId));
  const [page, setPage] = useState<AdminPageId>(() => remembered.current || "adm-home");
  const [signingOut, setSigningOut] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  // The menu pages sit outside the nav bar, so remember where to go back to.
  const [returnTo, setReturnTo] = useState<AdminPageId>("adm-home");
  const [detailFromReport, setDetailFromReport] = useState<string | null>(null);

  const openFromMenu = (id: AdminPageId) => {
    setMenuOpen(false);
    setReturnTo((cur) => (MENU_PAGES.has(page) ? cur : page));
    goTo(id);
  };

  const goTo = useCallback(
    (id: AdminPageId) => {
      setPage(id);
      writePage(id, userId);
    },
    [userId],
  );

  /* A page is remembered across sessions, so an admin whose permissions were
     narrowed can come back to one they may no longer open. Move them to the
     first page they are allowed — the data behind the old one would not load
     for them anyway, because the database refuses it. */
  useEffect(() => {
    if (accessLoading) return;
    const allowed = firstAllowed(access, page);
    if (allowed !== page) goTo(allowed);
  }, [accessLoading, access, page, goTo]);

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

  /* An admin may be allowed only some of these pages, and which ones is a
     question for the database. An admin arriving for the first time therefore
     had the analytics home drawn in full — and its figures fetched — before
     the answer came back and moved them to the page that is actually theirs.
     That was the flicker on a new admin's first visit.

     So: with a remembered page there is nothing to wait for, because it was
     allowed the last time they used it. Without one, wait. What shows in the
     meantime is the console's own background, for as long as one query takes,
     rather than a page belonging to somebody else. */
  const settled = !accessLoading || remembered.current !== null;
  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";

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

  /* Only reachable on a console that has never been opened by this account on
     this phone; every later visit knows its pages before it draws. An empty
     background was what this used to be, and an empty screen for a second
     reads as an app that has failed rather than one that is asking. */
  if (!settled) {
    return (
      <div className="adm-app adm-waiting" data-no-i18n>
        <LateenLogo variant="mark" size={92} glow />
        <div className="adm-waiting-text">{ar ? "جارٍ فتح لوحة التحكم…" : "Opening the console…"}</div>
      </div>
    );
  }

  return (
    <div className="adm-app">
      {/* Only the analytics page carries the header — the other pages have
          their own title row and don't need it repeated. */}
      {page === "adm-home" && (
        <div className="adm-topbar">
          <div className="adm-tl">
            <div className="adm-avatar">A</div>
            <div>
              <div className="adm-greet">Admin Console</div>
              <div className="adm-greet-sub">Wasla platform control</div>
            </div>
          </div>
          <span className="adm-badge">Admin</span>
        </div>
      )}

      <section className={"adm-page" + (page === "adm-home" ? " active" : "")} id="adm-home">
        <HomePage />
      </section>

      <section className={"adm-page" + (page === "adm-money" ? " active" : "")} id="adm-money">
        <MoneyPage active={page === "adm-money"} />
      </section>

      <section className={"adm-page" + (page === "adm-users" ? " active" : "")} id="adm-users">
        <UsersPage active={page === "adm-users"} onNotify={() => openFromMenu("adm-notify")} />
      </section>

      <section className={"adm-page" + (page === "adm-products" ? " active" : "")} id="adm-products">
        <ProductsPage active={page === "adm-products"} onBack={() => goTo(returnTo)} />
      </section>

      <section className={"adm-page" + (page === "adm-employees" ? " active" : "")} id="adm-employees">
        <EmployeesPage active={page === "adm-employees"} onBack={() => goTo(returnTo)} />
      </section>

      <section className={"adm-page" + (page === "adm-requests" ? " active" : "")} id="adm-requests">
        <RequestsPage active={page === "adm-requests"} onOpenProduct={setDetailFromReport} />
        <ProductDetailOverlay productId={detailFromReport} onClose={() => setDetailFromReport(null)} />
      </section>

      <section className={"adm-page" + (page === "adm-notify" ? " active" : "")} id="adm-notify">
        {page === "adm-notify" && <NotificationsPage onBack={() => goTo(returnTo)} />}
      </section>

      <section className={"adm-page" + (page === "adm-admins" ? " active" : "")} id="adm-admins">
        {page === "adm-admins" && access.isMaster && <AdminsPage onBack={() => goTo(returnTo)} />}
      </section>

      <BottomNav
        page={page}
        onGo={goTo}
        onMenu={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen || MENU_PAGES.has(page)}
        menuCount={counts.menuTotal}
        counts={{ "adm-money": counts.money, "adm-requests": counts.requests }}
        allow={(id) => canOpen(access, id)}
      />

      <MenuDrawer
        open={menuOpen}
        signingOut={signingOut}
        onSignOut={onSignOut}
        onClose={() => setMenuOpen(false)}
        onProducts={() => openFromMenu("adm-products")}
        onEmployees={() => openFromMenu("adm-employees")}
        onAdmins={access.isMaster ? () => openFromMenu("adm-admins") : undefined}
      />
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
