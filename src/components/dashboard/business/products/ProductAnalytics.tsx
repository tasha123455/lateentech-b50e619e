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
  if (symbolFirst) return <><span className="cur-sym">{symbol}</span>{amount}</>;
  if (spaced) return <>{amount} <span className="cur-sym">{symbol}</span></>;
  return <>{amount}<span className="cur-sym">{symbol}</span></>;
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

/** Was this order actually delivered, whatever happened to it afterwards?
 *
 *  A refund leaves the status as 'cancelled', which is also what a failed
 *  delivery uses, so reading the status alone made a refunded sale vanish from
 *  the day it sold. delivered_at is the reliable answer: mark_failed refuses
 *  to touch a delivered order and nothing ever clears the date. */
const wasDelivered = (o: Order) => !!o.deliveredAt;

/** mpProductOrders, now signed.
 *
 *  A sale counts on the day it was made; a refund counts *against* the day the
 *  refund happened, rather than quietly deleting the sale from the day it was
 *  made. Filter to a day on which something was refunded and the totals read
 *  negative, which is what actually happened that day. Over all time the two
 *  cancel, so a refunded sale nets to nothing — as it should. */
type SignedOrder = { o: Order; sign: 1 | -1 };

function productOrders(p: Product, orders: Order[], sel: Sel): SignedOrder[] {
  try {
    const out: SignedOrder[] = [];
    orders.forEach((o) => {
      if (o.productId !== p.id || !wasDelivered(o)) return;
      if (inSel(o._createdAt, sel)) out.push({ o, sign: 1 });
      if (o.refundedAt && inSel(new Date(o.refundedAt), sel)) out.push({ o, sign: -1 });
    });
    return out;
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
        <div className={"bd-range-tab" + (!anySel ? " active" : "")} data-range="all" data-pid={pid} onClick={allClick}>
          {ar ? "كل الوقت" : "All time"}
        </div>
        {(["daily", "monthly", "yearly"] as Range[]).map((range) => {
          const val = sel[meta[range].key];
          return (
            <div
              key={range}
              className={"bd-range-tab" + (val ? " active" : "") + (openRange === range ? " open" : "")}
              data-range={range}
              data-pid={pid}
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
          id={`mp-bd-${range}-list-${pid}`}
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

function VariantBoxes({ p, list }: { p: Product; list: SignedOrder[] }) {
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
                const vList = list.filter(({ o }) => {
                  const sv = Array.isArray(o.selectedVariants) ? o.selectedVariants : null;
                  if (sv && sv.length) {
                    return sv.some((s) => String((s as { name?: string })?.name || "").trim().toLowerCase() === String(g.name || "").trim().toLowerCase() && String((s as { value?: string })?.value || "") === String(x.val));
                  }
                  return o.size === x.val || o.color === x.val;
                });
                const vSold = vList.reduce((s, { o, sign }) => s + sign * (Number(o.qty) || 0), 0);
                const vRevenue = vList.reduce((s, { o, sign }) => s + sign * orderNet(o), 0);
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
  const sold = list.reduce((s, { o, sign }) => s + sign * (Number(o.qty) || 0), 0);
  const revenue = list.reduce((s, { o, sign }) => s + sign * orderNet(o), 0);
  const eq = effectiveQty(p);
  const stockClass = eq === 0 ? "warn" : eq <= LOW_STOCK_THRESHOLD ? "warn" : "accent";
  return (
    <>
      <div className="mp-stat-grid">
        {/* <bdi> so a refunded day's "-3" is not reordered to "3-" in Arabic. */}
        <div className="mp-stat-tile"><div className="mp-stat-label">{ar ? "إجمالي المباع" : "Total sold"}</div><div className="mp-stat-val"><bdi>{sold.toLocaleString()}</bdi></div></div>
        <div className={"mp-stat-tile " + stockClass}><div className="mp-stat-label">{ar ? "إجمالي المخزون" : "Total stock"}</div><div className="mp-stat-val">{eq || 0}</div></div>
        <div className="mp-stat-tile"><div className="mp-stat-label">{ar ? "إجمالي الإيرادات" : "Total revenue"}</div><div className="mp-stat-val"><Money p={p} n={revenue} /></div></div>
      </div>
      <VariantBoxes p={p} list={list} />
    </>
  );
}

/* mpRenderCard() put the Analytics *button* inside .mp-details-top-row but
   the *panel* as a sibling of that row. .mp-details-top-row is
   `display:flex; justify-content:space-between`, so keeping the panel inside
   it turns the expanded chart into a flex item squeezed next to the code
   pill instead of spanning the card. Button and panel are exported
   separately so ProductCard can place each where the original had it. */

export function useAnalyticsState() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Sel>({ day: null, month: null, year: null });
  return { open, setOpen, sel, setSel };
}

export function AnalyticsButton({ pid, open, onToggle }: { pid: string; open: boolean; onToggle: () => void }) {
  const ar = isAr();
  return (
    <div
      className={"mp-analytics-btn-outer" + (open ? " open" : "")}
      id={"mp-abtn-" + pid}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <div className="mp-analytics-icon">
        <span style={{ height: 5, opacity: 0.5 }} />
        <span style={{ height: 9, opacity: 0.7 }} />
        <span style={{ height: 13 }} />
      </div>
      <span className="mp-analytics-btn-label">{ar ? "التحليلات" : "Analytics"}</span>
      <svg className="mp-analytics-chev" width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

export function AnalyticsPanel({
  p, orders, open, sel, setSel,
}: {
  p: Product; orders: Order[]; open: boolean; sel: Sel; setSel: (s: Sel) => void;
}) {
  return (
    <div className={"mp-analytics-panel" + (open ? " open" : "")} id={"mp-analytics-panel-" + p.id}>
      <div className="mp-analytics-panel-inner">
        <RangeTabs pid={p.id} sel={sel} onChange={setSel} />
        <div id={"mp-analytics-body-" + p.id}><AnalyticsBody p={p} orders={orders} sel={sel} /></div>
      </div>
    </div>
  );
}
