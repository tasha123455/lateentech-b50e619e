import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";

import { createLateenApi } from "@/lib/lateen-api";
import { computeAnalytics, type Analytics } from "./lib/analytics";
import { MIN_WITHDRAW, PAYOUT_PERIOD_MS } from "./lib/constants";
import { isAr, t } from "./lib/format";
import { buildProductsMap, dbToBrowse, dbToOrder } from "./lib/mappers";
import { marketSymbol } from "@/lib/markets/symbol";
import {
  cacheAvatar, cacheWalletBalance, loadDrafts, readAvatar, readWalletBalance, saveDrafts,
} from "./lib/storage";
import type {
  BrowseProduct, FormProduct, LateenApi, MarketerOrder, MarketerProfile, NotificationRow,
} from "./lib/types";

export type PayoutState = {
  statusText: string;
  /** Renders with the hourglass prefix when a request is already queued. */
  pending: boolean;
  canWithdraw: boolean;
  frozen: boolean;
  /** Commission on delivered orders — the part that can be withdrawn. */
  balance: number;
  /** Commission on orders still in progress. Visible to the marketer so the
   *  wallet still shows everything they have earned, but not withdrawable
   *  until the order is delivered. */
  onTheWay: number;
};

type Ctx = {
  api: LateenApi;
  userId: string;

  products: BrowseProduct[];
  productsMap: Record<string, FormProduct>;
  favOrder: string[];
  orders: MarketerOrder[];
  profile: MarketerProfile | null;
  notifications: NotificationRow[];
  /** Ids that still show an unread dot; cleared when leaving the page. */
  newNotifIds: Set<string>;
  avatarUrl: string;

  analytics: Analytics;
  walletCur: string;
  setWalletCur: (c: string) => void;
  walletBalance: number;
  payout: PayoutState;

  frozen: boolean;
  /** Alerts and returns true when the account is frozen, blocking the action. */
  blockIfFrozen: () => boolean;

  toggleFavorite: (id: string) => Promise<void>;
  setOrders: (updater: (prev: MarketerOrder[]) => MarketerOrder[]) => void;
  markNotificationsRead: () => Promise<void>;

  reloadBrowse: () => Promise<void>;
  reloadOrders: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  reloadNotifications: () => Promise<void>;
  /** Resolves with the freshly computed state, so callers acting on it right
      after a refresh don't read a stale render-time value. */
  refreshWalletAndPayout: () => Promise<PayoutState>;

  /** Bumped on every language switch so bilingual labels re-render. */
  langTick: number;
};

const MarketerDataCtx = createContext<Ctx | null>(null);

export function useMarketerData(): Ctx {
  const v = useContext(MarketerDataCtx);
  if (!v) throw new Error("useMarketerData must be used inside MarketerDataProvider");
  return v;
}

export function MarketerDataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const api = useMemo(() => createLateenApi(userId), [userId]);

  const [products, setProducts] = useState<BrowseProduct[]>([]);
  const [favOrder, setFavOrder] = useState<string[]>([]);
  const [orders, setOrdersState] = useState<MarketerOrder[]>(() => loadDrafts(userId));
  const [profile, setProfile] = useState<MarketerProfile | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [newNotifIds, setNewNotifIds] = useState<Set<string>>(new Set());
  const [avatarUrl, setAvatarUrl] = useState<string>(() => readAvatar(userId));
  const [walletCur, setWalletCurState] = useState<string>("");
  const [dbBalance, setDbBalance] = useState<number | null>(() => readWalletBalance(userId));
  const [payout, setPayout] = useState<PayoutState>({
    statusText: "", pending: false, canWithdraw: false, frozen: false, balance: 0, onTheWay: 0,
  });
  const [langTick, setLangTick] = useState(0);

  const productsMap = useMemo(() => buildProductsMap(products), [products]);
  const analytics = useMemo(() => computeAnalytics(orders), [orders]);

  // Reads used inside callbacks that must not re-subscribe on every change.
  const productsMapRef = useRef(productsMap);
  productsMapRef.current = productsMap;
  const analyticsRef = useRef(analytics);
  analyticsRef.current = analytics;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const keepClearedRef = useRef(false);
  const dbBalanceRef = useRef(dbBalance);
  dbBalanceRef.current = dbBalance;
  /** Bumped by every wallet refresh, so one that has been overtaken can tell. */
  const refreshSeqRef = useRef(0);

  /* ── Currency selection ──
     Defaults to the first currency the marketer has actually earned in. */
  const earnCodes = useMemo(() => Object.keys(analytics.earnByCur), [analytics.earnByCur]);
  const selectedCur = walletCur && analytics.earnByCur[walletCur] ? walletCur : earnCodes[0] || "LYD";
  useEffect(() => {
    if (walletCur !== selectedCur) setWalletCurState(selectedCur);
  }, [walletCur, selectedCur]);

  const curData = analytics.earnByCur[selectedCur] || { sym: marketSymbol(selectedCur), amount: 0 };
  const walletBalance = dbBalance == null ? Number(curData.amount || 0) : dbBalance;

  /* ── Loaders ── */

  const reloadBrowse = useCallback(async () => {
    try {
      let ids: string[];
      let set: Set<string>;
      if (api.listFavoriteIdsOrdered) {
        ids = await api.listFavoriteIdsOrdered();
        set = new Set(ids);
      } else {
        set = await api.listFavoriteIds();
        ids = [...set];
      }
      const rows = await api.listBrowse();
      setFavOrder(ids);
      setProducts(rows.map((r) => dbToBrowse(r as unknown as Record<string, unknown>, set)));
    } catch (e) {
      console.error("[Lateen] loadBrowse", e);
    }
  }, [api]);

  const reloadOrders = useCallback(async () => {
    const drafts = loadDrafts(userId);
    if (!api.listMyOrders) {
      setOrdersState(drafts);
      return;
    }
    try {
      const rows = await api.listMyOrders();
      const mine = (rows as Array<Record<string, unknown>>).filter((r) => r.marketer_id === userId);
      const sentDbIds = new Set(mine.map((r) => r.id as string));
      /* A receipt's storage path is a fresh uuid per upload, so a draft holding
         one that a sent order also holds *is* that order — a leftover from the
         duplicate-draft bug, still on the phone of anyone who hit it. Dropping
         it here clears those without needing a migration, and cannot catch a
         real draft: no two uploads ever share a path. */
      const sentReceipts = new Set(
        mine.map((r) => r.receipt_url as string).filter((u): u is string => !!u),
      );
      const kept = drafts.filter(
        (d) => (!d.dbId || !sentDbIds.has(d.dbId)) && !(d.receiptUrl && sentReceipts.has(d.receiptUrl)),
      );
      if (kept.length !== drafts.length) saveDrafts(kept, userId);
      const merged = [
        ...kept,
        ...mine.map((r) => dbToOrder(r, productsMapRef.current)),
      ];
      merged.sort((a, b) => {
        const at = (a._updatedAt instanceof Date ? a._updatedAt : new Date(a._updatedAt || 0)).getTime();
        const bt = (b._updatedAt instanceof Date ? b._updatedAt : new Date(b._updatedAt || 0)).getTime();
        return bt - at;
      });
      setOrdersState(merged);
    } catch (e) {
      console.error("[Lateen] loadOrders", e);
      setOrdersState((prev) => (prev.length ? prev : drafts));
    }
  }, [api, userId]);

  const reloadProfile = useCallback(async () => {
    if (!api.getProfile) return;
    try {
      const p = (await api.getProfile()) as MarketerProfile;
      setProfile(p);
      const av = (p && p.avatar_signed_url) || "";
      cacheAvatar(av, userId);
      setAvatarUrl(av);
    } catch (e) {
      console.error("[Lateen] profile", e);
    }
  }, [api, userId]);

  const reloadNotifications = useCallback(async () => {
    if (!api.listNotifications) return;
    try {
      const list = (await api.listNotifications()) as unknown as NotificationRow[];
      setNotifications(list || []);
      // Always reflect unread server state so the red dots show on first paint.
      if (!keepClearedRef.current) {
        setNewNotifIds(new Set((list || []).filter((n) => !n.read_at).map((n) => n.id)));
      }
    } catch {
      /* ignore */
    }
  }, [api]);

  const markNotificationsRead = useCallback(async () => {
    keepClearedRef.current = true;
    try {
      if (api.markNotificationsRead) await api.markNotificationsRead();
    } catch {
      /* ignore */
    }
    // Clear any OS-level notification badge too.
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const list = await reg.getNotifications();
        list.forEach((n) => n.close());
      }
    } catch {
      /* ignore */
    }
    try {
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      if (nav.clearAppBadge) await nav.clearAppBadge();
    } catch {
      /* ignore */
    }
    setNewNotifIds(new Set());
    keepClearedRef.current = false;
    await reloadNotifications();
  }, [api, reloadNotifications]);

  /* ── Wallet + payout ── */

  /* This runs on a timer, on six different realtime channels, and after every
     order the marketer touches, so several are often in flight at once. Three
     rules keep the number on screen still:

       · one write per refresh, at the end, so the balance and the line under
         it always describe the same moment;
       · a refresh that has been overtaken by a newer one commits nothing,
         because arriving late does not make an answer fresher;
       · a fetch that failed writes nothing. The old code fell back to zero,
         so one dropped request on a weak connection blanked the wallet to
         0 until the next tick — the flicker people actually saw.

     The caller still gets what this run computed, whether or not it committed;
     the withdraw sheet reads the return value to decide what to send. */
  const refreshWalletAndPayout = useCallback(async (): Promise<PayoutState> => {
    const seq = ++refreshSeqRef.current;
    const latestRun = () => refreshSeqRef.current === seq;

    /* Filled in by commit() rather than by each caller: the seven exits below
       differ on whether a withdrawal is possible, never on how much is still
       on the way. */
    let onWay = 0;
    const commit = (partial: Omit<PayoutState, "onTheWay">) => {
      const next: PayoutState = { ...partial, onTheWay: onWay };
      if (latestRun()) {
        setPayout(next);
        setDbBalance(next.balance);
        cacheWalletBalance(next.balance, userId);
      }
      return next;
    };
    /** The balance to show when nothing came back: whatever is already up. */
    const lastKnown = () => dbBalanceRef.current ?? 0;

    let wallet: { balance?: number; pending?: number } | null = null;
    try {
      if (api.getWallet) wallet = (await api.getWallet()) as { balance?: number; pending?: number } | null;
    } catch (e) {
      console.error("[Lateen] wallet", e);
    }
    if (wallet && wallet.pending != null) onWay = Number(wallet.pending) || 0;

    const prof = profileRef.current;
    if (prof && prof.frozen_at) {
      return commit({
        statusText: isAr() ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen",
        pending: false, canWithdraw: false, frozen: true,
        balance: wallet ? Number(wallet.balance) || 0 : lastKnown(),
      });
    }

    type PayoutStateRow = { balance?: number; pending_amount?: number; days_left?: number; pending?: boolean; can_withdraw?: boolean } | null;
    type PayoutRow = { status?: string } | null;
    type PaidRow = { paid_at?: string } | null;

    let state: PayoutStateRow = null;
    let freshProfile: MarketerProfile | null = null;
    let latest: PayoutRow = null;
    let paid: PaidRow = null;
    try {
      [state, freshProfile, latest, paid] = (await Promise.all([
        api.getPayoutState?.(),
        api.getProfile?.(),
        api.getLatestPayout?.(),
        api.getLastPaidPayout?.(),
      ])) as [PayoutStateRow, MarketerProfile | null, PayoutRow, PaidRow];
    } catch (e) {
      console.error("[Lateen] payout state", e);
    }

    if (state && state.pending_amount != null) onWay = Number(state.pending_amount) || 0;

    const bal =
      state && state.balance != null
        ? Number(state.balance) || 0
        : wallet
          ? Number(wallet.balance) || 0
          : lastKnown();

    if (!state) {
      return commit({
        statusText: t("Withdrawal is not available yet", "السحب غير متاح الآن"),
        pending: false, canWithdraw: false, frozen: false, balance: bal,
      });
    }

    const hasPaid = !!(paid && paid.paid_at);
    const anchor = hasPaid
      ? new Date(paid!.paid_at as string).getTime()
      : freshProfile && freshProfile.created_at
        ? new Date(freshProfile.created_at).getTime()
        : Date.now();
    const dueAt = anchor + PAYOUT_PERIOD_MS;
    const fallbackDaysLeft = Math.max(0, Math.ceil((dueAt - Date.now()) / 86400000));
    const daysLeft = state.days_left != null ? Math.max(0, Number(state.days_left) || 0) : fallbackDaysLeft;
    const pending = state.pending != null ? !!state.pending : !!(latest && latest.status === "requested");
    const serverCan =
      state.can_withdraw != null ? !!state.can_withdraw : bal >= MIN_WITHDRAW && !pending && daysLeft === 0;

    if (bal < MIN_WITHDRAW) {
      return commit({
        statusText: t(
          "You can't withdraw until your balance reaches 20 LYD. Withdrawals are processed every 30 days.",
          "لا يمكنك السحب حتى يصل رصيدك إلى 20 د.ل. التحويل يتم كل 30 يوم.",
        ),
        pending: false, canWithdraw: false, frozen: false, balance: bal,
      });
    }
    if (pending) {
      return commit({
        statusText: t("Pending withdrawal", "طلب السحب قيد المراجعه"),
        pending: true, canWithdraw: false, frozen: false, balance: bal,
      });
    }
    if (serverCan) {
      return commit({
        statusText: t("You can withdraw today", "تقدر تسحب اليوم"),
        pending: false, canWithdraw: true, frozen: false, balance: bal,
      });
    }
    if (daysLeft > 0) {
      let msg: string;
      if (daysLeft === 1) msg = t("You can withdraw in 1 day", "تقدر تسحب بعد يوم واحد");
      else if (daysLeft === 2) msg = t("You can withdraw in 2 days", "تقدر تسحب بعد يومين");
      else if (daysLeft <= 10) msg = t("You can withdraw in " + daysLeft + " days", "تقدر تسحب بعد " + daysLeft + " أيام");
      else msg = t("You can withdraw in " + daysLeft + " days", "تقدر تسحب بعد " + daysLeft + " يوم");
      return commit({ statusText: msg, pending: false, canWithdraw: false, frozen: false, balance: bal });
    }
    return commit({
      statusText: t("Next payout in 0 days", "تقدر تسحب بعد 0 يوم"),
      pending: false, canWithdraw: false, frozen: false, balance: bal,
    });
  }, [api, userId]);

  /* ── Favourites ── */

  const toggleFavorite = useCallback(
    async (id: string) => {
      const p = products.find((x) => x.id === id);
      if (!p) return;
      const willSave = !p.sv;
      // Optimistic: the heart flips immediately, and rolls back if the write fails.
      setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, sv: willSave } : x)));
      try {
        if (willSave) {
          await api.addFavorite(id);
          setFavOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
        } else {
          await api.removeFavorite(id);
          setFavOrder((prev) => prev.filter((x) => x !== id));
        }
      } catch (e) {
        console.error("[Lateen] favorite", e);
        setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, sv: !willSave } : x)));
      }
    },
    [api, products],
  );

  const setOrders = useCallback((updater: (prev: MarketerOrder[]) => MarketerOrder[]) => {
    setOrdersState(updater);
  }, []);

  /* ── Boot ── */

  useEffect(() => {
    void (async () => {
      await reloadBrowse();
      await reloadOrders();
      await refreshWalletAndPayout();
      await reloadNotifications();
      await reloadProfile();
    })();
  }, [reloadBrowse, reloadOrders, refreshWalletAndPayout, reloadNotifications, reloadProfile]);

  // The wallet/payout window rolls over on a timer, not on any user action.
  useEffect(() => {
    const iv = setInterval(() => { void refreshWalletAndPayout(); }, 60000);
    return () => clearInterval(iv);
  }, [refreshWalletAndPayout]);

  /* ── Realtime — coalesce bursts so lists don't re-render several times ── */

  useEffect(() => {
    if (!api.subscribe) return;
    const unsubs: Array<() => void> = [];
    let ordTimer: ReturnType<typeof setTimeout> | null = null;
    let brwTimer: ReturnType<typeof setTimeout> | null = null;

    const ordSoon = () => {
      if (ordTimer) return;
      ordTimer = setTimeout(() => {
        ordTimer = null;
        void reloadOrders();
        void refreshWalletAndPayout();
      }, 180);
    };
    const brwSoon = () => {
      if (brwTimer) return;
      brwTimer = setTimeout(() => {
        brwTimer = null;
        void reloadBrowse();
      }, 180);
    };

    unsubs.push(api.subscribe("browse-products", brwSoon));
    unsubs.push(api.subscribe("favorites", brwSoon));
    unsubs.push(api.subscribe("wallet", () => { void refreshWalletAndPayout(); }));
    unsubs.push(api.subscribe("orders", ordSoon));
    unsubs.push(api.subscribe("payouts", () => { void refreshWalletAndPayout(); }));
    unsubs.push(api.subscribe("notifications", () => {
      void reloadNotifications();
      void refreshWalletAndPayout();
    }));

    return () => {
      if (ordTimer) clearTimeout(ordTimer);
      if (brwTimer) clearTimeout(brwTimer);
      for (const u of unsubs) {
        try { u(); } catch { /* ignore */ }
      }
    };
  }, [api, reloadOrders, reloadBrowse, reloadNotifications, refreshWalletAndPayout]);

  /* ── Language switch ── */

  useEffect(() => {
    const h = () => setLangTick((n) => n + 1);
    window.addEventListener("lateen-lang", h);
    return () => window.removeEventListener("lateen-lang", h);
  }, []);

  const frozen = !!profile?.frozen_at;

  const blockIfFrozen = useCallback(() => {
    if (profileRef.current?.frozen_at) {
      alert(isAr() ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen");
      return true;
    }
    return false;
  }, []);

  const setWalletCur = useCallback((c: string) => setWalletCurState(c), []);

  const value = useMemo<Ctx>(
    () => ({
      api, userId,
      products, productsMap, favOrder, orders, profile, notifications, newNotifIds, avatarUrl,
      analytics, walletCur: selectedCur, setWalletCur, walletBalance, payout,
      frozen, blockIfFrozen,
      toggleFavorite, setOrders, markNotificationsRead,
      reloadBrowse, reloadOrders, reloadProfile, reloadNotifications, refreshWalletAndPayout,
      langTick,
    }),
    [
      api, userId, products, productsMap, favOrder, orders, profile, notifications, newNotifIds, avatarUrl,
      analytics, selectedCur, setWalletCur, walletBalance, payout, frozen, blockIfFrozen,
      toggleFavorite, setOrders, markNotificationsRead,
      reloadBrowse, reloadOrders, reloadProfile, reloadNotifications, refreshWalletAndPayout, langTick,
    ],
  );

  return <MarketerDataCtx.Provider value={value}>{children}</MarketerDataCtx.Provider>;
}
