import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";

import { createLateenApi } from "@/lib/lateen-api";
import type {
  AdminMetrics, AdminProduct, AdminReport, AdminUser, ChangeRequest,
  DeletionRequest, Employee, HomeRaw,
  LateenApi, PayoutRequest, ReceiptOrder, VerifyMarketer,
} from "./lib/types";

/** What this admin is allowed to see. Loaded once, from the database, which
 *  is also where it is enforced — this copy only decides what to draw. */
export type AdminAccess = {
  isMaster: boolean;
  pages: string[];
  /** null means every market. */
  markets: string[] | null;
};

type Ctx = {
  api: LateenApi;
  userId: string;
  access: AdminAccess;
  /** Which market the Analytics page is showing. Null is every market. */
  metricsMarket: string | null;
  setMetricsMarket: (code: string | null) => void;
  /** True until the answer has come back, so nothing flashes into view and
   *  then disappears once the real permissions arrive. */
  accessLoading: boolean;

  metrics: AdminMetrics | null;
  homeRaw: HomeRaw | null;
  metricsError: string;

  verifyMarketers: VerifyMarketer[];
  payouts: PayoutRequest[];
  users: AdminUser[];
  products: AdminProduct[];
  reports: AdminReport[];
  deletionRequests: DeletionRequest[];
  changeRequests: ChangeRequest[];
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
  loadChangeRequests: () => Promise<void>;
  loadEmployees: (search: string) => Promise<void>;
};

const AdminDataCtx = createContext<Ctx | null>(null);

export function useAdminData(): Ctx {
  const v = useContext(AdminDataCtx);
  if (!v) throw new Error("useAdminData must be used inside AdminDataProvider");
  return v;
}

/* What this console was allowed the last time it was opened, kept per account.
 *
 * Never a permission — the database decides that, refuses the work regardless,
 * and filters every list on its own side. This exists so that an admin who has
 * been here before opens on a page instead of on an empty screen while a query
 * that has already been answered once is answered again.
 *
 * Keyed by account so one person's console can never open on another's. Any
 * shape that is not what was written is ignored rather than trusted.
 *
 * Deliberately named outside the prefixes that user-scope.ts purges on sign-out.
 * That purge exists so nothing personal survives for the next account, and this
 * key honours it by being unreadable to any other account — while surviving the
 * one thing that matters here, which is signing out and back in. Purging it
 * would put the wait back on exactly the visit this is meant to fix, since an
 * admin arriving through Google has just signed in. It holds a list of page
 * names and nothing else: no customer, no money, no name. */
const ACCESS_KEY = (uid: string) => `wasla_admin_access_${uid}`;

function rememberedAccess(uid: string): AdminAccess | null {
  try {
    if (typeof window === "undefined" || !uid) return null;
    const raw = window.localStorage.getItem(ACCESS_KEY(uid));
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<AdminAccess>;
    if (typeof a.isMaster !== "boolean" || !Array.isArray(a.pages)) return null;
    return {
      isMaster: a.isMaster,
      pages: a.pages.filter((p): p is string => typeof p === "string"),
      markets: Array.isArray(a.markets) ? a.markets.filter((m): m is string => typeof m === "string") : null,
    };
  } catch {
    return null;
  }
}

function rememberAccess(uid: string, a: AdminAccess): void {
  try {
    if (typeof window === "undefined" || !uid) return;
    window.localStorage.setItem(ACCESS_KEY(uid), JSON.stringify(a));
  } catch { /* storage full or turned off — the console simply waits next time */ }
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
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
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

  /* Which market the Analytics page is showing. Null is every market, and is
     what a single-country platform always sees. */
  const [metricsMarket, setMetricsMarket] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const m = (await admin.getMetrics(metricsMarket)) as AdminMetrics;
      setMetrics(m);
      setHomeRaw({ days: m.days || [] });
      setMetricsError("");
    } catch (e) {
      console.error("[admin] metrics", e);
      setMetricsError("Failed to load: " + ((e as Error)?.message || "unknown error"));
    }
  }, [admin, metricsMarket]);

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

  const loadChangeRequests = useCallback(async () => {
    try {
      setChangeRequests((await admin.listChangeRequests()) as ChangeRequest[]);
    } catch (e) {
      console.error("[admin] listChangeRequests", e);
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
    void loadChangeRequests();
    void loadEmployees("");
    void loadVerify();
    void loadPayouts();
  }, [loadMetrics, loadReports, loadDeletionRequests, loadChangeRequests, loadEmployees, loadVerify, loadPayouts]);

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
    unsubs.push(api.subscribe("admin-change-requests", () => { void loadChangeRequests(); }));
    return () => {
      for (const u of unsubs) {
        try { u(); } catch { /* ignore */ }
      }
    };
  }, [api, loadPayouts, loadReports, loadDeletionRequests, loadChangeRequests]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (payoutsOpenRef.current) void loadPayouts();
    }, 10000);
    return () => clearInterval(iv);
  }, [loadPayouts]);

  /* Assume nothing until the database answers. Starting from "master" would
     flash the whole console at somebody who is only allowed one page of it.

     But "nothing" was its own problem: the console had no page it was allowed
     to draw, so an admin signing in watched an empty screen for as long as one
     query took. Waiting on an answer this console was given the last time it
     opened is a wait for something already known.

     So the last answer is kept, per account, and used to open on. The fresh
     one replaces it the moment it lands — within the same second, and before
     anything can be done with the console. Nothing here is a permission: the
     database refuses the work regardless of what this says, and every list is
     filtered there too. This only decides which page is drawn first. */
  const [access, setAccess] = useState<AdminAccess>(() => rememberedAccess(userId) ?? { isMaster: false, pages: [], markets: null });
  const [accessLoading, setAccessLoading] = useState(() => rememberedAccess(userId) === null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await api.admin.myAdminAccess();
        if (!alive) return;
        const fresh = { isMaster: a.isMaster, pages: a.pages, markets: a.markets };
        setAccess(fresh);
        rememberAccess(userId, fresh);
      } catch (e) {
        console.error("[admin] access", e);
      } finally {
        if (alive) setAccessLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [api, userId]);

  // The payouts page flips this so the poll and realtime handlers stay cheap.
  const value = useMemo<Ctx>(
    () => ({
      api, userId, access, accessLoading,
      metricsMarket, setMetricsMarket,
      metrics, homeRaw, metricsError,
      verifyMarketers, payouts, users, products, reports, deletionRequests, changeRequests, employees,
      loading, failed,
      loadMetrics, loadVerify, loadPayouts, loadUsers, loadProducts, loadReports, loadChangeRequests,
      loadDeletionRequests, loadEmployees,
    }),
    [
      api, userId, access, accessLoading, metricsMarket, metrics, homeRaw, metricsError, verifyMarketers, payouts, users, products,
      reports, deletionRequests, changeRequests, employees, loading, failed,
      loadMetrics, loadVerify, loadPayouts, loadUsers, loadProducts, loadReports, loadChangeRequests,
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
