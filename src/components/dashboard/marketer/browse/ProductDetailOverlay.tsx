import { useCallback, useEffect, useRef, useState } from "react";
import { ClampedText } from "../ui/ClampedText";

import { useMarketerData } from "../MarketerDataProvider";
import { platThreshold, platformFeeForPrice } from "../lib/constants";
import { isAr, moneyS, pctTxt } from "../lib/format";
import { detailVariantGroups } from "../lib/mappers";
import type { BrowseProduct, ProductReview } from "../lib/types";
import { Money } from "../ui/Money";
import { usePhotoLightbox } from "../ui/PhotoLightbox";
import { ReportModal } from "./ReportModal";
import { ReviewsSection } from "./Reviews";
import { ZonesSection } from "./ZonesSection";
import { pdT } from "./pdText";

const Chevron = ({ open, size = 14, style }: { open?: boolean; size?: number; style?: React.CSSProperties }) => (
  <svg
    className="pd-chev"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ ...(open ? { transform: "rotate(180deg)" } : null), ...style }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export function ProductDetailOverlay({
  productId, onClose, onOpenAffSoon,
}: {
  productId: string | null;
  onClose: () => void;
  onOpenAffSoon: () => void;
}) {
  const { products, toggleFavorite, api } = useMarketerData();
  const lightbox = usePhotoLightbox();
  const sheetRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const [galleryIdx, setGalleryIdx] = useState(0);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [variantPick, setVariantPick] = useState<Record<number, string>>({});
  const [activeMarketers, setActiveMarketers] = useState<string>("…");
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reportOpen, setReportOpen] = useState(false);

  const p = productId ? products.find((x) => x.id === productId) || null : null;
  const open = !!p;

  const loadReviews = useCallback(
    async (pid: string) => {
      if (!api.listProductReviews) return;
      try {
        const rows = await api.listProductReviews(pid);
        const avUrl = async (path: string) => {
          try {
            return api.avatarPublicUrl ? await api.avatarPublicUrl(path || "") : "";
          } catch {
            return "";
          }
        };
        const mapped = await Promise.all(
          (rows || []).map(async (r) => ({
            id: r.id,
            author: r.author_name || "Marketer",
            rating: Number(r.rating) || 0,
            text: r.comment || "",
            ts: new Date(r.created_at).getTime(),
            photo: r.photo_url || "",
            avatar: r.avatar_path ? await avUrl(r.avatar_path) : "",
          })),
        );
        setReviews(mapped);
      } catch (e) {
        console.warn("[Lateen] loadReviews", e);
      }
    },
    [api],
  );

  // Reset the per-product view state and pull its reviews / marketer count.
  useEffect(() => {
    if (!productId) return;
    setGalleryIdx(0);
    setZonesOpen(false);
    setStockOpen(false);
    setVariantPick({});
    setReviews([]);
    setActiveMarketers("…");
    setReportOpen(false);
    if (sheetRef.current) sheetRef.current.scrollTop = 0;

    void loadReviews(productId);

    let cancelled = false;
    if (api.activeMarketersCounts) {
      api
        .activeMarketersCounts([productId])
        .then((m) => { if (!cancelled) setActiveMarketers(String(m[productId] || 0)); })
        .catch(() => { if (!cancelled) setActiveMarketers("0"); });
    }
    return () => { cancelled = true; };
  }, [productId, api, loadReviews]);

  // The sheet is modal.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  if (!p) return <div className="ov"><div className="ob" /><div className="ds" /></div>;

  const t = pdT();
  const s = p.cur.s;
  const cc = p.cur.code;
  const earn = Number(p.commUnit) > 0 ? Number(p.commUnit) : (p.pr * p.pct) / 100;
  const plat = platformFeeForPrice(p.pr, p.market);
  const fee = earn + plat;
  const platPct = p.pr > 0 ? Math.round((plat / p.pr) * 100) : 0;
  const photos = (p.ph || []).filter(Boolean);
  const low = p.q > 0 && p.q <= 20;
  const vgList = detailVariantGroups(p);

  const onGalleryScroll = () => {
    const tr = galleryRef.current;
    if (!tr) return;
    const w = tr.clientWidth || 1;
    setGalleryIdx(Math.round(Math.abs(tr.scrollLeft) / w));
  };

  const share = async () => {
    const url = (location.origin || "") + "/p/" + p.id;
    const text = p.n + " — " + moneyS(p.pr, p.cur.s, p.cur.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: p.n, text, url });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text + "\n" + url);
      alert(isAr() ? "تم نسخ رابط المنتج" : "Product link copied");
    } catch {
      alert(text + "\n" + url);
    }
  };

  const shareIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );

  return (
    <div className={"ov" + (open ? " open" : "")}>
      <div className="ob" onClick={onClose} />
      <div className="ds" ref={sheetRef}>
        <div className="pd-hdr">
          <button className="pd-icbtn" onClick={onClose} aria-label="back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="pd-hdr-ttl">{t.title}</div>
          <button className="pd-icbtn" onClick={() => void share()} aria-label="share">{shareIcon}</button>
        </div>

        <div className="pd-card">
          <div className="pd-hd-row">
            <div className="pd-hd-name" data-no-i18n>{p.n}</div>
            {!!p.code && (
              <div className="pd-hd-code">
                <span className="pd-hd-code-lbl">{t.code}:</span> <span data-no-i18n>{p.code}</span>
              </div>
            )}
          </div>
        </div>

        {photos.length ? (
          <div className="pd-gallery">
            <div className="pd-gallery-track" ref={galleryRef} onScroll={onGalleryScroll}>
              {photos.map((u, i) => (
                <div className="pd-gallery-slide" key={u + i} onClick={() => lightbox.open(photos, i)}>
                  <img src={u} alt="" loading="eager" />
                </div>
              ))}
            </div>
            {photos.length > 1 && (
              <div className="pd-gallery-dots">
                {photos.map((u, i) => (
                  <span key={u + i} className={"pd-gd-dot" + (i === galleryIdx ? " on" : "")} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="pd-gallery pd-gallery-empty">
            <div className="pd-gallery-slide" style={{ fontSize: 80 }}>{p.flag}</div>
          </div>
        )}

        {!!p.desc && (
          <>
            <div className="pd-sec-ttl">{t.desc}</div>
            <ClampedText className="pd-desc" text={p.desc} />
          </>
        )}

        <div className="pd-earn">
          <div className="pd-earn-lbl">{t.earnLbl}</div>
          <div className="pd-earn-val"><Money n={earn} sym={s} code={cc} short /></div>
          <div className="pd-earn-divider" />
          <div className="pd-earn-rows">
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">{t.commission}</span>
              <span className="pd-earn-row-val pu">{pctTxt(p.pct)}%</span>
            </div>
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">{t.platFee}</span>
              <span className="pd-earn-row-val">
                {p.pr > platThreshold(p.market) ? platPct + "%" : <Money n={plat} sym={s} code={cc} short />}
              </span>
            </div>
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">{t.deposit}</span>
              <span className="pd-earn-row-val"><Money n={fee} sym={s} code={cc} short /></span>
            </div>
          </div>
        </div>

        <div className="pd-row">
          <div className="pd-row-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div className="pd-row-lbl">{t.price}</div>
          <div className="pd-row-val"><Money n={p.pr} sym={s} code={cc} short /></div>
        </div>

        {vgList.map((g, gi) => {
          const hasPh = g.items.some((x) => x.photo);
          return (
            <div className="pd-variant" key={g.name + gi}>
              <div className="pd-variant-lbl" data-no-i18n>{g.name || ""}</div>
              <div className="pd-variant-sel-wrap">
                <select
                  className="pd-variant-sel"
                  data-no-i18n
                  value={variantPick[gi] || ""}
                  onChange={(e) => setVariantPick((prev) => ({ ...prev, [gi]: e.target.value }))}
                >
                  <option value="">{(isAr() ? "اختر" : "Select") + " " + (g.name || "")}</option>
                  {g.items.map((x) => {
                    const q = typeof x.qty === "number" && Number.isFinite(x.qty) ? x.qty : null;
                    const oos = q === 0;
                    return (
                      <option key={x.val} value={x.val} disabled={oos}>
                        {x.val}
                        {oos ? ` · ${isAr() ? "غير متوفر" : "out of stock"}` : ""}
                      </option>
                    );
                  })}
                </select>
                <Chevron />
              </div>
              {hasPh && (
                <div className="pd-variant-thumbs">
                  {g.items.map((x, ii) => {
                    if (!x.photo) return null;
                    const q = typeof x.qty === "number" && Number.isFinite(x.qty) ? x.qty : null;
                    const oos = q === 0;
                    return (
                      <div
                        key={x.val + ii}
                        className={"pd-vth" + (oos ? " oos" : "") + (variantPick[gi] === x.val ? " on" : "")}
                        onClick={
                          oos
                            ? undefined
                            : (e) => {
                                e.stopPropagation();
                                setVariantPick((prev) => ({ ...prev, [gi]: x.val }));
                                lightbox.openOne(x.photo);
                              }
                        }
                      >
                        <img src={x.photo} alt="" />
                        <div className="pd-vth-lbl" data-no-i18n>{x.val}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <ZonesSection
          d={p.d}
          sym={s}
          code={cc}
          open={zonesOpen}
          onToggle={() => setZonesOpen((v) => !v)}
        />

        <div
          className={"pd-row" + (p.vg && p.vg.length ? " pd-row-tap" : "")}
          onClick={p.vg && p.vg.length ? () => setStockOpen((v) => !v) : undefined}
        >
          <div className="pd-row-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            </svg>
          </div>
          <div className="pd-row-lbl">{t.stock}</div>
          <div className={"pd-row-val " + (low ? "am" : "")}>
            {t.pieces(p.q)}
            {low ? " ⚠" : ""}
            {p.vg && p.vg.length ? (
              <Chevron open={stockOpen} style={{ marginInlineStart: 4, verticalAlign: "middle" }} />
            ) : null}
          </div>
        </div>

        {stockOpen && p.vg && p.vg.length > 0 && (
          <div className="pd-zones">
            {p.vg.map((g, gi) => (
              <div className="pd-zone" key={g.name + gi}>
                <div className="pd-zone-hdr" style={{ cursor: "default" }}>
                  <div className="pd-zone-name" data-no-i18n>{g.name || ""}</div>
                </div>
                <div className="pd-zone-cities">
                  {(g.items || []).map((it) => (
                    <div className="pd-zone-city" key={it.val}>
                      <div className="pd-zone-city-name" data-no-i18n>{it.val || ""}</div>
                      <div className="pd-zone-city-val">
                        <span className="pd-zone-city-lbl">{isAr() ? "الكميه" : "Quantity"}</span>{" "}
                        {t.pieces(Number(it.qty) || 0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pd-row">
          <div className="pd-row-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="pd-row-lbl">{isAr() ? "المسوقون النشطون" : "Active marketers"}</div>
          <div className="pd-row-val">{activeMarketers}</div>
        </div>

        <ReviewsSection
          productId={p.id}
          reviews={reviews}
          onReload={() => void loadReviews(p.id)}
          onReport={() => setReportOpen(true)}
        />

        <div className="pd-actions">
          <button className="pd-share-btn" onClick={() => void share()} aria-label="share">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          <button className="pd-aff-btn" onClick={onOpenAffSoon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            {t.affBtn} <span className="soon-badge">{t.soonMsg}</span>
          </button>
          <button
            className={"pd-save-btn" + (p.sv ? " sv" : "")}
            onClick={() => void toggleFavorite(p.id)}
            aria-label="save"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={p.sv ? "#e07070" : "none"} stroke={p.sv ? "#e07070" : "currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
          </button>
        </div>
      </div>

      {reportOpen && (
        <ReportModal productId={p.id} businessId={p.bid || ""} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}

export type { BrowseProduct };
