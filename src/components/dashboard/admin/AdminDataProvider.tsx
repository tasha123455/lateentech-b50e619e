import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";

import { createLateenApi } from "@/lib/lateen-api";
import type {
  AdminMetrics, AdminProduct, AdminReport, AdminUser, DeletionRequest, Employee, HomeRaw,
  LateenApi, PayoutRequest, ReceiptOrder, VerifyMarketer,
} from "./lib/types";

type Ctx = {
  api: LateenApi;
  userId: string;

  metrics: AdminMetrics | null;
  homeRaw: HomeRaw | null;
  metricsError: string;

  verifyMarketers: VerifyMarketer[];
  payouts: PayoutRequest[];
  users: AdminUser[];
  products: AdminProduct[];
  reports: AdminReport[];
  deletionRequests: DeletionRequest[];
  employees: Employee[];

  /** True until a section's first load resolves — drives the "Loading…" row. */
  loading: Record<string, boolean>;
  /** Set when a section's first load failed. */
  failed: Record<string, boolean>;

  loadMetrics: () => Promise<void>;
  loadVerify: () => Promise<void>;
  loadPayouts: () => Promise<void>;
  loadUsers: () => Promise<void>;
  loadProducts: (search: string) => Promise<void>;
  loadReports: () => Promise<void>;
  loadDeletionRequests: () => Promise<void>;
  loadEmployees: (search: string) => Promise<void>;
};

const AdminDataCtx = createContext<Ctx | null>(null);

export function useAdminData(): Ctx {
  const v = useContext(AdminDataCtx);
  if (!v) throw new Error("useAdminData must be used inside AdminDataProvider");
  return v;
}

export function AdminDataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const api = useMemo(() => createLateenApi(userId), [userId]);
  const admin = api.admin;

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [homeRaw, setHomeRaw] = useState<HomeRaw | null>(null);
  const [metricsError, setMetricsError] = useState("");
  const [verifyMarketers, setVerifyMarketers] = useState<VerifyMarketer[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loading, setLoading] = useState<Record<string, boolean>>({
    verify: true, payouts: true, users: true, products: true, employees: true,
  });
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  // "Loading…" only shows the very first time a section is opened; later
  // refreshes swap the data in place, exactly like the old anti-flicker guard.
  const settle = useCallback((key: string, ok: boolean) => {
    setLoading((prev) => (prev[key] === false ? prev : { ...prev, [key]: false }));
    setFailed((prev) => {
      const next = !ok;
      if (!!prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const m = (await admin.getMetrics()) as AdminMetrics;
      setMetrics(m);
      setHomeRaw({
        orders: m.orders || [],
        profiles: m.profiles || [],
        products: m.products || [],
        employeePayments: m.employeePayments || [],
      });
      setMetricsError("");
    } catch (e) {
      console.error("[admin] metrics", e);
      setMetricsError("Failed to load: " + ((e as Error)?.message || "unknown error"));
    }
  }, [admin]);

  const loadVerify = useCallback(async () => {
    try {
      const [pending, history] = (await Promise.all([
        admin.listPendingReceipts(),
        admin.listReceiptHistory(),
      ])) as unknown as [ReceiptOrder[], ReceiptOrder[]];

      // Group both buckets under the marketer who submitted them.
      const byMkt = new Map<string, VerifyMarketer>();
      const addTo = (o: ReceiptOrder, bucket: "pending" | "history") => {
        const mid = o.marketer_id;
        if (!byMkt.has(mid)) {
          byMkt.set(mid, {
            id: mid,
            name: (o.marketer && o.marketer.full_name) || "Unknown marketer",
            phone: (o.marketer && o.marketer.phone) || "",
            email: (o.marketer && o.marketer.email) || "",
            avatar_signed_url: (o.marketer && o.marketer.avatar_signed_url) || null,
            pending: [],
            history: [],
          });
        }
        byMkt.get(mid)![bucket].push(o);
      };
      pending.forEach((o) => addTo(o, "pending"));
      history.forEach((o) => addTo(o, "history"));

      setVerifyMarketers([...byMkt.values()].sort((a, b) => b.pending.length - a.pending.length));
      settle("verify", true);
    } catch (e) {
      console.error("[admin] verify", e);
      settle("verify", false);
    }
  }, [admin, settle]);

  const loadPayouts = useCallback(async () => {
    try {
      setPayouts((await admin.listPayoutRequests()) as unknown as PayoutRequest[]);
      settle("payouts", true);
    } catch (e) {
      console.error("[admin] payouts", e);
      settle("payouts", false);
    }
  }, [admin, settle]);

  const loadUsers = useCallback(async () => {
    try {
      // Emails resolve after the profile query, so searching happens
      // client-side over the full list — that's what makes email search work.
      setUsers((await admin.listAllUsers("")) as AdminUser[]);
      settle("users", true);
    } catch (e) {
      console.error("[admin] users", e);
      settle("users", false);
    }
  }, [admin, settle]);

  const loadProducts = useCallback(async (search: string) => {
    try {
      setProducts((await admin.listAllProducts(search)) as AdminProduct[]);
      settle("products", true);
    } catch (e) {
      console.error("[admin] products", e);
      settle("products", false);
    }
  }, [admin, settle]);

  const loadReports = useCallback(async () => {
    try {
      setReports((await admin.listReports()) as AdminReport[]);
    } catch (e) {
      console.error("[admin] listReports", e);
    }
  }, [admin]);

  const loadDeletionRequests = useCallback(async () => {
    try {
      setDeletionRequests((await admin.listDeletionRequests()) as DeletionRequest[]);
    } catch (e) {
      console.error("[admin] listDeletionRequests", e);
    }
  }, [admin]);

  const loadEmployees = useCallback(async (search: string) => {
    try {
      setEmployees((await admin.listEmployees(search)) as Employee[]);
      settle("employees", true);
    } catch (e) {
      console.error("[admin] employees", e);
      settle("employees", false);
    }
  }, [admin, settle]);

  /* ── Boot ──
     Employees load up front, unlike the other lazy pages: the badge on the nav
     and on the menu entry counts who can be paid right now, and a badge that
     only appears once you have already opened the page is no use. */
  useEffect(() => {
    void loadMetrics();
    void loadReports();
    void loadDeletionRequests();
    void loadEmployees("");
    void loadVerify();
    void loadPayouts();
  }, [loadMetrics, loadReports, loadDeletionRequests, loadEmployees, loadVerify, loadPayouts]);

  /* ── Realtime + payout polling ──
     Payouts move without any action on this screen (a marketer requesting,
     a wallet changing), so they poll while that page is open. */
  const payoutsOpenRef = useRef(false);
  useEffect(() => {
    if (!api.subscribe) return;
    const unsubs: Array<() => void> = [];
    /* Not gated on the page being open any more: the nav slot badges this
       number from launch, so a stale one is visibly wrong. The gate stays on
       the ten-second poll below, which is the expensive half. */
    const refreshPayouts = () => { void loadPayouts(); };
    unsubs.push(api.subscribe("admin-wallets", refreshPayouts));
    unsubs.push(api.subscribe("admin-payouts", refreshPayouts));
    unsubs.push(api.subscribe("admin-reports", () => { void loadReports(); }));
    unsubs.push(api.subscribe("admin-deletion-requests", () => { void loadDeletionRequests(); }));
    return () => {
      for (const u of unsubs) {
        try { u(); } catch { /* ignore */ }
      }
    };
  }, [api, loadPayouts, loadReports, loadDeletionRequests]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (payoutsOpenRef.current) void loadPayouts();
    }, 10000);
    return () => clearInterval(iv);
  }, [loadPayouts]);

  // The payouts page flips this so the poll and realtime handlers stay cheap.
  const value = useMemo<Ctx>(
    () => ({
      api, userId,
      metrics, homeRaw, metricsError,
      verifyMarketers, payouts, users, products, reports, deletionRequests, employees,
      loading, failed,
      loadMetrics, loadVerify, loadPayouts, loadUsers, loadProducts, loadReports,
      loadDeletionRequests, loadEmployees,
    }),
    [
      api, userId, metrics, homeRaw, metricsError, verifyMarketers, payouts, users, products,
      reports, deletionRequests, employees, loading, failed,
      loadMetrics, loadVerify, loadPayouts, loadUsers, loadProducts, loadReports,
      loadDeletionRequests, loadEmployees,
    ],
  );

  return (
    <AdminDataCtx.Provider value={value}>
      <PayoutsOpenCtx.Provider value={payoutsOpenRef}>{children}</PayoutsOpenCtx.Provider>
    </AdminDataCtx.Provider>
  );
}

const PayoutsOpenCtx = createContext<{ current: boolean } | null>(null);

/** Lets the Payouts page mark itself visible so polling only runs there. */
export function usePayoutsOpenRef() {
  const v = useContext(PayoutsOpenCtx);
  if (!v) throw new Error("usePayoutsOpenRef must be used inside AdminDataProvider");
  return v;
}
