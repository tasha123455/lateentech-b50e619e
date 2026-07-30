import { useEffect, useMemo, useState } from "react";

import { useBusinessData } from "../BusinessDataProvider";
import { computeEarnByCur, pickWalletCur } from "../home/currency";
import { isAr, moneyParts, ordFrac } from "../lib/format";
import type { Order, PendingActiveStub } from "../lib/types";

const BD_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ACTIVE_MKT_STATUSES = new Set(["pending", "approved", "confirmed"]);

type Sel = { day: string | null; month: string | null; year: string | null };
type BdData = { earnings: number; pieces: number; marketers: number; succeeded: number; failed: number };
type RangeKey = "daily" | "monthly" | "yearly";
type SelKey = "day" | "month" | "year";

const RANGE_META: Record<RangeKey, { key: SelKey; defaultLabel: string }> = {
  daily: { key: "day", defaultLabel: "Day" },
  monthly: { key: "month", defaultLabel: "Month" },
  yearly: { key: "year", defaultLabel: "Year" },
};

function filterOrders(
  all: Array<Order | PendingActiveStub>,
  sel: Sel,
): Array<Order | PendingActiveStub> {
  return all.filter((o) => {
    const c = o._createdAt;
    if (!c) return false;
    if (sel.day && BD_DAYS[c.getDay()] !== sel.day) return false;
    if (sel.month && BD_MONTHS[c.getMonth()] !== sel.month) return false;
    if (sel.year && String(c.getFullYear()) !== sel.year) return false;
    return true;
  });
}

function generateData(
  allTime: BdData,
  all: Array<Order | PendingActiveStub>,
  sel: Sel,
): BdData {
  if (!sel.day && !sel.month && !sel.year) return allTime;
  const list = filterOrders(all, sel);
  let earnings = 0, pieces = 0, succeeded = 0, failed = 0;
  const mset = new Set<string>();
  list.forEach((o) => {
    if (o._status === "delivered" && "price" in o) {
      earnings += o.price * o.qty - o.commission - o.platformFee;
      pieces += o.qty;
      succeeded++;
    }
    if (o._status === "cancelled") failed++;
    if (o.marketerId && ACTIVE_MKT_STATUSES.has(o._status)) mset.add(o.marketerId);
  });
  return { earnings, pieces, marketers: mset.size, succeeded, failed };
}

function MoneyH({ n, sym, code }: { n: number; sym: string; code?: string | null }) {
  const p = moneyParts(n, sym, code);
  if (p.symbolFirst) return <span data-no-i18n="">{p.symbol}{p.amount}</span>;
  if (p.spaced) return <span data-no-i18n="">{p.amount} {p.symbol}</span>;
  return <span data-no-i18n="">{p.amount}{p.symbol}</span>;
}

export function PayoutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { orders, pendingActiveStubs, profile } = useBusinessData();
  const ar = isAr();

  const [sel, setSel] = useState<Sel>({ day: null, month: null, year: null });
  const [openDropdown, setOpenDropdown] = useState<RangeKey | null>(null);

  const allOrders = useMemo(
    () => (orders as Array<Order | PendingActiveStub>).concat(pendingActiveStubs),
    [orders, pendingActiveStubs],
  );

  const allTime = useMemo<BdData>(() => {
    let totGross = 0, totComm = 0, totPlat = 0, totOk = 0, totFail = 0;
    const marketerSet = new Set<string>();
    let totPieces = 0;
    allOrders.forEach((o) => {
      const st = o._status;
      if (!o._createdAt) return;
      if (st === "delivered" && "price" in o) {
        totGross += o.price * o.qty;
        totPieces += o.qty;
        totComm += o.commission;
        totPlat += o.platformFee;
        totOk++;
      }
      if (st === "cancelled") totFail++;
      if (o.marketerId && ACTIVE_MKT_STATUSES.has(st)) marketerSet.add(o.marketerId);
    });
    return { earnings: totGross - totComm - totPlat, pieces: totPieces, marketers: marketerSet.size, succeeded: totOk, failed: totFail };
  }, [allOrders]);

  const byCur = useMemo(() => computeEarnByCur(orders), [orders]);
  const walletCur = pickWalletCur(byCur, null);
  const sym = (byCur[walletCur] && byCur[walletCur].sym) || "\u062F.\u0644";

  const data = useMemo(() => generateData(allTime, allOrders, sel), [allTime, allOrders, sel]);

  const curYear = new Date().getFullYear();
  const years = useMemo(() => [curYear - 2, curYear - 1, curYear].map(String), [curYear]);

  // Close dropdowns on outside click.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".bd-range-tab") && !t.closest(".bd-dropdown-list")) setOpenDropdown(null);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  if (!open) return null;

  const anySelected = !!(sel.day || sel.month || sel.year);

  const clearAll = () => {
    setOpenDropdown(null);
    setSel({ day: null, month: null, year: null });
  };

  const pickValue = (rangeKey: SelKey, value: string | null, range: RangeKey) => {
    setSel((s) => ({ ...s, [rangeKey]: value }));
    setOpenDropdown(null);
    void range;
  };

  const toggleDropdown = (range: RangeKey) => {
    setOpenDropdown((cur) => (cur === range ? null : range));
  };

  const total = data.succeeded + data.failed;
  const succPct = total > 0 ? Math.round((data.succeeded / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((data.failed / total) * 100) : 0;
  const succLbl = ar ? "الطلبات تم تسليمها" : "Succeeded";
  const failLbl = ar ? "الطلبات لم يتم تسليمها" : "Failed";
  const succSub = ar ? "من أصل " + ordFrac(total) : succPct + "%";
  const failSub = ar ? "من أصل " + ordFrac(total) : failPct + "%";
  const piecesLbl = ar ? "قطع تم بيعها" : "Pieces sold";
  const netLbl = ar ? "صافي الأرباح منذ إنشاء الحساب" : "Net earnings";

  const frozen = !!profile?.frozen_at;
  const frozenTxt = ar ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen";

  const renderTab = (range: RangeKey, defaultLabel: string) => {
    const meta = RANGE_META[range];
    const val = sel[meta.key];
    const active = !!val;
    return (
      <div
        key={range}
        className={`bd-range-tab${active ? " active" : ""}${openDropdown === range ? " open" : ""}`}
        data-range={range}
        onClick={() => toggleDropdown(range)}
      >
        {val || defaultLabel} <span className="bd-chev">▾</span>
      </div>
    );
  };

  const renderDropdown = (range: RangeKey, keys: string[]) => {
    const meta = RANGE_META[range];
    const val = sel[meta.key];
    return (
      <div
        key={range}
        className={`bd-dropdown-list${openDropdown === range ? " open" : ""}`}
        id={`bd-${range}-list`}
      >
        <div
          className="bd-dd-item clear"
          onClick={(e) => { e.stopPropagation(); pickValue(meta.key, null, range); }}
        >
          {ar ? "مسح الاختيار" : "Clear selection"}
        </div>
        {keys.map((k) => (
          <div
            key={k}
            className={`bd-dd-item${val === k ? " active" : ""}`}
            onClick={(e) => { e.stopPropagation(); pickValue(meta.key, k, range); }}
          >
            {k}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="menu-overlay open" id="payout-overlay">
      <div className="menu-backdrop" onClick={onClose} />
      <div className="payout-sheet">
        <div className="sheet-handle" />
        <div className="bd-modal-head">
          <div className="bd-head-left">
            <h2>{ar ? "التفاصيل" : "Breakdown"}</h2>
            <button className="cmpl-alert-btn" type="button" aria-label="Compliance & Security Policy">!</button>
          </div>
          <button className="bd-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bd-range-tabs">
          <div
            className={`bd-range-tab${!anySelected ? " active" : ""}`}
            data-range="all"
            onClick={clearAll}
          >
            {ar ? "كل الوقت" : "All time"}
          </div>
          {renderTab("daily", ar ? "اليوم" : "Day")}
          {renderTab("monthly", ar ? "الشهر" : "Month")}
          {renderTab("yearly", ar ? "السنة" : "Year")}
        </div>

        {renderDropdown("daily", BD_DAYS)}
        {renderDropdown("monthly", BD_MONTHS)}
        {renderDropdown("yearly", years)}

        <div className="bd-marketers-row">
          <div className="bd-m-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
              <circle cx="10" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <span><span>{ar ? "المسوقون النشطون:" : "Marketers active:"}</span> <span className="bd-m-val" id="bd-marketers-val">{data.marketers}</span></span>
        </div>

        {frozen && (
          <div style={{ margin: "0 0 10px", padding: "10px 12px", borderRadius: 10, background: "rgba(234,179,8,0.10)", border: "0.5px solid rgba(234,179,8,0.35)", color: "#eab308", fontSize: 12, fontWeight: 600, textAlign: "center" }}>
            {frozenTxt}
          </div>
        )}

        <div className="bd-grid" id="bd-grid">
          <div className="bd-box">
            <div className="bd-box-label" data-no-i18n="">{netLbl}</div>
            <div className="bd-box-value"><MoneyH n={data.earnings} sym={sym} code={walletCur} /></div>
          </div>
          <div className="bd-box">
            <div className="bd-box-label" data-no-i18n="">{piecesLbl}</div>
            <div className="bd-box-value">{data.pieces}</div>
          </div>
          <div className="bd-box">
            <div className="bd-box-label" data-no-i18n="">{succLbl}</div>
            <div className="bd-box-value green" data-no-i18n="">
              {data.succeeded} <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 }}>({succSub})</span>
            </div>
          </div>
          <div className="bd-box">
            <div className="bd-box-label" data-no-i18n="">{failLbl}</div>
            <div className="bd-box-value red" data-no-i18n="">
              {data.failed} <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 }}>({failSub})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
