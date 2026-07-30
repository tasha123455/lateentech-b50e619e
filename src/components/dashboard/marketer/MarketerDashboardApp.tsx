import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthContext";
import "@/styles/lateen-marketer.css";
import "@/styles/marketer-dashboard.css";

import { MarketerDataProvider, useMarketerData } from "./MarketerDataProvider";
import { BrowsePage } from "./browse/BrowsePage";
import { ProductDetailOverlay } from "./browse/ProductDetailOverlay";
import { HomePage } from "./home/HomePage";
import { readPage, readScroll, writePage, writeScroll } from "./lib/storage";
import type { MarketerOrder, PageId } from "./lib/types";
import { NotificationsPage } from "./notifications/NotificationsPage";
import { DepositInfoOverlay, type CodInfo } from "./orders/DepositInfoOverlay";
import { InstructionsOverlay } from "./orders/InstructionsOverlay";
import { OrderFormOverlay, type OrderFormSeed } from "./orders/OrderFormOverlay";
import { PayDetailsOverlay } from "./orders/PayDetailsOverlay";
import { OrdersPage } from "./orders/OrdersPage";
import { useReceiptUpload } from "./orders/useReceiptUpload";
import { MenuDrawer } from "./overlays/MenuDrawer";
import { ProfileOverlay } from "./overlays/ProfileOverlay";
import { AffiliateSoonOverlay, BrowseSoonOverlay, PointsSoonOverlay, SupportOverlay } from "./overlays/SoonOverlays";
import { WithdrawOverlay } from "./overlays/WithdrawOverlay";
import { usePayoutForm } from "./overlays/usePayoutForm";
import { SavedPage } from "./saved/SavedPage";
import { BottomNav } from "./ui/BottomNav";
import { PhotoLightboxProvider } from "./ui/PhotoLightbox";

function Shell({ initialProduct }: { initialProduct?: string }) {
  const {
    userId, profile, notifications, markNotificationsRead, blockIfFrozen, products,
  } = useMarketerData();
  const { signOut } = useAuth();

  const [page, setPage] = useState<PageId>(() => readPage(userId) || "pg-home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [browseSoon, setBrowseSoon] = useState(false);
  const [affSoon, setAffSoon] = useState(false);
  const [pointsSoon, setPointsSoon] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formSeed, setFormSeed] = useState<OrderFormSeed | null>(null);
  const [payDetailsOpen, setPayDetailsOpen] = useState(false);
  const [depositInfo, setDepositInfo] = useState<{ open: boolean; cod: CodInfo }>({ open: false, cod: null });
  const [instrOrder, setInstrOrder] = useState<MarketerOrder | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const payoutForm = usePayoutForm(userId, profile);
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const openForm = useCallback(
    (order: MarketerOrder | null, receiptUrl?: string) => {
      if (blockIfFrozen()) return;
      setFormSeed({ order, receiptUrl });
      setFormOpen(true);
    },
    [blockIfFrozen],
  );

  const { uploadReceipt, uploadingId } = useReceiptUpload(openForm);

  /* ── Navigation ──
     Leaving the notifications page is what marks everything read, exactly as
     the old goTo() wrapper did. */
  const goTo = useCallback(
    (id: PageId) => {
      setPage((prev) => {
        if (prev === "pg-notif" && id !== "pg-notif") void markNotificationsRead();
        return id;
      });
      writePage(id, userId);
    },
    [markNotificationsRead, userId],
  );

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
    const onScroll = () => {
      if (restoringRef.current) return;
      writeScroll(window.scrollY || 0, userId);
    };
    const flush = () => {
      if (restoringRef.current) return;
      writeScroll(window.scrollY || 0, userId);
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);

  /* Deep link from /p/:id — wait for the product to load, then open it. */
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (!initialProduct || deepLinkedRef.current) return;
    if (!products.some((p) => p.id === initialProduct)) return;
    deepLinkedRef.current = true;
    goTo("pg-browse");
    setDetailId(initialProduct);
  }, [initialProduct, products, goTo]);

  /* The account-frozen flag dims the whole surface, same as before. */
  const frozen = !!profile?.frozen_at;
  useEffect(() => {
    try { document.body.classList.toggle("lateen-frozen", frozen); } catch { /* ignore */ }
    return () => { try { document.body.classList.remove("lateen-frozen"); } catch { /* ignore */ } };
  }, [frozen]);

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
    <>
      <div style={{ position: "relative", maxWidth: 420, margin: "0 auto", minHeight: 860, overflow: "hidden", background: "#141414" }}>
        <div className="app">
          <div className={"page" + (page === "pg-home" ? " active" : "")} id="pg-home">
            <HomePage
              onOpenNotifications={() => goTo("pg-notif")}
              onOpenProfile={() => setProfileOpen(true)}
              onOpenSupport={() => setSupportOpen(true)}
              onOpenWithdraw={() => { if (!blockIfFrozen()) setWithdrawOpen(true); }}
              unreadCount={unreadCount}
            />
          </div>

          <div className={"page" + (page === "pg-browse" ? " active" : "")} id="pg-browse">
            <BrowsePage onOpenProduct={setDetailId} onOpenSoon={() => setBrowseSoon(true)} />
          </div>

          <div className={"page" + (page === "pg-saved" ? " active" : "")} id="pg-saved">
            <SavedPage onOpenProduct={setDetailId} />
          </div>

          <div className={"page orders-pg" + (page === "pg-orders" ? " active" : "")} id="pg-orders">
            <OrdersPage
              onAddOrder={() => openForm(null)}
              onEditOrder={(o) => openForm(o)}
              onOpenSaved={() => goTo("pg-saved")}
              onHowTo={setInstrOrder}
              onUploadReceipt={uploadReceipt}
              uploadingId={uploadingId}
            />
          </div>

          <div className={"page" + (page === "pg-notif" ? " active" : "")} id="pg-notif">
            <NotificationsPage onBack={() => goTo("pg-home")} />
          </div>
        </div>

        <BottomNav page={page} onGo={goTo} onMenu={() => setMenuOpen(true)} />
      </div>

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenProfile={() => { setMenuOpen(false); setProfileOpen(true); }}
        onOpenPointsSoon={() => setPointsSoon(true)}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
      <ProfileOverlay
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        fields={payoutForm.fields}
        set={payoutForm.set}
      />
      <SupportOverlay open={supportOpen} onClose={() => setSupportOpen(false)} />
      <WithdrawOverlay
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        fields={payoutForm.fields}
        set={payoutForm.set}
        persist={payoutForm.persist}
      />

      <ProductDetailOverlay
        productId={detailId}
        onClose={() => setDetailId(null)}
        onOpenAffSoon={() => setAffSoon(true)}
      />
      <BrowseSoonOverlay open={browseSoon} onClose={() => setBrowseSoon(false)} />
      <AffiliateSoonOverlay open={affSoon} onClose={() => setAffSoon(false)} />
      <PointsSoonOverlay open={pointsSoon} onClose={() => setPointsSoon(false)} />

      <OrderFormOverlay
        open={formOpen}
        seed={formSeed}
        onClose={() => setFormOpen(false)}
        onOpenPayDetails={() => setPayDetailsOpen(true)}
        onOpenDepositInfo={(cod) => setDepositInfo({ open: true, cod })}
        onSubmitted={() => setFormSeed(null)}
      />
      <PayDetailsOverlay open={payDetailsOpen} onClose={() => setPayDetailsOpen(false)} />
      <DepositInfoOverlay
        open={depositInfo.open}
        cod={depositInfo.cod}
        onClose={() => setDepositInfo({ open: false, cod: null })}
      />
      <InstructionsOverlay
        order={instrOrder}
        onClose={() => setInstrOrder(null)}
        onUpload={() => {
          const o = instrOrder;
          setInstrOrder(null);
          if (o) uploadReceipt(o.id);
        }}
        onOpenDepositInfo={() => {
          const o = instrOrder;
          setDepositInfo({
            open: true,
            cod: o
              ? {
                  pays: Math.max(
                    0,
                    parseFloat(
                      (
                        o.price * (o.qty || 1) + (Number(o.delivery) || 0) + (Number(o.shipping) || 0) -
                        ((o.commPerUnit || 0) + (o.platformPerUnit || 0)) * (o.qty || 1)
                      ).toFixed(2),
                    ),
                  ),
                  sym: o._sym || "$",
                  code: o._curCode || "",
                  delivery: Number(o.delivery) || 0,
                  shipping: Number(o.shipping) || 0,
                }
              : null,
          });
        }}
      />
    </>
  );
}

export function MarketerDashboardApp({ userId, prod }: { userId: string; prod?: string }) {
  return (
    <div className="lateen-marketer relative">
      <MarketerDataProvider userId={userId}>
        <PhotoLightboxProvider>
          <Shell initialProduct={prod} />
        </PhotoLightboxProvider>
      </MarketerDataProvider>
    </div>
  );
}
