import { useEffect, useRef, useState } from "react";
import { ClampedText } from "@/components/dashboard/marketer/ui/ClampedText";

import { ReviewsList } from "@/components/dashboard/marketer/browse/Reviews";
import { ZonesSection } from "@/components/dashboard/marketer/browse/ZonesSection";
import type { ProductReview, Zone } from "@/components/dashboard/marketer/lib/types";

import { useAdminData } from "../AdminDataProvider";
import { dateFull, dispPhone } from "../lib/format";
import { effectiveQty } from "../lib/employees";
import type { ProductDetail, VariantGroup } from "../lib/types";
import { CurMoney } from "../ui/Money";
import { useLightbox } from "../ui/Lightbox";
import { goToAccount } from "../users/UserCard";

/** The raw `delivery` column into the shape ZonesSection reads — the same
 *  reshaping dbToBrowse does for the marketer. */
function toZones(delivery: ProductDetail["product"] extends null ? never : NonNullable<ProductDetail["product"]>["delivery"]): Record<string, Zone> {
  const out: Record<string, Zone> = {};
  Object.entries(delivery || {}).forEach(([code, z]) => {
    out[code] = { cities: [], c: {}, shipping: 0, delivery: 0 };
    Object.entries((z && z.cities) || {}).forEach(([city, v]) => {
      out[code].c[city] = { s: Number(v.shipping) || 0, d: Number(v.delivery) || 0 };
      out[code].cities.push(city);
      out[code].shipping = Number(v.shipping) || 0;
      out[code].delivery = Number(v.delivery) || 0;
    });
  });
  return out;
}

const hasQty = (v: unknown): boolean => {
  const o = v as { qty?: unknown };
  return !!o && typeof o === "object" && o.qty !== undefined && o.qty !== null && o.qty !== "" && Number.isFinite(Number(o.qty));
};

/** Same derivation the marketer's browse card uses: real variant_groups when
    the business set them up, else Size/Colour built from sizes/colors. */
function buildVariantGroups(p: NonNullable<ProductDetail["product"]>): VariantGroup[] {
  const toItem = (v: unknown) => {
    if (typeof v === "string") return { val: v, photo: "", qty: null };
    const o = (v || {}) as { val?: string; photo?: string; qty?: unknown };
    return { val: o.val || "", photo: o.photo || "", qty: hasQty(v) ? Math.max(0, Number(o.qty)) : null };
  };
  const groups = p.variant_groups || [];
  if (groups.length) {
    return groups
      .map((g) => ({ name: g.name || "", items: (g.items || []).map(toItem).filter((x) => x.val) }))
      .filter((g) => g.items.length);
  }
  return [
    ...(p.sizes && p.sizes.length ? [{ name: "Size", items: p.sizes.map(toItem) }] : []),
    ...(p.colors && p.colors.length ? [{ name: "Colour", items: p.colors.map(toItem) }] : []),
  ];
}

const Chev = ({ open }: { open: boolean }) => (
  <svg
    className={"pd-chev" + (open ? " open" : "")}
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const EyeOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.77 21.77 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.77 21.77 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const RowIcon = ({ children }: { children: React.ReactNode }) => (
  <div className="pd-row-ic">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  </div>
);

export function ProductDetailOverlay({
  productId, onClose, status, onToggleHidden, onDelete,
}: {
  productId: string | null;
  onClose: () => void;
  /** The row's status: "active", "paused" or "hidden". Shown on its own row and
   *  used for the Hide / Unhide label. */
  status?: string | null;
  onToggleHidden?: (id: string, next: "active" | "hidden") => void;
  onDelete?: (id: string, name: string) => void;
}) {
  const { api } = useAdminData();
  const lightbox = useLightbox();
  const galleryRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [zonesOpen, setZonesOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [variantPick, setVariantPick] = useState<Record<number, string>>({});
  const [activeMarketers, setActiveMarketers] = useState("…");
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  useEffect(() => {
    if (!productId) return;
    setDetail(null);
    setError("");
    setGalleryIdx(0);
    setZonesOpen(false);
    setStockOpen(false);
    setOwnerOpen(false);
    setVariantPick({});
    setActiveMarketers("…");
    setReviews([]);

    let cancelled = false;
    (async () => {
      try {
        const res = (await api.admin.getProductDetail(productId)) as ProductDetail;
        if (cancelled) return;
        setDetail(res);
      } catch (e) {
        console.error("[admin] product detail", e);
        if (!cancelled) setError((e as Error)?.message || "");
      }
    })();

    // Reviews, mapped the same way the marketer's sheet maps them.
    (async () => {
      try {
        const rows = await api.listProductReviews(productId);
        const avUrl = async (path: string) => {
          try {
            return await api.avatarPublicUrl(path || "");
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
        if (!cancelled) setReviews(mapped);
      } catch (e) {
        console.error("[admin] product reviews", e);
      }
    })();

    // Live active-marketers count (the same shared RPC the marketer sheet uses).
    try {
      api.activeMarketersCounts([productId])
        .then((m) => { if (!cancelled) setActiveMarketers(String(m[productId] || 0)); })
        .catch(() => { if (!cancelled) setActiveMarketers("0"); });
    } catch {
      /* ignore */
    }
    return () => { cancelled = true; };
  }, [productId, api]);

  const open = !!productId;
  const p = detail?.product || null;
  const owner = detail?.owner || {};
  const hidden = status === "hidden";
  const paused = status === "paused";

  let body: React.ReactNode;
  if (error) {
    body = <div className="adm-empty">Failed to load: {error}</div>;
  } else if (!detail) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!p) {
    body = <div className="adm-empty">Product not found.</div>;
  } else {
    const cur = (p.currency && p.currency.symbol) || "$";
    const curCode = (p.currency && p.currency.code) || "";
    const photos = Array.isArray(p.photos) ? p.photos : [];
    const commVal = p.comm_mode === "fixed"
      ? <CurMoney sym={cur} code={curCode} n={p.comm_fixed} />
      : Number(p.comm_pct || 0) + "%";
    const earnAmt = p.comm_mode === "fixed"
      ? Number(p.comm_fixed || 0)
      : (Number(p.price || 0) * Number(p.comm_pct || 0)) / 100;
    const platFee = Number(p.platform_fee || 0);
    const deposit = earnAmt + platFee;

    const vg = buildVariantGroups(p);
    const zones = toZones(p.delivery);
    const qty = effectiveQty(p);
    const low = qty > 0 && qty <= 20;

    const ownerName = owner.business_name || owner.full_name || p.biz_name || "Unknown";
    const ownerOther =
      owner.business_name && owner.full_name && owner.business_name !== owner.full_name ? owner.full_name : "";

    body = (
      <>
        <div className="pd-card">
          <div className="pd-hd-row">
            <div className="pd-hd-name" data-no-i18n>{p.name}</div>
            <div className="pd-hd-code">
              <span className="pd-hd-code-lbl">Product code:</span> <span data-no-i18n>{p.code || "—"}</span>
            </div>
          </div>
        </div>

        {photos.length ? (
          <div className="pd-gallery">
            <div
              className="pd-gallery-track"
              ref={galleryRef}
              onScroll={() => {
                const tr = galleryRef.current;
                if (!tr) return;
                const w = tr.clientWidth || 1;
                setGalleryIdx(Math.round(Math.abs(tr.scrollLeft) / w));
              }}
            >
              {photos.map((u, i) => (
                <div className="pd-gallery-slide" key={u + i} onClick={() => lightbox.open(u)}>
                  <img src={u} alt="" />
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
            <div className="pd-gallery-slide" style={{ fontSize: 64 }}>📦</div>
          </div>
        )}

        {!!p.description && (
          <>
            <div className="pd-sec-ttl">Description</div>
            <ClampedText className="pd-desc" text={String(p.description)} />
          </>
        )}

        <div className="pd-earn">
          <div className="pd-earn-lbl">Marketer's earning per sale</div>
          <div className="pd-earn-val"><CurMoney sym={cur} code={curCode} n={earnAmt} /></div>
          <div className="pd-earn-divider" />
          <div className="pd-earn-rows">
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">Commission</span>
              <span className="pd-earn-row-val pu">{commVal}</span>
            </div>
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">Platform fee</span>
              <span className="pd-earn-row-val"><CurMoney sym={cur} code={curCode} n={platFee} /></span>
            </div>
            <div className="pd-earn-row">
              <span className="pd-earn-row-lbl">Deposit (with platform fee)</span>
              <span className="pd-earn-row-val"><CurMoney sym={cur} code={curCode} n={deposit} /></span>
            </div>
          </div>
        </div>

        <div className="pd-row">
          <RowIcon>
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </RowIcon>
          <div className="pd-row-lbl">Product price</div>
          <div className="pd-row-val"><CurMoney sym={cur} code={curCode} n={p.price} /></div>
        </div>

        {vg.map((g, gi) => {
          const hasPh = g.items.some((x) => x.photo);
          return (
          <div className="pd-variant" key={g.name + gi}>
            <div className="pd-variant-lbl" data-no-i18n>{g.name}</div>
            <div className="pd-variant-sel-wrap">
              <select
                className="pd-variant-sel"
                data-no-i18n
                value={variantPick[gi] ?? ""}
                onChange={(e) => setVariantPick((prev) => ({ ...prev, [gi]: e.target.value }))}
              >
                {g.items.map((x) => {
                  const q = x.qty;
                  const oos = q === 0;
                  const suffix = q === null ? "" : q > 0 ? ` · ${q} left` : " · out of stock";
                  return (
                    <option key={x.val} value={x.val} disabled={oos}>
                      {x.val}
                      {suffix}
                    </option>
                  );
                })}
              </select>
              <svg className="pd-variant-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {/* The swatches the marketer's sheet has shown all along. Without
                them an admin looking at a reported product could read the
                variant names but never see what they actually look like,
                which is usually the thing being complained about. */}
            {hasPh && (
              <div className="pd-variant-thumbs">
                {g.items.map((x, ii) => {
                  if (!x.photo) return null;
                  const oos = x.qty === 0;
                  return (
                    <div
                      key={x.val + ii}
                      className={"pd-vth" + (oos ? " oos" : "") + (variantPick[gi] === x.val ? " on" : "")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setVariantPick((prev) => ({ ...prev, [gi]: x.val }));
                        lightbox.open(x.photo);
                      }}
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
          d={zones}
          sym={cur}
          code={curCode}
          open={zonesOpen}
          onToggle={() => setZonesOpen((v) => !v)}
        />

        <div
          className={"pd-row" + (vg.length ? " pd-row-tap" : "")}
          onClick={vg.length ? () => setStockOpen((v) => !v) : undefined}
        >
          <RowIcon>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          </RowIcon>
          <div className="pd-row-lbl">In stock</div>
          <div className={"pd-row-val" + (low || qty <= 0 ? " am" : "")}>
            {qty <= 0 ? "Out of stock" : qty + " pcs"}
            {vg.length ? <Chev open={stockOpen} /> : null}
          </div>
        </div>
        {!!vg.length && (
          <div className="pd-zones" style={{ display: stockOpen ? "flex" : "none" }}>
            {vg.map((g, gi) => (
              <div className="pd-zone-card" key={g.name + gi}>
                <div className="pd-zone-hd" data-no-i18n>{g.name}</div>
                {g.items.map((it) => (
                  <div className="pd-zone-city" key={it.val}>
                    <span data-no-i18n>{it.val}</span>
                    <span>{it.qty === null ? "—" : it.qty + " pcs"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Marketers only ever see active, in-stock products, so the marketer's
            sheet has no reason to carry this. The admin needs it. */}
        <div className="pd-row">
          <RowIcon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </RowIcon>
          <div className="pd-row-lbl">Status</div>
          <div className={"pd-row-val" + (hidden || paused ? " am" : "")}>
            {hidden ? "Hidden by admin" : paused ? "Paused by owner" : "Active"}
          </div>
        </div>

        <div className="pd-row">
          <RowIcon>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </RowIcon>
          <div className="pd-row-lbl">Active marketers</div>
          <div className="pd-row-val">{activeMarketers}</div>
        </div>

        <div className="pd-row">
          <RowIcon>
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </RowIcon>
          <div className="pd-row-lbl">Sold</div>
          <div className="pd-row-val">{Number(p.sold || 0)}</div>
        </div>

        <div className="pd-row">
          <RowIcon>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </RowIcon>
          <div className="pd-row-lbl">Revenue</div>
          <div className="pd-row-val"><CurMoney sym={cur} code={curCode} n={p.revenue} /></div>
        </div>

        {/* Read-only: an admin has no review to write, and reporting a product
            to yourself is not a thing, so the form and the Report button that
            marketers get stay behind ReviewsSection. */}
        <ReviewsList reviews={reviews} onPhoto={(u) => lightbox.open(u)} />

        {/* Collapsed by default — the owner is reference material, not the point
            of the sheet, so it folds away like the delivery and stock rows. */}
        <div className="pd-row pd-row-tap" onClick={() => setOwnerOpen((v) => !v)}>
          <RowIcon>
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M10 21v-6h4v6" />
          </RowIcon>
          <div className="pd-row-lbl">Business owner</div>
          <div className="pd-row-val">
            <span data-no-i18n>{ownerName}</span><Chev open={ownerOpen} />
          </div>
        </div>
        {ownerOpen && (
          <div className="adm-pd-owner">
            <div className="adm-pd-owner-name" data-no-i18n>{ownerName}</div>
            {!!ownerOther && (
              <div className="adm-pd-owner-row">Business owner name: <span data-no-i18n>{ownerOther}</span></div>
            )}
            <div className="adm-pd-owner-row">Phone: <span>{dispPhone(owner.phone) || "—"}</span></div>
            {!!owner.email && <div className="adm-pd-owner-row">Email: <span>{owner.email}</span></div>}
            {/* The day itself, not "412d ago". How long a shop has been here is a
                fact an admin compares against other dates — a claim, a report,
                an order — and a relative figure cannot be compared to anything. */}
            <div className="adm-pd-owner-row">Joined: <span>{owner.created_at ? dateFull(owner.created_at) : "—"}</span></div>
            <div className="adm-pd-owner-row" style={{ marginTop: 8 }}>
              <button className="adm-go-btn" onClick={() => goToAccount(p.business_id, "business", ownerName)}>
                Go to Account
              </button>
            </div>
          </div>
        )}

        {/* Hide and Delete used to float on the grid thumbnail, where they were
            easy to hit by accident. They now live at the foot of the open sheet,
            in the slot the marketer sheet uses for its own actions. */}
        {(onToggleHidden || onDelete) && (
          <div className="adm-pd-actions">
            {onToggleHidden && (
              <button
                className="adm-pd-act adm-pd-act-hide"
                onClick={() => onToggleHidden(p.id, hidden ? "active" : "hidden")}
              >
                {hidden ? <EyeOpen /> : <EyeOff />}
                {hidden ? "Unhide" : "Hide"}
              </button>
            )}
            {onDelete && (
              <button className="adm-pd-act adm-pd-act-del" onClick={() => onDelete(p.id, p.name)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Delete
              </button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={"adm-pdetail" + (open ? " open" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm-pdetail-card">
        <button className="adm-pdetail-close" onClick={onClose}>×</button>
        <div>{body}</div>
      </div>
    </div>
  );
}
