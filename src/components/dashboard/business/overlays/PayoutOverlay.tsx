import { useEffect, useMemo, useState } from "react";

import { useBusinessData } from "../BusinessDataProvider";
import { computeEarnByCur, pickWalletCur } from "../home/currency";
import { isAr, ordFrac } from "../lib/format";
import { MoneyH } from "../ui/Money";
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

/** Was this order ever handed to the customer?
 *
 *  Not the same question as its status. A refund leaves the status as
 *  'cancelled' — the very status a failed delivery uses — so going by status
 *  turned every refunded sale into a delivery that had failed, and dropped its
 *  money out of the day it actually sold. delivered_at is the only field that
 *  still remembers, and nothing ever clears it. */
const wasDelivered = (o: Order | PendingActiveStub) =>
  !!(o as Order).deliveredAt;

/** A delivery that failed, as opposed to a sale that was reversed afterwards. */
const isFailedDelivery = (o: Order | PendingActiveStub) =>
  o._status === "cancelled" && !(o as Order).deliveredAt;

const matchesSel = (d: Date | null | undefined, sel: Sel): boolean => {
  if (!d) return false;
  if (sel.day && BD_DAYS[d.getDay()] !== sel.day) return false;
  if (sel.month && BD_MONTHS[d.getMonth()] !== sel.month) return false;
  if (sel.year && String(d.getFullYear()) !== sel.year) return false;
  return true;
};

const netOf = (o: Order | PendingActiveStub): number =>
  "price" in o ? o.price * o.qty - o.commission - o.platformFee : 0;

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
    if (wasDelivered(o) && "price" in o) {
      earnings += netOf(o);
      pieces += o.qty;
      succeeded++;
    }
    if (isFailedDelivery(o)) failed++;
    if (o.marketerId && ACTIVE_MKT_STATUSES.has(o._status)) mset.add(o.marketerId);
  });

  /* The reversal, dated to the day the money went back rather than the day
     the order was taken. Filter to a day whose only event was a refund and
     all three figures read negative — which is the honest answer: nothing was
     sold that day, something was given back. */
  all.forEach((o) => {
    const rf = (o as Order).refundedAt ? new Date((o as Order).refundedAt as string) : null;
    if (!rf || Number.isNaN(rf.getTime()) || !matchesSel(rf, sel)) return;
    if (!wasDelivered(o) || !("price" in o)) return;
    earnings -= netOf(o);
    pieces -= o.qty;
    succeeded--;
  });

  return { earnings, pieces, marketers: mset.size, succeeded, failed };
}

/** The unfiltered figures — what the card shows with no day, month or year
 *  picked. Module-level rather than inline in the component so it sits beside
 *  generateData, which has to apply the same rules to a filtered slice. Two
 *  copies of "what counts as sold" is how they drift apart. */
function computeAllTime(allOrders: Array<Order | PendingActiveStub>): BdData {
  let totGross = 0, totComm = 0, totPlat = 0, totOk = 0, totFail = 0, totPieces = 0;
  const marketerSet = new Set<string>();
  allOrders.forEach((o) => {
    if (!o._createdAt) return;
    if (wasDelivered(o) && "price" in o) {
      totGross += o.price * o.qty; totPieces += o.qty;
      totComm += o.commission; totPlat += o.platformFee; totOk++;
    }
    if (isFailedDelivery(o)) totFail++;
    if ((o as Order).refundedAt && wasDelivered(o) && "price" in o) {
      totGross -= o.price * o.qty; totPieces -= o.qty;
      totComm -= o.commission; totPlat -= o.platformFee; totOk--;
    }
    if (o.marketerId && ACTIVE_MKT_STATUSES.has(o._status)) marketerSet.add(o.marketerId);
  });
  return { earnings: totGross - totComm - totPlat, pieces: totPieces, marketers: marketerSet.size, succeeded: totOk, failed: totFail };
}

const CMPL_ICONS = [
  { bg: "rgba(239,68,68,0.14)", fg: "#ef4444", path: <><path d="M12 3l8 4v5c0 4.4-3.2 7.9-8 9-4.8-1.1-8-4.6-8-9V7l8-4z" /><path d="M12 8.5v3.5" /><path d="M12 15.5v.01" /></> },
  { bg: "rgba(245,158,11,0.14)", fg: "#f59e0b", path: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></> },
  { bg: "rgba(96,165,250,0.14)", fg: "#60a5fa", path: <path d="M12 4l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 9.5l5.2-.8L12 4z" /> },
];

function complianceContent(ar: boolean) {
  if (ar) {
    return {
      title: "تنبيه هام لجميع التجار",
      intro: "السلام عليكم، حرصاً على أمان المنصة وثقة الجميع، نود التنويه بأننا نطبق بروتوكولات حماية وسياسة صارمة جداً. سيتم تجميد الحساب فوراً والحظر النهائي بدون إمكانية رجوع في الحالات التالية:",
      items: ["رصد أي عمليات إحتيال أو نشاط مشبوه.", "وصول شكاوى من المسوقين أو الزبائن بسبب عدم تسليم البضاعة.", "تكرار التقييمات السيئة لجودة المنتج."],
      outro: "يرجى الالتزام بالجودة والتسليم في الموعد المحدّد لضمان استمرار حسابكم.",
      ok: "فهمت",
    };
  }
  return {
    title: "Important Notice: Compliance & Security Policy",
    intro: "To All Merchants: We enforce a strict zero-tolerance policy to protect our platform. Your account will be immediately frozen and faces a permanent, irreversible ban if we identify:",
    items: ["Any fraudulent or scam activity.", "Reports from marketers/customers regarding non-delivered orders.", "Repeated negative reviews about product quality."],
    outro: "Our automated protection protocols actively monitor all accounts. Please maintain quality standards and fulfill orders on time.",
    ok: "Got it",
  };
}

function ComplianceOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ar = isAr();
  const c = complianceContent(ar);
  return (
    <div className={"cmpl-overlay" + (open ? " open" : "")} id="cmpl-overlay">
      <div className="cmpl-backdrop" onClick={onClose} />
      <div className="cmpl-sheet" data-no-i18n="">
        <div className="cmpl-head">
          <div className="cmpl-head-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5v.01" /></svg>
          </div>
          <div className="cmpl-title">{c.title}</div>
        </div>
        <div className="cmpl-intro">{c.intro}</div>
        <div>
          {c.items.map((tx, ix) => {
            const ic = CMPL_ICONS[ix] || CMPL_ICONS[0];
            return (
              <div className="cmpl-item" key={ix}>
                <div className="ic" style={{ background: ic.bg, color: ic.fg }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ic.path}</svg>
                </div>
                <div className="tx">{tx}</div>
              </div>
            );
          })}
        </div>
        <div className="cmpl-outro">{c.outro}</div>
        <button className="cmpl-ok" type="button" onClick={onClose}>{c.ok}</button>
      </div>
    </div>
  );
}

export function PayoutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { orders, pendingActiveStubs, profile } = useBusinessData();
  const ar = isAr();

  const [sel, setSel] = useState<Sel>({ day: null, month: null, year: null });
  const [openDropdown, setOpenDropdown] = useState<RangeKey | null>(null);
  const [complianceOpen, setComplianceOpen] = useState(false);

  const allOrders = useMemo(
    () => (orders as Array<Order | PendingActiveStub>).concat(pendingActiveStubs),
    [orders, pendingActiveStubs],
  );

  const allTime = useMemo<BdData>(() => computeAllTime(allOrders), [allOrders]);

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
          {ar ? "إلغاء التحديد" : "Clear selection"}
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
            <h2 data-i18n="Breakdown">Breakdown</h2>
            <button className="cmpl-alert-btn" type="button" aria-label="Compliance & Security Policy" onClick={() => setComplianceOpen(true)}>!</button>
          </div>
          <button className="bd-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bd-range-tabs">
          <div
            className={`bd-range-tab${!anySelected ? " active" : ""}`}
            data-range="all"
            onClick={clearAll}
          >
            All time
          </div>
          {renderTab("daily", "Day")}
          {renderTab("monthly", "Month")}
          {renderTab("yearly", "Year")}
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
          <span><span data-i18n="Marketers active:">Marketers active:</span> <span className="bd-m-val" id="bd-marketers-val">{data.marketers}</span></span>
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
      <ComplianceOverlay open={complianceOpen} onClose={() => setComplianceOpen(false)} />
    </div>
  );
}
