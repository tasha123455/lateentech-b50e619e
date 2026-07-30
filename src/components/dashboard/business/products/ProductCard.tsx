import { useEffect, useRef, useState } from "react";
import { isAr, freeLbl, isFreeVal, moneyParts } from "../lib/format";
import { cityLbl, categoryLabel, COUNTRY_FLAGS, COUNTRY_NAMES, COUNTRY_NAMES_AR } from "../lib/constants";
import type { Order, PendingActiveStub, Product } from "../lib/types";
import { useLightbox } from "../ui/Lightbox";
import { activeMarketerCount, effectiveQty, fmtMoney, LOW_STOCK_THRESHOLD, statusBadges } from "./productHelpers";

type ReviewEntry = { author: string; rating: number; text: string; photo: string; avatar: string };

function Money({ p, n }: { p: Product; n: unknown }) {
  const { amount, symbol, symbolFirst, spaced } = fmtMoney(p, n);
  if (symbolFirst) return <>{symbol}{amount}</>;
  if (spaced) return <>{amount} {symbol}</>;
  return <>{amount}{symbol}</>;
}

function countryLbl(code: string): string {
  if (code === "LY") return isAr() ? "ليبيا" : "Libya";
  return COUNTRY_NAMES[code] || code;
}

export function ProductCard({
  p, orders, pendingActiveStubs, reviews, onEdit, onToggleStatus, onDelete,
}: {
  p: Product;
  orders: Order[];
  pendingActiveStubs: PendingActiveStub[];
  reviews: ReviewEntry[];
  onEdit: (p: Product) => void;
  onToggleStatus: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  const ar = isAr();
  const [expanded, setExpanded] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [openFolds, setOpenFolds] = useState<Record<string, boolean>>({});
  const { open: openLightbox } = useLightbox();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touch = useRef<{ x: number; y: number; dragging: boolean }>({ x: 0, y: 0, dragging: false });

  useEffect(() => { setPhotoIdx(0); }, [p.photos]);

  const photos = (p.photos || []).filter(Boolean);
  const eq = effectiveQty(p);
  const badges = statusBadges(p);
  const nActive = activeMarketerCount(p, orders, pendingActiveStubs);
  const locked = nActive > 0;

  const dir = ar ? 1 : -1;
  const trackStyle = { transform: `translateX(${dir * photoIdx * 100}%)` };

  const toggleFold = (key: string) => setOpenFolds((s) => ({ ...s, [key]: !s[key] }));

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
      setPhotoIdx(next);
    }
  };

  const deleteTitle = locked
    ? (ar ? `لا يمكن الحذف — ${nActive} ${nActive === 1 ? "مسوّق نشط" : "مسوّقين نشطين"}` : `Can't delete — ${nActive} active marketer${nActive === 1 ? "" : "s"}`)
    : (ar ? "حذف" : "Delete");

  const primaryLabel = p.status === "active" ? (ar ? "إيقاف" : "Pause") : (ar ? "تفعيل" : "Activate");

  const zoneCodes = Object.keys(p.delivery || {});

  return (
    <div className={"mp-product-card" + (expanded ? " expanded" : "")} data-id={p.id}>
      <div className="mp-p-head" onClick={() => setExpanded((v) => !v)}>
        <div
          className="mp-p-thumb-wrap"
          onClick={(e) => { e.stopPropagation(); if (photos.length) openLightbox(photos, photoIdx); }}
        >
          <div className="mp-p-thumb" ref={wrapRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="mp-p-thumb-track" style={trackStyle}>
              {photos.length ? (
                photos.map((url, i) => (
                  <div className="mp-p-thumb-slide" key={i}>
                    <img src={url} alt={p.name} data-no-i18n="" loading="eager" decoding="async" />
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
                    onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }}
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
            {p.desc ? <p className="mp-p-desc-exp" data-no-i18n="">{p.desc}</p> : null}
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
            <div className="mp-details-code-pill">
              <span className="mp-code-label">{ar ? "كود المنتج" : "Product code"}</span>
              <span className="mp-code-val" data-no-i18n="">{p.code}</span>
            </div>
          </div>

          {/* Marketer info fold */}
          <div className="mp-fold-section mp-marketer-fold">
            <div className="mp-fold-head" onClick={(e) => { e.stopPropagation(); toggleFold("marketer"); }}>
              <div><div className="mp-fold-label">{ar ? "معلومات المسوّق" : "Marketer info"}</div></div>
              <svg className={"mp-fold-chevron" + (openFolds.marketer ? " open" : "")} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className={"mp-fold-body" + (openFolds.marketer ? " open" : "")}>
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
                <svg className={"mp-fold-chevron" + (openFolds.shipping ? " open" : "")} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className={"mp-fold-body" + (openFolds.shipping ? " open" : "")}>
                <div className="mp-fold-body-inner">
                  {zoneCodes.map((code) => {
                    const z = p.delivery[code] || {};
                    const cities = z.cities || {};
                    return (
                      <div className="mp-country-box" key={code}>
                        <div className="mp-country-head">
                          <span className="mp-cname">{COUNTRY_FLAGS[code] || "🌐"} {countryLbl(code)}</span>
                          <span className="mp-cship">
                            {ar ? "الشحن" : "Shipping"}<br />
                            <b>{isFreeVal(z.shipping) ? <span data-no-i18n="">{freeLbl()}</span> : <Money p={p} n={Number(z.shipping || 0)} />}</b>
                          </span>
                        </div>
                        {Object.entries(cities).map(([city, c]) => (
                          <div className="mp-city-row" key={city}>
                            <span><b>{cityLbl(city)}</b></span>
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
              <svg className={"mp-fold-chevron" + (openFolds.reviews ? " open" : "")} width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className={"mp-fold-body" + (openFolds.reviews ? " open" : "")}>
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
