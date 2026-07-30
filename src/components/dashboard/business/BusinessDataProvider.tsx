import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createLateenApi } from "@/lib/lateen-api";
import { dbToOrder, dbToProduct } from "./lib/mappers";
import type { BusinessProfile, NotificationRow, Order, PendingActiveStub, Product } from "./lib/types";

export type LateenApi = ReturnType<typeof createLateenApi>;

type Ctx = {
  api: LateenApi;
  userId: string;
  products: Product[];
  orders: Order[];
  pendingActiveStubs: PendingActiveStub[];
  profile: BusinessProfile | null;
  notifications: NotificationRow[];
  reviews: Awaited<ReturnType<LateenApi["listBusinessReviews"]>>;
  frozen: boolean;
  loading: boolean;
  reloadProducts: () => Promise<void>;
  reloadOrders: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  reloadNotifications: () => Promise<void>;
  reloadReviews: () => Promise<void>;
};

const BusinessDataCtx = createContext<Ctx | null>(null);

export function useBusinessData(): Ctx {
  const v = useContext(BusinessDataCtx);
  if (!v) throw new Error("useBusinessData must be used inside BusinessDataProvider");
  return v;
}

export function BusinessDataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const api = useMemo(() => createLateenApi(userId), [userId]);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingActiveStubs, setPendingActiveStubs] = useState<PendingActiveStub[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [reviews, setReviews] = useState<Ctx["reviews"]>([]);
  const [loading, setLoading] = useState(true);

  // Orders are mapped against the current product list (for photo/name
  // fallbacks), exactly like the original dbToOrder did.
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

  const reloadProducts = useCallback(async () => {
    try {
      const rows = await api.listMyProducts();
      const mapped = (rows || []).map((r) => dbToProduct(r as Record<string, unknown>));
      productsRef.current = mapped;
      setProducts(mapped);
    } catch (e) {
      console.error("[Wasla] loadProducts", e);
    }
  }, [api]);

  const reloadOrders = useCallback(async () => {
    let rows: unknown[] = [];
    try {
      rows = (await api.listMyOrders()) as unknown[];
    } catch (e) {
      console.error("[Wasla] loadOrders fetch", e);
    }
    try {
      const mapped = (rows || [])
        .filter((r) => r && (r as Record<string, unknown>).business_id)
        .map((r) => dbToOrder(r as Record<string, unknown>, productsRef.current));
      mapped.sort((a, b) => b._updatedAt.getTime() - a._updatedAt.getTime());
      setOrders(mapped);
    } catch (e) {
      console.error("[Wasla] loadOrders map", e);
    }
    try {
      const stubs = await api.pendingActiveOrdersForBusiness();
      setPendingActiveStubs(
        (stubs || []).map((r) => ({
          marketerId: r.marketer_id,
          productId: r.product_id,
          _status: "pending",
          _createdAt: new Date(r.created_at),
        })),
      );
    } catch (e) {
      console.error("[Wasla] loadPendingActiveStubs", e);
    }
  }, [api]);

  const reloadProfile = useCallback(async () => {
    try {
      const p = (await api.getProfile()) as BusinessProfile;
      setProfile(p);
    } catch (e) {
      console.error("[Wasla] refreshProfile", e);
    }
  }, [api]);

  const reloadNotifications = useCallback(async () => {
    try {
      setNotifications(((await api.listNotifications()) || []) as unknown as NotificationRow[]);
    } catch (e) {
      console.error("[Wasla] listNotifications", e);
    }
  }, [api]);

  const reloadReviews = useCallback(async () => {
    try {
      setReviews((await api.listBusinessReviews()) || []);
    } catch (e) {
      console.error("[Wasla] listBusinessReviews", e);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reloadProducts();
        await reloadOrders();
        await reloadProfile();
        await reloadReviews();
        await reloadNotifications();
      } catch (e) {
        console.error("[Wasla] business boot", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadProducts, reloadOrders, reloadProfile, reloadReviews, reloadNotifications]);

  // Realtime — coalesce bursts into one refresh (same 180ms debounce as before).
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshSoon = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void reloadProducts().then(() => reloadOrders());
      }, 180);
    };
    unsubs.push(api.subscribe("my-products", refreshSoon));
    unsubs.push(api.subscribe("orders", refreshSoon));
    unsubs.push(api.subscribe("notifications", () => { void reloadNotifications(); }));
    unsubs.push(api.subscribe("business-reviews", () => { void reloadReviews(); }));
    return () => {
      if (timer) clearTimeout(timer);
      for (const u of unsubs) { try { u(); } catch { /* ignore */ } }
    };
  }, [api, reloadProducts, reloadOrders, reloadNotifications, reloadReviews]);

  // Re-render on language switch so all bilingual labels refresh.
  const [, forceLang] = useState(0);
  useEffect(() => {
    const h = () => forceLang((n) => n + 1);
    window.addEventListener("lateen-lang", h);
    return () => window.removeEventListener("lateen-lang", h);
  }, []);

  const frozen = !!profile?.frozen_at;
  useEffect(() => {
    try { document.body.classList.toggle("lateen-frozen", frozen); } catch { /* ignore */ }
    return () => { try { document.body.classList.remove("lateen-frozen"); } catch { /* ignore */ } };
  }, [frozen]);

  const value = useMemo<Ctx>(
    () => ({
      api, userId, products, orders, pendingActiveStubs, profile, notifications, reviews,
      frozen, loading,
      reloadProducts, reloadOrders, reloadProfile, reloadNotifications, reloadReviews,
    }),
    [api, userId, products, orders, pendingActiveStubs, profile, notifications, reviews, frozen, loading,
     reloadProducts, reloadOrders, reloadProfile, reloadNotifications, reloadReviews],
  );

  return <BusinessDataCtx.Provider value={value}>{children}</BusinessDataCtx.Provider>;
}
