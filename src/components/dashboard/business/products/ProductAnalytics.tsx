/* Per-product Analytics fold — ported from mpAnalyticsSection / mpAnalyticsBody /
   mpVariantBoxes / the __mpBd* day/month/year tab+dropdown widget in
   src/components/dashboard/lateen/business.script.js. */
import { useMemo, useState } from "react";
import { isAr } from "../lib/format";
import type { Order, Product } from "../lib/types";
import { useLightbox } from "../ui/Lightbox";
import { effectiveQty, fmtMoney, LOW_STOCK_THRESHOLD } from "./productHelpers";

const BD_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Sel = { day: string | null; month: string | null; year: string | null };
type Range = "daily" | "monthly" | "yearly";

function Money({ p, n }: { p: Product; n: unknown }) {
  const { amount, symbol, symbolFirst, spaced } = fmtMoney(p, n);
  if (symbolFirst) return <>{symbol}{amount}</>;
  if (spaced) return <>{amount} {symbol}</>;
  return <>{amount}{symbol}</>;
}

/** __mpInSel */
function inSel(createdAt: Date | null | undefined, sel: Sel): boolean {
  if (!sel || (!sel.day && !sel.month && !sel.year)) return true;
  if (!createdAt) return false;
  const c = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(c.getTime())) return false;
  if (sel.day && BD_DAYS[c.getDay()] !== sel.day) return false;
  if (sel.month && BD_MONTHS[c.getMonth()] !== sel.month) return false;
  if (sel.year && String(c.getFullYear()) !== sel.year) return false;
  return true;
}

/** mpProductOrders */
function productOrders(p: Product, orders: Order[], sel: Sel): Order[] {
  try {
    return orders.filter((o) => o.productId === p.id && o._status === "delivered" && inSel(o._createdAt, sel));
  } catch {
    return [];
  }
}

/** mpOrderNet */
function orderNet(o: Order): number {
  return (Number(o.price) || 0) * (Number(o.qty) || 0) - (Number(o.commission) || 0) - (Number(o.platformFee) || 0);
}

function RangeTabs({
  pid, sel, onChange,
}: {
  pid: string;
  sel: Sel;
  onChange: (sel: Sel) => void;
}) {
  const ar = isAr();
  const [openRange, setOpenRange] = useState<Range | null>(null);
  const anySel = !!(sel.day || sel.month || sel.year);

  const meta: Record<Range, { key: keyof Sel; keys: string[]; defaultLabel: string }> = {
    daily: { key: "day", keys: BD_DAYS, defaultLabel: ar ? "يوم" : "Day" },
    monthly: { key: "month", keys: BD_MONTHS, defaultLabel: ar ? "شهر" : "Month" },
    yearly: { key: "year", keys: (() => { const y = new Date().getFullYear(); return [y - 2, y - 1, y].map(String); })(), defaultLabel: ar ? "سنة" : "Year" },
  };

  const tabClick = (range: Range) => {
    setOpenRange((cur) => (cur === range ? null : range));
  };
  const allClick = () => {
    setOpenRange(null);
    onChange({ day: null, month: null, year: null });
  };
  const pick = (range: Range, val: string | null) => {
    const key = meta[range].key;
    onChange({ ...sel, [key]: val });
    setOpenRange(null);
  };

  return (
    <>
      <div className="bd-range-tabs mp-bd-range-tabs" id={`mp-bd-tabs-${pid}`} onClick={(e) => e.stopPropagation()}>
        <div className={"bd-range-tab" + (!anySel ? " active" : "")} onClick={allClick}>
          {ar ? "كل الوقت" : "All time"}
        </div>
        {(["daily", "monthly", "yearly"] as Range[]).map((range) => {
          const val = sel[meta[range].key];
          return (
            <div
              key={range}
              className={"bd-range-tab" + (val ? " active" : "") + (openRange === range ? " open" : "")}
              onClick={() => tabClick(range)}
            >
              {val || meta[range].defaultLabel} <span className="bd-chev">▾</span>
            </div>
          );
        })}
      </div>
      {(["daily", "monthly", "yearly"] as Range[]).map((range) => (
        <div
          key={range}
          className={"bd-dropdown-list" + (openRange === range ? " open" : "")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bd-dd-item clear" onClick={() => pick(range, null)}>
            {ar ? "إلغاء التحديد" : "Clear selection"}
          </div>
          {meta[range].keys.map((k) => (
            <div key={k} className="bd-dd-item" onClick={() => pick(range, k)}>{k}</div>
          ))}
        </div>
      ))}
    </>
  );
}

function VariantBoxes({ p, list }: { p: Product; list: Order[] }) {
  const ar = isAr();
  const { open: openLightbox } = useLightbox();
  const realGroups = (p.variantGroups || []).filter((g) => (g as { items?: unknown[] }).items && (g as { items?: unknown[] }).items!.length);

  if (realGroups.length) {
    return (
      <>
        {realGroups.map((g, gi) => {
          const items = (g as { items: Array<{ val?: string; qty?: unknown; photo?: string }> }).items;
          const total = items.reduce((s, x) => s + (Number(x.qty) || 0), 0);
          const maxQty = Math.max(...items.map((x) => Number(x.qty) || 0), 1);
          return (
            <div className="mp-variant-group-box" key={gi}>
              <div className="mp-vg-title-row">
                <span className="mp-vg-title">{g.name ? <span data-no-i18n="">{g.name}</span> : "Variant"}</span>
                <span className="mp-vg-total">{total} {ar ? "بالمخزون" : "in stock"}</span>
              </div>
              {items.map((x, xi) => {
                const qty = Number(x.qty) || 0;
                const pct = Math.max(6, Math.round((qty / maxQty) * 100));
                const low = qty === 0 ? "mp-empty" : qty <= LOW_STOCK_THRESHOLD ? "mp-low" : "";
                const vList = list.filter((o) => {
                  const sv = Array.isArray(o.selectedVariants) ? o.selectedVariants : null;
                  if (sv && sv.length) {
                    return sv.some((s) => String((s as { name?: string })?.name || "").trim().toLowerCase() === String(g.name || "").trim().toLowerCase() && String((s as { value?: string })?.value || "") === String(x.val));
                  }
                  return o.size === x.val || o.color === x.val;
                });
                const vSold = vList.reduce((s, o) => s + (Number(o.qty) || 0), 0);
                const vRevenue = vList.reduce((s, o) => s + orderNet(o), 0);
                return (
                  <div className="mp-vg-value-row" key={xi}>
                    <div className="mp-vg-value-top">
                      {x.photo ? (
                        <img
                          className="mp-vg-swatch"
                          src={x.photo}
                          alt=""
                          onClick={(e) => { e.stopPropagation(); openLightbox([x.photo as string], 0); }}
                        />
                      ) : null}
                      <span className="mp-vg-value-name" data-no-i18n="">{x.val}</span>
                      <div className="mp-vg-bar-track"><div className={"mp-vg-bar-fill " + low} style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="mp-vg-mini-grid">
                      <div className={"mp-vg-mini" + (low ? " warn" : "")}><div className="l">{ar ? "المخزون" : "In stock"}</div><div className="v">{qty}</div></div>
                      <div className="mp-vg-mini"><div className="l">{ar ? "المباع" : "Sold"}</div><div className="v">{vSold}</div></div>
                      <div className="mp-vg-mini"><div className="l">{ar ? "الإيرادات" : "Revenue"}</div><div className="v"><Money p={p} n={vRevenue} /></div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </>
    );
  }

  const chips: Array<{ label: string; val: string }> = [];
  (p.sizes || []).forEach((v) => chips.push({ label: ar ? "المقاس" : "Size", val: v }));
  (p.colors || []).forEach((v) => chips.push({ label: ar ? "اللون" : "Colour", val: v }));
  if (!chips.length) return null;
  return (
    <div className="mp-variant-chip-row">
      {chips.map((c, i) => (
        <span className="mp-variant-chip" key={i}>{c.label}: <span data-no-i18n="">{c.val}</span></span>
      ))}
    </div>
  );
}

function AnalyticsBody({ p, orders, sel }: { p: Product; orders: Order[]; sel: Sel }) {
  const ar = isAr();
  const list = useMemo(() => productOrders(p, orders, sel), [p, orders, sel]);
  const sold = list.reduce((s, o) => s + (Number(o.qty) || 0), 0);
  const revenue = list.reduce((s, o) => s + orderNet(o), 0);
  const eq = effectiveQty(p);
  const stockClass = eq === 0 ? "warn" : eq <= LOW_STOCK_THRESHOLD ? "warn" : "accent";
  return (
    <>
      <div className="mp-stat-grid">
        <div className="mp-stat-tile"><div className="mp-stat-label">{ar ? "إجمالي المباع" : "Total sold"}</div><div className="mp-stat-val">{sold.toLocaleString()}</div></div>
        <div className={"mp-stat-tile " + stockClass}><div className="mp-stat-label">{ar ? "إجمالي المخزون" : "Total stock"}</div><div className="mp-stat-val">{eq || 0}</div></div>
        <div className="mp-stat-tile"><div className="mp-stat-label">{ar ? "إجمالي الإيرادات" : "Total revenue"}</div><div className="mp-stat-val"><Money p={p} n={revenue} /></div></div>
      </div>
      <VariantBoxes p={p} list={list} />
    </>
  );
}

export function ProductAnalytics({ p, orders }: { p: Product; orders: Order[] }) {
  const ar = isAr();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Sel>({ day: null, month: null, year: null });

  return (
    <>
      <div
        className={"mp-analytics-btn-outer" + (open ? " open" : "")}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <div className="mp-analytics-icon">
          <span style={{ height: 5, opacity: 0.5 }} />
          <span style={{ height: 9, opacity: 0.7 }} />
          <span style={{ height: 13 }} />
        </div>
        <span className="mp-analytics-btn-label">{ar ? "التحليلات" : "Analytics"}</span>
        <svg className="mp-analytics-chev" width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div className={"mp-analytics-panel" + (open ? " open" : "")}>
        <div className="mp-analytics-panel-inner">
          <RangeTabs pid={p.id} sel={sel} onChange={setSel} />
          <AnalyticsBody p={p} orders={orders} sel={sel} />
        </div>
      </div>
    </>
  );
}
