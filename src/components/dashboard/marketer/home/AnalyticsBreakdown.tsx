import { useEffect, useMemo, useRef, useState } from "react";

import { breakdownData, ordFrac, type BreakdownSelection } from "../lib/analytics";
import { DOW, MON } from "../lib/constants";
import { isAr } from "../lib/format";
import type { MarketerOrder } from "../lib/types";
import { Money } from "../ui/Money";
import { TransactionsCard } from "./TransactionsCard";

type RangeName = "daily" | "monthly" | "yearly";
const RANGE_KEY: Record<RangeName, keyof BreakdownSelection> = { daily: "day", monthly: "month", yearly: "year" };
const RANGE_LABEL: Record<RangeName, string> = { daily: "Day", monthly: "Month", yearly: "Year" };

export function AnalyticsBreakdown({
  orders, walletCur, selSym,
}: {
  orders: MarketerOrder[];
  walletCur: string;
  selSym: string;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<BreakdownSelection>({ day: null, month: null, year: null });
  const [openDropdown, setOpenDropdown] = useState<RangeName | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // A tap anywhere outside the tabs closes whichever dropdown is showing.
  useEffect(() => {
    if (!openDropdown) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".mkbd-range-tab") || target?.closest(".mkbd-dropdown-list")) return;
      setOpenDropdown(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openDropdown]);

  const data = useMemo(() => breakdownData(orders, sel, walletCur), [orders, sel, walletCur]);

  const total = data.succeeded + data.failed;
  const succPct = total > 0 ? Math.round((data.succeeded / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((data.failed / total) * 100) : 0;
  /* Filtered to a day when a sale was refunded, these read as a reversal —
     "−1 succeeded". A share of a reversal is not a quantity, so the "x% of N
     orders" subtext is left off rather than printed as nonsense. */
  const showShare = total > 0 && data.succeeded >= 0 && data.failed >= 0;
  const ar = isAr();
  const succLbl = ar ? "الطلبات تم تسليمها" : "Succeeded";
  const failLbl = ar ? "الطلبات لم يتم تسليمها" : "Failed";
  const succSub = ar ? "من أصل " + ordFrac(total) : succPct + "%";
  const failSub = ar ? "من أصل " + ordFrac(total) : failPct + "%";
  const netLbl = ar ? "صافي الأرباح منذ إنشاء الحساب" : "Net earnings";
  const piecesLbl = ar ? "قطع تم بيعها" : "Pieces sold";

  const anySelected = !!(sel.day || sel.month || sel.year);
  const curYear = new Date().getFullYear();
  const yearKeys = [curYear - 2, curYear - 1, curYear].map(String);

  const clearAll = () => {
    setOpenDropdown(null);
    setSel({ day: null, month: null, year: null });
  };

  const tabClick = (range: RangeName) => {
    setOpenDropdown((cur) => (cur === range ? null : range));
  };

  const pick = (range: RangeName, value: string | null) => {
    setSel((prev) => ({ ...prev, [RANGE_KEY[range]]: value }));
    setOpenDropdown(null);
  };

  const renderTab = (range: RangeName) => {
    const value = sel[RANGE_KEY[range]];
    return (
      <div
        className={"mkbd-range-tab" + (value ? " active" : "") + (openDropdown === range ? " open" : "")}
        data-range={range}
        onClick={() => tabClick(range)}
      >
        {value || RANGE_LABEL[range]} <span className="mkbd-chev-sm">▾</span>
      </div>
    );
  };

  const renderDropdown = (range: RangeName, keys: string[]) => (
    <div className={"mkbd-dropdown-list" + (openDropdown === range ? " open" : "")}>
      <div className="mkbd-dd-item clear" onClick={(e) => { e.stopPropagation(); pick(range, null); }}>
        Clear selection
      </div>
      {keys.map((k) => (
        <div key={k} className="mkbd-dd-item" onClick={(e) => { e.stopPropagation(); pick(range, k); }}>
          {k}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mkbd-card" ref={rootRef}>
      <button className={"mkbd-toggle" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)}>
        <span className="mkbd-toggle-left">
          <span className="mkbd-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="20" x2="4" y2="12" />
              <line x1="12" y1="20" x2="12" y2="6" />
              <line x1="20" y1="20" x2="20" y2="14" />
            </svg>
          </span>
          <span>Analytics</span>
        </span>
        <span className="mkbd-chev">▾</span>
      </button>
      <div className={"mkbd-wrap" + (open ? " open" : "")}>
        <div className="mkbd-inner">
          <div className="mkbd-body">
            <div className="mkbd-range-tabs">
              <div
                className={"mkbd-range-tab" + (!anySelected ? " active" : "")}
                data-range="all"
                onClick={clearAll}
              >
                All time
              </div>
              {renderTab("daily")}
              {renderTab("monthly")}
              {renderTab("yearly")}
            </div>
            {renderDropdown("daily", DOW)}
            {renderDropdown("monthly", MON)}
            {renderDropdown("yearly", yearKeys)}

            <div className="mkbd-grid">
              <div className="mkbd-box">
                <div className="mkbd-box-label" data-no-i18n>{netLbl}</div>
                <div className="mkbd-box-value"><Money n={data.earnings} sym={selSym} code={walletCur} /></div>
              </div>
              {/* <bdi> keeps a negative reading as a negative: on the Arabic
                  page a bare "-3" is reordered to "3-". */}
              <div className="mkbd-box">
                <div className="mkbd-box-label" data-no-i18n>{piecesLbl}</div>
                <div className="mkbd-box-value"><bdi>{data.pieces}</bdi></div>
              </div>
              <div className="mkbd-box">
                <div className="mkbd-box-label" data-no-i18n>{succLbl}</div>
                <div className="mkbd-box-value green" data-no-i18n>
                  <bdi>{data.succeeded}</bdi>{showShare && " "}
                  {showShare && (
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 }}>({succSub})</span>
                  )}
                </div>
              </div>
              <div className="mkbd-box">
                <div className="mkbd-box-label" data-no-i18n>{failLbl}</div>
                <div className="mkbd-box-value red" data-no-i18n>
                  <bdi>{data.failed}</bdi>{showShare && " "}
                  {showShare && (
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontWeight: 500 }}>({failSub})</span>
                  )}
                </div>
              </div>
            </div>

            <TransactionsCard sel={sel} />
          </div>
        </div>
      </div>
    </div>
  );
}
