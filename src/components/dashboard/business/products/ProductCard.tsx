import { useEffect, useRef, useState } from "react";
import { ClampedText } from "@/components/dashboard/marketer/ui/ClampedText";
import { EtaBadge } from "@/components/shared/EtaBadge";
import { FulfilmentBadge } from "@/components/shared/FulfilmentBadge";
import { coverStyle } from "@/lib/coverFocus";
import { useAccordion } from "@/lib/useAccordion";
import { isAr, freeLbl, isFreeVal, moneyParts } from "../lib/format";
import { cityLbl, categoryLabel, COUNTRY_FLAGS, COUNTRY_NAMES, COUNTRY_NAMES_AR } from "../lib/constants";
import type { Order, PendingActiveStub, Product } from "../lib/types";
import { useLightbox } from "../ui/Lightbox";
import { activeMarketerCount, effectiveQty, fmtMoney, LOW_STOCK_THRESHOLD, statusBadges } from "./productHelpers";
import { AnalyticsButton, AnalyticsPanel, useAnalyticsState } from "./ProductAnalytics";

type ReviewEntry = { author: string; rating: number; text: string; photo: string; avatar: string };

function Money({ p, n }: { p: Product; n: unknown }) {
  const { amount, symbol, symbolFirst, spaced } = fmtMoney(p, n);
  if (symbolFirst) return <><span className="cur-sym">{symbol}</span>{amount}</>;
  if (spaced) return <>{amount} <span className="cur-sym">{symbol}</span></>;
  return <>{amount}<span className="cur-sym">{symbol}</span></>;
}

function countryLbl(code: string): string {
  if (code === "LY") return isAr() ? "ليبيا" : "Libya";
  return COUNTRY_NAMES[code] || code;
}

export function ProductCard({
  p, orders, pendingActiveStubs, reviews, onEdit, onToggleStatus, onDelete, focused = false,
  expanded, onToggle,
}: {
  p: Product;
  orders: Order[];
  pendingActiveStubs: PendingActiveStub[];
  reviews: ReviewEntry[];
  onEdit: (p: Product) => void;
  onToggleStatus: (p: Product) => void;
  onDelete: (p: Product) => void;
  /** Scrolled to on mount — an admin followed a report here. */
  focused?: boolean;
  /* Owned by the list: opening one product folds the last one away. */
  expanded: boolean;
  onToggle: () => void;
}) {
  const ar = isAr();
  const [photoIdx, setPhotoIdx] = useState(0);
  const folds = useAccordion();
  const { open: openLightbox } = useLightbox();
  const an = useAnalyticsState();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touch = useRef<{ x: number; y: number; dragging: boolean }>({ x: 0, y: 0, dragging: false });

  useEffect(() => { setPhotoIdx(0); setSlid(false); }, [p.photos]);

  const photos = (p.photos || []).filter(Boolean);
  const eq = effectiveQty(p);
  const badges = statusBadges(p);
  const nActive = activeMarketerCount(p, orders, pendingActiveStubs);
  const locked = nActive > 0;

  const dir = ar ? 1 : -1;
  const [slid, setSlid] = useState(false);
  const trackStyle = slid ? { transform: `translateX(${dir * photoIdx * 100}%)` } : undefined;

  const toggleFold = (key: string) => folds.toggle(key);

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dragging: true };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current.dragging) return;
    touch.current.dragging = false;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40 && photos.length > 1) {
      const fwd = ar ? dx > 0 : dx < 0;
      const next = fwd ? Math.min(photoIdx + 1, photos.length - 1) : Math.max(photoIdx - 1, 0);
      setPhotoIdx(next); setSlid(true);
    }
  };

  const deleteTitle = locked
    ? (ar ? `لا يمكن الحذف — ${nActive} ${nActive === 1 ? "مسوّق نشط" : "مسوّقين نشطين"}` : `Can't delete — ${nActive} active marketer${nActive === 1 ? "" : "s"}`)
    : (ar ? "حذف" : "Delete");

  const primaryLabel = p.status === "active" ? (ar ? "إيقاف" : "Pause") : (ar ? "تفعيل" : "Activate");

  const zoneCodes = Object.keys(p.delivery || {});

  // Scroll the reported product into view once, on arrival.
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focused || !cardRef.current) return;
    cardRef.current.scrollIntoView({ block: "center" });
  }, [focused]);

  return (
    <div className={"mp-product-card" + (expanded ? " expanded" : "")} data-id={p.id} ref={cardRef}>
      <div className="mp-p-head" onClick={onToggle}>
        <div
          className="mp-p-thumb-wrap"
          id={"mp-thumb-wrap-" + p.id}
          onClick={(e) => { e.stopPropagation(); if (photos.length) openLightbox(photos, photoIdx); }}
        >
          <div className="mp-p-thumb" id={"mp-thumb-" + p.id} ref={wrapRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="mp-p-thumb-track" id={"mp-thumb-track-" + p.id} style={trackStyle}>
              {photos.length ? (
                photos.map((url, i) => (
                  <div className="mp-p-thumb-slide" key={i}>
                    {/* The cover keeps the owner's own framing; the
                        photos behind it were never framed. */}
                    <img
                      src={url}
                      alt={p.name}
                      data-no-i18n=""
                      loading="eager"
                      decoding="async"
                      style={i === 0 ? coverStyle(p.coverFocusX, p.coverFocusY) : undefined}
                    />
                  </div>
                ))
              ) : (
                <div className="mp-p-thumb-slide mp-p-thumb-empty">{p.currency?.flag || "📦"}</div>
              )}
            </div>
            {p.category ? <span className="mp-thumb-category" data-no-i18n="">{categoryLabel(p.category)}</span> : null}
            {photos.length > 1 ? (
              <div className="mp-thumb-dots">
                {photos.map((_, i) => (
                  <span
                    key={i}
                    className={"mp-thumb-dot" + (i === photoIdx ? " active" : "")}
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); setSlid(true); }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mp-p-info">
          <p className="mp-p-name-collapsed" data-no-i18n="">{p.name}</p>
          <span className="mp-p-price-collapsed"><Money p={p} n={p.price} /></span>
        </div>
        <div className="mp-p-status-strip">
          {badges.map((b, i) => (
            <span className={"mp-status-pill " + b.cls} key={i}><span className="mp-dot-ind" />{b.label}</span>
          ))}
        </div>
        <div className="mp-p-code-corner">
          <span className="mp-code-label">{ar ? "كود المنتج" : "Product code"}</span>
          <span className="mp-code-val" data-no-i18n="">{p.code}</span>
        </div>
        <div className="mp-p-chevron">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="mp-p-info-expanded">
          <div className="mp-p-info-exp-inner">
            <div className="mp-p-name-price-row">
              <p className="mp-p-name-exp" data-no-i18n="">{p.name}</p>
              <span className="mp-p-price-exp"><Money p={p} n={p.price} /></span>
            </div>
            {p.desc ? <ClampedText className="mp-p-desc-exp" text={p.desc} /> : null}
          </div>
        </div>
      </div>

      {eq === 0 ? (
        <div className="mp-oos-banner">
          {ar ? "أكتب الكميه لعرض منتجك للمسوّقين" : "Enter the quantity to show your product to marketers"}
        </div>
      ) : null}

      <div className="mp-p-details">
        <div className="mp-p-details-inner">
          <div className="mp-divider" />
          <div className="mp-details-top-row">
            {/* Inside the pill with the code, not beside it. Sitting outside,
                the pair had the Analytics button for company on a row that
                could not hold all three, so the badge dropped to a line of its
                own underneath and read as a loose label attached to nothing.
                In the pill it cannot come apart from the code: they are the
                two facts about the listing — which product this is, and how
                it reaches the customer. */}
            <div className="mp-details-code-pill">
              <span className="mp-code-label">{ar ? "كود المنتج" : "Product code"}</span>
              <span className="mp-code-val" data-no-i18n="">{p.code}</span>
              <FulfilmentBadge value={p.fulfilment} ar={ar} size="sm" />
            </div>
            <AnalyticsButton pid={p.id} open={an.open} onToggle={() => an.setOpen((v) => !v)} />
          </div>
          <AnalyticsPanel p={p} orders={orders} open={an.open} sel={an.sel} setSel={an.setSel} />

          {/* Marketer info fold */}
          <div className="mp-fold-section mp-marketer-fold">
            <div className="mp-fold-head" onClick={(e) => { e.stopPropagation(); toggleFold("marketer"); }}>
              <div><div className="mp-fold-label">{ar ? "معلومات المسوّق" : "Marketer info"}</div></div>
              <svg className={"mp-fold-chevron" + (folds.isOpen("marketer") ? " open" : "")} id={"mp-chev-marketer-" + p.id} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className={"mp-fold-body" + (folds.isOpen("marketer") ? " open" : "")} id={"mp-fold-marketer-" + p.id}>
              <div className="mp-fold-body-inner">
                <div className="mp-mb-grid">
                  <div className="mp-mb-tile"><div className="l">{ar ? "عمولة المسوّق" : "Marketer fee"}</div><div className="v">{`${p.commPct || 0}%`}</div></div>
                  <div className="mp-mb-tile"><div className="l">{ar ? "أرباح البيع الواحد" : "Earnings per sale"}</div><div className="v"><Money p={p} n={p.commFixed || 0} /></div></div>
                  <div className="mp-mb-tile"><div className="l">{ar ? "المسوّقون النشطون" : "Active marketers"}</div><div className="v">{nActive}</div></div>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping fold */}
          {zoneCodes.length ? (
            <div className="mp-fold-section">
              <div className="mp-fold-head" onClick={(e) => { e.stopPropagation(); toggleFold("shipping"); }}>
                <div>
                  <div className="mp-fold-label">{ar ? "الشحن والتوصيل" : "Shipping & delivery"}</div>
                  <div className="mp-fold-sub">
                    {ar
                      ? (zoneCodes.length === 1 ? "دولة واحده" : zoneCodes.length === 2 ? "دولتين" : `${zoneCodes.length} دول`)
                      : `${zoneCodes.length} ${zoneCodes.length === 1 ? "country" : "countries"}`}
                  </div>
                </div>
                <svg className={"mp-fold-chevron" + (folds.isOpen("shipping") ? " open" : "")} id={"mp-chev-shipping-" + p.id} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className={"mp-fold-body" + (folds.isOpen("shipping") ? " open" : "")} id={"mp-fold-shipping-" + p.id}>
                <div className="mp-fold-body-inner">
                  {zoneCodes.map((code) => {
                    const z = p.delivery[code] || {};
                    const cities = z.cities || {};
                    return (
                      <div className="mp-country-box" key={code}>
                        {/* How long it takes rides the place it applies to,
                            the way it does on an order card and on the public
                            link: the country always, a city only where this
                            shop gave that city a time of its own. Silence on a
                            city row means it keeps the country's. */}
                        <div className="mp-country-head">
                          <span className="mp-cname">
                            {COUNTRY_FLAGS[code] || "🌐"} {countryLbl(code)}
                            <EtaBadge eta={z.eta} ar={ar} />
                          </span>
                          <span className="mp-cship">
                            {ar ? "الشحن" : "Shipping"}<br />
                            <b>{isFreeVal(z.shipping) ? <span data-no-i18n="">{freeLbl()}</span> : <Money p={p} n={Number(z.shipping || 0)} />}</b>
                          </span>
                        </div>
                        {Object.entries(cities).map(([city, c]) => (
                          <div className="mp-city-row" key={city}>
                            <span>
                              <b>{cityLbl(city)}</b>
                              <EtaBadge eta={(c as { eta?: unknown })?.eta} ar={ar} />
                            </span>
                            <span className="mp-dfee">
                              {ar ? "التوصيل" : "Delivery"} <b>{isFreeVal(c?.delivery) ? <span data-no-i18n="">{freeLbl()}</span> : <Money p={p} n={Number(c?.delivery || 0)} />}</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* Reviews fold */}
          <div className="mp-fold-section">
            <div className="mp-fold-head" onClick={(e) => { e.stopPropagation(); toggleFold("reviews"); }}>
              <div>
                <div className="mp-fold-label">{ar ? "التقييمات" : "Reviews"}</div>
                <div className="mp-fold-sub">
                  {reviews.length
                    ? `${(reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length).toFixed(1)} ★ · ${reviews.length} ${ar ? "تقييم" : "reviews"}`
                    : (ar ? "لا توجد تقييمات بعد" : "No reviews yet")}
                </div>
              </div>
              <svg className={"mp-fold-chevron" + (folds.isOpen("reviews") ? " open" : "")} id={"mp-chev-reviews-" + p.id} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className={"mp-fold-body" + (folds.isOpen("reviews") ? " open" : "")} id={"mp-fold-reviews-" + p.id}>
              <div className="mp-fold-body-inner">
                {reviews.length ? reviews.map((r, i) => {
                  const stars = Math.max(0, Math.min(5, Number(r.rating) || 0));
                  const initials = (r.author || "M").trim().charAt(0).toUpperCase();
                  return (
                    <div className="mp-review-item" key={i}>
                      <div className="mp-review-top">
                        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          {r.avatar ? (
                            <span className="avatar" style={{ width: 20, height: 20, fontSize: 9, flexShrink: 0, overflow: "hidden", padding: 0 }}>
                              <img src={r.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block", borderRadius: "inherit" }} />
                            </span>
                          ) : (
                            <span className="avatar" style={{ width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>{initials}</span>
                          )}
                          <span className="mp-review-name">{r.author ? <span data-no-i18n="">{r.author}</span> : "Marketer"}</span>
                        </span>
                        <span className="mp-review-stars">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span>
                      </div>
                      {r.text ? <div className="mp-review-text" data-no-i18n="">{r.text}</div> : null}
                      {r.photo ? (
                        <div
                          style={{ marginTop: 6, width: 56, height: 56, borderRadius: 10, overflow: "hidden", cursor: "pointer", border: "1px solid var(--mp-border)" }}
                          onClick={(e) => { e.stopPropagation(); openLightbox([r.photo], 0); }}
                        >
                          <img src={r.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      ) : null}
                    </div>
                  );
                }) : (
                  <div className="mp-empty-note">
                    {ar ? "ستظهر التقييمات هنا بعد نشر المنتج وبيعه." : "Reviews will show up here once this product is published and sold."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mp-action-row">
            <div className="mp-icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 5l4 4L7 21H3v-4L15 5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            </div>
            <div className={"mp-action-btn " + (p.status === "active" ? "warn" : "primary")} onClick={(e) => { e.stopPropagation(); onToggleStatus(p); }}>
              {primaryLabel}
            </div>
            <div
              className="mp-icon-btn mp-danger"
              style={locked ? { opacity: 0.4 } : undefined}
              title={deleteTitle}
              onClick={(e) => { e.stopPropagation(); onDelete(p); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 7h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M9 7V4.5h6V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><rect x="4" y="7" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" /></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
