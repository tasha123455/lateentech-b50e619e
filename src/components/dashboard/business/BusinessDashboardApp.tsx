import { useState } from "react";

import "@/styles/business-dashboard.css";
import { BusinessDataProvider } from "./BusinessDataProvider";
import { LightboxProvider } from "./ui/Lightbox";
import { HomePage } from "./home/HomePage";
import { ProductsPage } from "./products/ProductsPage";
import { ProductFormOverlay } from "./products/ProductFormOverlay";
import { OrdersPage } from "./orders/OrdersPage";
import { NotificationsPage } from "./notifications/NotificationsPage";
import { MenuDrawer } from "./overlays/MenuDrawer";
import { ProfileOverlay } from "./overlays/ProfileOverlay";
import { SupportOverlay } from "./overlays/SupportOverlay";
import { DeleteAccountOverlay } from "./overlays/DeleteAccountOverlay";
import { PayoutOverlay } from "./overlays/PayoutOverlay";
import { BottomNav, type BizTab } from "./ui/BottomNav";
import type { Product } from "./lib/types";

function Shell() {
  const [tab, setTab] = useState<BizTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [delAccOpen, setDelAccOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const openForm = (p: Product | null) => { setEditing(p); setFormOpen(true); };

  return (
    <>
      <div className="app">
        <div className={"page" + (tab === "home" ? " active" : "")} id="pg-home">
          <HomePage onOpenNotifications={() => setTab("notif")} onOpenPayout={() => setPayoutOpen(true)} />
        </div>
        <div className={"page" + (tab === "products" ? " active" : "")} id="pg-products">
          <ProductsPage
            onAddProduct={() => openForm(null)}
            onEditProduct={(p) => openForm(p)}
            onOpenNotifications={() => setTab("notif")}
          />
        </div>
        <div className={"page" + (tab === "orders" ? " active" : "")} id="pg-orders">
          <OrdersPage onOpenNotifications={() => setTab("notif")} />
        </div>
        <div className={"page" + (tab === "notif" ? " active" : "")} id="pg-notif">
          <NotificationsPage active={tab === "notif"} onBack={() => setTab("home")} />
        </div>
      </div>

      <BottomNav tab={tab} onTab={setTab} onMenu={() => setMenuOpen(true)} />

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSupport={() => setSupportOpen(true)}
        onOpenDeleteAccount={() => setDelAccOpen(true)}
      />
      <ProfileOverlay open={profileOpen} onClose={() => setProfileOpen(false)} />
      <SupportOverlay open={supportOpen} onClose={() => setSupportOpen(false)} />
      <DeleteAccountOverlay open={delAccOpen} onClose={() => setDelAccOpen(false)} />
      <PayoutOverlay open={payoutOpen} onClose={() => setPayoutOpen(false)} />
      <ProductFormOverlay open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </>
  );
}

export function BusinessDashboardApp({ userId }: { userId: string }) {
  return (
    <div className="lateen-business">
      <BusinessDataProvider userId={userId}>
        <LightboxProvider>
          <Shell />
        </LightboxProvider>
      </BusinessDataProvider>
    </div>
  );
}
