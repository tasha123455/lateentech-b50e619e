import type { ReactElement } from "react";
import { Fragment, useMemo, useRef, useState } from "react";

import { FulfilmentBadge } from "@/components/shared/FulfilmentBadge";
import { coverStyle } from "@/lib/coverFocus";
import { useBusinessData } from "../BusinessDataProvider";
import { useLightbox } from "../ui/Lightbox";
import { MoneyH } from "../ui/Money";
import { locSearchText } from "../lib/constants";
import {
  isAr, escH, freeLbl, isFreeVal, searchMatcher, splitCC,
  platThreshold,
} from "../lib/format";
import type { Order, OrderUiStatus } from "../lib/types";

const ST: Record<string, { label: string; step: number }> = {
  pending: { label: "Pending", step: 0 },
  approved: { label: "Approved", step: 0 },
  confirmed: { label: "Confirmed", step: 1 },
  delivered: { label: "Delivered", step: 2 },
  failed: { label: "Failed", step: -1 },
  rejected: { label: "Rejected", step: -1 },
};
const STEPS = ["New", "Confirmed", "Delivered"];

type Filter = "all" | "new" | "confirmed" | "delivered" | "failed";

function fmt(n: number, sym: string, code: string): ReactElement {
  return <MoneyH n={n} sym={sym} code={code} />;
}

function computeOrdFin(o: Order) {
  const subtotal = o.total;
  const base = o.price * o.qty;
  const commissionPct = base > 0 ? Math.round((o.commission / base) * 100) : 0;
  const platformPct = o.price > 0 && o.qty > 0 ? Math.round((o.platformFee / o.qty / o.price) * 100) : 0;
  const platformFixed = (o.price || 0) <= platThreshold(o.market);
  const net = base - o.commission - o.platformFee;
  const hasDelivery = Number(o.delivery) > 0;
  const hasShipping = Number(o.shipping) > 0;
  let extra: { label: string; value: number } | null = null;
  if (hasDelivery && hasShipping) {
    extra = { label: "Total delivery and shipping", value: base + Number(o.delivery) + Number(o.shipping) - o.commission - o.platformFee };
  } else if (hasDelivery) {
    extra = { label: "Total with delivery fee", value: base + Number(o.delivery) - o.commission - o.platformFee };
  } else if (hasShipping) {
    extra = { label: "Total with shipping fee", value: base + Number(o.shipping) - o.commission - o.platformFee };
  }
  return { subtotal, commissionPct, platformPct, platformFixed, net, extra };
}

function isImgStr(s: unknown): s is string {
  return typeof s === "string" && /^(data:|https?:|\/)/.test(s);
}

function buildOrdStepper(status: OrderUiStatus): ReactElement {
  if (status === "failed") return <div className="progress-failed">Order failed</div>;
  if (status === "rejected") return <div className="progress-failed">Receipt rejected</div>;
  const si = ST[status]?.step ?? 0;
  return (
    <div className="progress">
      {STEPS.map((step, i) => (
        <Fragment key={step}>
          <div className={"step" + (i === si ? " active" : "")}>
            <div className="bubble" />
            <div className="lbl">{step}</div>
          </div>
          {i < STEPS.length - 1 ? <div className="line" /> : null}
        </Fragment>
      ))}
    </div>
  );
}

function bizOrdCounts(orders: Order[]) {
  const c = { all: orders.length, new: 0, confirmed: 0, delivered: 0, failed: 0 };
  orders.forEach((o) => {
    if (o.status === "pending" || o.status === "approved") c.new++;
    else if (o.status === "confirmed") c.confirmed++;
    else if (o.status === "delivered") c.delivered++;
    else if (o.status === "failed" || o.status === "rejected") c.failed++;
  });
  return c;
}

/** `focus` is the owner's framing of the *cover*, which is photos[0]. The
 *  photos behind it were never framed, so they stay centred. */
function HeroPhotos({ photos, focus }: { photos: string[]; focus?: { x: unknown; y: unknown } }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [dotIdx, setDotIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
      setDotIdx(idx);
    }, 60);
  };
  return (
    <div className="photo-wrap">
      <div className="hero-scroll" ref={scrollerRef} onScroll={onScroll}>
        {photos.map((p, i) => (
          <div className="hero-slide" key={i}>
            {isImgStr(p)
              ? <img src={p} alt="" loading="eager" decoding="async" style={i === 0 && focus ? coverStyle(focus.x, focus.y) : undefined} />
              : p}
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <div className="hero-dots">
          {photos.map((_, i) => (
            <div className={"d" + (i === dotIdx ? " active" : "")} key={i} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhoneRow({ label, value }: { label: string; value: string }) {
  const p = splitCC(value);
  return (
    <div className="r">
      <span className="k">{label}</span>
      <span className="v phone-val" dir="ltr">
        <span className="pv-code">{p.cc}</span>
        <span className="pv-divider" />
        <span className="pv-num">{p.num}</span>
      </span>
    </div>
  );
}

function FailNoteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (note: string | null) => void }) {
  const ar = isAr();
  const [text, setText] = useState("");
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "#1a2030", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>
          {ar ? "وضع الطلب: فشل" : "Mark order as failed"}
        </div>
        <div style={{ fontSize: 12, color: "#8a96a8", marginBottom: 10 }}>
          {ar ? "ملاحظات للمسوق (اختياري)" : "Notes for the marketer (optional)"}
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ar ? "وضح سبب فشل الطلب…" : "Explain why this order failed…"}
          style={{ width: "100%", minHeight: 90, background: "#0f1420", border: "1px solid #2a3445", borderRadius: 10, color: "#fff", padding: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
          data-no-i18n=""
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: "#2a3445", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(text.trim() || "")}
            style={{ background: "#e07070", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {ar ? "تأكيد" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  o, isExp, onToggle, onAdvance, busy, frozen,
}: {
  o: Order;
  isExp: boolean;
  onToggle: () => void;
  onAdvance: (id: string, ns: "confirmed" | "delivered" | "failed") => void;
  busy: boolean;
  frozen: boolean;
}) {
  const { open } = useLightbox();
  const { products } = useBusinessData();
  const ar = isAr();
  const om = (n: number) => fmt(n, o.sym, o.curCode);
  const photos = o.photos && o.photos.length ? o.photos : [o.productEmoji || "📦"];
  const isNewBucket = o.status === "pending" || o.status === "approved";
  const stLbl = ST[o.status]?.label || o.status;
  const statusTag = isNewBucket ? (
    <div className="status-tag tag-new"><span className="dot" />{ar ? "طلب جديد" : "New order"}</div>
  ) : (
    <div className={"status-tag tag-plain " + o.status}>{stLbl}</div>
  );

  const prod = products.find((p) => p.id === o.productId) || null;
  const vgs = prod?.variantGroups || [];
  const findVariantName = (val: string): string => {
    for (const g of vgs) {
      for (const it of (g.items || []) as Array<{ val?: unknown; name?: unknown }>) {
        if (it && (it as Record<string, unknown>).val === val) return (g.name as string) || "";
      }
    }
    return "";
  };
  const selVariants: Array<{ name?: string; value?: string }> =
    Array.isArray(o.selectedVariants) && o.selectedVariants.length
      ? (o.selectedVariants as Array<{ name?: string; value?: string }>)
      : [
          ...(o.size ? [{ name: findVariantName(o.size) || "Size", value: o.size }] : []),
          ...(o.color ? [{ name: findVariantName(o.color) || "Colour", value: o.color }] : []),
        ];

  const variantRows = selVariants.map((sv, i) => {
    let thumb = "";
    outer: for (const g of vgs) {
      for (const it of (g.items || []) as Array<Record<string, unknown>>) {
        if (it && it.val === sv.value && it.photo) { thumb = String(it.photo); break outer; }
      }
    }
    return (
      <div className="r variant-combo" key={i}>
        <span className="k" data-no-i18n="">{String(sv.name || "")}</span>
        <div className="v variant-combo-val">
          {/* The value is a bare text node in the original, not its own span.
              The quantity used to be repeated here beside every variant, which
              said the same number once per option and read as though each
              option had its own count. It is still on the card twice, as its
              own row and in the money breakdown. */}
          <div className="variant-combo-text" data-no-i18n="">
            {String(sv.value || "")}
          </div>
          {thumb ? (
            <div className="variant-thumb" onClick={(e) => { e.stopPropagation(); open([thumb], 0); }}>
              <img src={thumb} alt="" loading="lazy" />
            </div>
          ) : null}
        </div>
      </div>
    );
  });

  const fin = computeOrdFin(o);
  const codBanner = o.paymentType === "upfront" ? (
    <div className="cod-banner">
      <div className="icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </div>
      <div>
        <div className="t1">Cash on delivery</div>
        <div className="t2">Customer pays remaining balance on arrival</div>
      </div>
    </div>
  ) : null;

  const dis = frozen || busy;
  const disStyle = dis ? { opacity: 0.45, pointerEvents: "none" as const, cursor: "not-allowed" as const } : undefined;

  let actions: ReactElement;
  if (o.status === "delivered" || o.status === "failed") {
    actions = (
      <div className="actions">
        <button className="btn btn-lock" disabled>{o.status === "delivered" ? "✓ Delivered" : "Failed"}</button>
      </div>
    );
  } else if (o.status === "rejected") {
    actions = <div className="actions" />;
  } else {
    actions = (
      <div className="actions">
        {o.status === "approved" ? (
          <button className="btn btn-confirm" disabled={dis} style={disStyle} onClick={(e) => { e.stopPropagation(); onAdvance(o.id, "confirmed"); }}>Confirm order</button>
        ) : null}
        {o.status === "confirmed" ? (
          <button className="btn btn-deliver" disabled={dis} style={disStyle} onClick={(e) => { e.stopPropagation(); onAdvance(o.id, "delivered"); }}>Mark delivered</button>
        ) : null}
        {(o.status === "pending" || o.status === "approved" || o.status === "confirmed") ? (
          <button className="btn btn-fail" disabled={dis} style={disStyle} onClick={(e) => { e.stopPropagation(); onAdvance(o.id, "failed"); }}>Failed</button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={"order-card" + (isExp ? " expanded" : "") + (isNewBucket ? " new" : "")} data-status={o.status} data-id={o.id}>
      <div className="card-top" data-action="toggle" onClick={onToggle}>
        <HeroPhotos photos={photos} focus={prod ? { x: prod.coverFocusX, y: prod.coverFocusY } : undefined} />
        <div className="row-text">
          <div className="row-info">
            <div className="row-name-line">
              <span className="row-name">{o.customerName || "—"}</span>
              <span className="id-badge">{o.id}</span>
            </div>
            <div className="row-sub">{o.product}</div>
          </div>
          <div className="row-right">
            {o.status === "pending" ? statusTag : null}
            <div className="row-amt">{om(o.total)}</div>
            {o.status === "pending" ? null : statusTag}
          </div>
        </div>
      </div>
      <div className="detail-body">
        {buildOrdStepper(o.status)}
        <div className="section-lbl">Customer &amp; delivery</div>
        <div className="box">
          <div className="r"><span className="k">Name</span><span className="v">{o.customerName}</span></div>
          <div className="r"><span className="k">Address</span><span className="v">{o.address}</span></div>
          <div className="r"><span className="k">City</span><span className="v">{o.city}</span></div>
          <div className="r"><span className="k">Country</span><span className="v">{o.country}</span></div>
          <PhoneRow label="Phone" value={o.customerPhone} />
          {o.customerWhatsapp ? (
            <PhoneRow label={ar ? "واتساب أو رقم هاتف إضافي" : "WhatsApp or additional phone number"} value={o.customerWhatsapp} />
          ) : null}
        </div>
        <div className="section-lbl">Order</div>
        <div className="box">
          <div className="r"><span className="k">Order ID</span><span className="v mono">{o.id}</span></div>
          <div className="r"><span className="k">Product</span><span className="v">{o.product}</span></div>
          <div className="r"><span className="k">Product code</span><span className="v mono">{o.productCode || "—"}</span></div>
          {/* Reserve or instant delivery, read off the listing this order came
              from. Absent for a product listed before the choice existed. */}
          {prod?.fulfilment && (
            <div className="r">
              <span className="k">{ar ? "طريقة التسليم" : "Fulfilment"}</span>
              <span className="v"><FulfilmentBadge value={prod.fulfilment} ar={ar} size="sm" /></span>
            </div>
          )}
          <div className="r"><span className="k">Quantity</span><span className="v">{o.qty}</span></div>
          {variantRows}
        </div>
        <div className="section-lbl">Financials</div>
        <div className="fin-box">
          <div className="fin-row"><span className="k">Product price</span><span className="v">{om(o.price)}</span></div>
          <div className="fin-row"><span className="k">{ar ? "الكميه" : "Quantity"} ({o.qty})</span><span className="v">{om(o.price * o.qty)}</span></div>
          <div className="fin-row"><span className="k">Shipping</span><span className="v">{Number(o.shipping || 0) === 0 ? <span data-no-i18n="">{freeLbl()}</span> : om(o.shipping)}</span></div>
          <div className="fin-row"><span className="k">Delivery fee</span><span className="v">{Number(o.delivery || 0) === 0 ? <span data-no-i18n="">{freeLbl()}</span> : om(o.delivery)}</span></div>
          <div className="fin-row"><span className="k">Marketer commission <span className="pct">({fin.commissionPct}%)</span></span><span className="v neg">−{om(o.commission)}</span></div>
          <div className="fin-row"><span className="k">Platform fee{fin.platformFixed ? "" : <> <span className="pct">({fin.platformPct}%)</span></>}</span><span className="v neg">−{om(o.platformFee)}</span></div>
          <div className={"fin-total-extra" + (fin.extra ? " open-capable" : "")}>
            <div className="fin-total">
              <span className="k">Total</span>
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span className="v">{om(fin.net)}</span>
                {fin.extra ? (
                  <button className="fin-total-arrow" type="button" onClick={(e) => { e.stopPropagation(); (e.currentTarget.closest(".fin-total-extra") as HTMLElement)?.classList.toggle("open"); }} aria-label={fin.extra.label}>
                    <svg className="chev" width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ) : null}
              </span>
            </div>
            {fin.extra ? (
              <div className="fin-total-extra-body">
                <div className="fin-row" style={{ borderTop: "none", paddingTop: 0 }}>
                  <span className="k">{fin.extra.label}</span><span className="v">{om(fin.extra.value)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="more-info-box">
          <button className="more-info-toggle" type="button" onClick={(e) => { e.stopPropagation(); (e.currentTarget.closest(".more-info-box") as HTMLElement)?.classList.toggle("open"); }}>
            <span>More info</span>
            <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="more-info-body">
            <div className="status-box">
              <div className="status-row">
                <CheckIcon />
                <span>{o.marketerConfirmed ? "Marketer confirmed payment · " + o.marketerConfirmedDate : "Awaiting marketer confirmation · " + o.date}</span>
              </div>
              <div className="status-divider" />
              <div className="status-row"><CheckIcon /><span>Upfront fee paid</span><span className="val">{om(o.paymentAmount)}</span></div>
            </div>
            {codBanner}
          </div>
        </div>
        {o.notes ? <div className="notes-box"><b>Marketer note:</b> <span data-no-i18n="">{o.notes}</span></div> : null}
        {o.adminNotes ? <div className="notes-box"><b>{ar ? "ملاحظات الأدمن" : "Admin notes"}:</b> <span data-no-i18n="">{o.adminNotes}</span></div> : null}
        {actions}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17l-5-5" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OrdersPage({ onOpenNotifications: _onOpenNotifications }: { onOpenNotifications: () => void }) {
  const { orders, frozen, api, reloadOrders, reloadProducts } = useBusinessData();
  const ar = isAr();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failFor, setFailFor] = useState<string | null>(null);

  const counts = useMemo(() => bizOrdCounts(orders), [orders]);
  const newCount = counts.new;

  const filtered = useMemo(() => {
    const q = search.trim();
    const match = searchMatcher(q);
    return orders.filter((o) => {
      const mf =
        activeFilter === "all" ||
        (activeFilter === "new" && (o.status === "pending" || o.status === "approved")) ||
        (activeFilter === "failed" && (o.status === "failed" || o.status === "rejected")) ||
        (activeFilter !== "new" && activeFilter !== "failed" && o.status === activeFilter);
      const mq =
        !q ||
        match(
          [o.id, o.customerName, locSearchText(o.city, o.country, undefined), o.product, o.customerPhone]
            .filter(Boolean)
            .join(" "),
        );
      return mf && mq;
    });
  }, [orders, activeFilter, search]);

  const chipLabels = ar
    ? { all: "الكل", new: "جديد", confirmed: "تم التأكيد", delivered: "تم التسليم", failed: "فشل" }
    : { all: "All", new: "New", confirmed: "Confirmed", delivered: "Delivered", failed: "Failed" };

  const doAdvance = async (id: string, ns: "confirmed" | "delivered" | "failed") => {
    if (frozen) { alert(ar ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen"); return; }
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    if (ns === "failed") { setFailFor(id); return; }
    setBusyId(id);
    try {
      if (ns === "confirmed") await api.confirmOrder(o.dbId);
      else if (ns === "delivered") await api.markDelivered(o.dbId);
      await reloadProducts();
      await reloadOrders();
    } catch (e) {
      console.error("[Lateen] advance", e);
      alert((ar ? "فشلت العملية: " : "Action failed: ") + ((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmFail = async (note: string | null) => {
    const id = failFor;
    setFailFor(null);
    if (id === null || note === null) return;
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    setBusyId(id);
    try {
      await api.markFailed(o.dbId, note || null);
      await reloadProducts();
      await reloadOrders();
    } catch (e) {
      console.error("[Lateen] advance", e);
      alert((ar ? "فشلت العملية: " : "Action failed: ") + ((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="ord-top">
        <h1 className="ord-h1">Customer orders</h1>
        <div className="new-banner" id="new-banner" style={{ display: newCount > 0 ? "flex" : "none" }}>
          <div className="nb-dot" />
          <span id="new-banner-text">{newCount + " new"}</span>
        </div>
      </div>
      <div className="ord-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" strokeWidth="2" /><path d="M21 21l-4.3-4.3" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          type="text"
          id="search-input"
          placeholder="Search orders…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="ord-chips" data-no-i18n>
        {(["all", "new", "confirmed", "delivered", "failed"] as Filter[]).map((f) => {
          const n = counts[f] || 0;
          const active = activeFilter === f;
          const id = f === "new" ? "fc-new" : f === "failed" ? "fc-failed" : undefined;
          return (
            <div
              key={f}
              className={"fchip" + (active ? " active" : "")}
              id={id}
              data-f={f}
              onClick={() => setActiveFilter(f)}
            >
              {chipLabels[f]}
              {active ? ` (${n})` : ""}
              {f === "new" && n > 0 ? (
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#ef5566", marginLeft: 3, verticalAlign: "middle", animation: "blink 1.5s infinite" }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="list" id="orders-list">
        {filtered.length === 0 ? (
          <div className="empty-state">No orders found.</div>
        ) : (
          filtered.map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              isExp={expandedId === o.id}
              onToggle={() => setExpandedId((cur) => (cur === o.id ? null : o.id))}
              onAdvance={doAdvance}
              busy={busyId === o.id}
              frozen={frozen}
            />
          ))
        )}
      </div>
      {failFor !== null ? (
        <FailNoteModal onCancel={() => setFailFor(null)} onConfirm={confirmFail} />
      ) : null}
    </>
  );
}
