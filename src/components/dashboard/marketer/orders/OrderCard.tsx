import { useRef, useState } from "react";

import { DeliveryEtaRow } from "@/components/shared/DeliveryEtaRow";
import { FulfilmentBadge } from "@/components/shared/FulfilmentBadge";
import { coverStyle } from "@/lib/coverFocus";

import { codPaysParts, dispPhone, fmtDT, isAr, isSafeUrl } from "../lib/format";
import { cityLabel, orderVariants } from "../lib/mappers";
import type { BrowseProduct, FormProduct, MarketerOrder } from "../lib/types";
import { ProductCover } from "../browse/ProductCard";
import { FreeOrMoney, Money } from "../ui/Money";
import { usePhotoLightbox } from "../ui/PhotoLightbox";
import { orderT } from "./orderText";

const Check = ({ size = 11, className = "variant-check" }: { size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Pin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b83e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const PhoneIco = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b83e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const WaIco = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
  </svg>
);

const AlertIco = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export function OrderCard({
  o, product, liveProduct, open, onToggle,
  onEdit, onDelete, onUploadReceipt, onViewReceipt, onHowTo, uploadingId,
}: {
  o: MarketerOrder;
  /** Held by the page, so opening one card shuts whichever was open. */
  open: boolean;
  onToggle: () => void;
  product: BrowseProduct | null;
  liveProduct: FormProduct | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onUploadReceipt: (id: string) => void;
  onViewReceipt: (id: string) => void;
  onHowTo: (id: string) => void;
  uploadingId: string | null;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const lightbox = usePhotoLightbox();

  const T = orderT();
  const st = o._status || "pending";
  const isDraft = st === "draft" || (!o.dbId && !o.hasReceipt);
  const staleDraft = !!(isDraft && liveProduct && o.productName && liveProduct.name && liveProduct.name !== o.productName);
  const isPending = st === "pending" && o.hasReceipt;
  const isApproved = st === "approved" || st === "confirmed" || st === "delivered";
  const isRejected = st === "rejected";
  const isFailed = st === "cancelled";
  const canEdit = !isApproved && !isFailed && !isPending;

  const photos = (product && product.ph && product.ph.length ? product.ph : []) as string[];
  const variants = orderVariants(o, product);

  const commAmount = (o.commPerUnit || 0) * (o.qty || 0);
  const codAmt = Math.max(
    0,
    parseFloat((((o.total || 0) - ((o.commPerUnit || 0) + (o.platformPerUnit || 0)) * (o.qty || 0))).toFixed(2)),
  );
  const codParts = codPaysParts(Number(o.delivery) > 0, Number(o.shipping) > 0);
  /* A zone is picked as a country and a city together, and the city is what
     the order records. Without one there are no delivery figures yet, only
     zeroes standing in for them. */
  const zoned = !!String(o.city || "").trim();
  const qtyN = o.qty || 1;
  const lineTotal = (o.price || 0) * qtyN;

  const pill = isDraft ? (
    <span className="status-pill draft">{T.pDraft}</span>
  ) : isRejected ? (
    <span className="status-pill err">{T.pRej}</span>
  ) : isFailed ? (
    <span className="status-pill err">{T.pFail}</span>
  ) : isApproved ? (
    <span className="status-pill ok"><Check size={10} className="" />{T.pOk}</span>
  ) : isPending ? (
    <span className="status-pill pending">{T.pPend}</span>
  ) : (
    <span className="status-pill draft">{T.pAwait}</span>
  );

  const commTag =
    isApproved && commAmount > 0 ? (
      <span className="commission-tag">+<Money n={commAmount} sym={o._sym} code={o._curCode} /></span>
    ) : isFailed && commAmount > 0 ? (
      <span className="commission-tag" style={{ color: "#e07070", borderColor: "#e07070", background: "transparent" }}>
        <Money n={commAmount} sym={o._sym} code={o._curCode} />
      </span>
    ) : null;

  const onPhotoScroll = () => {
    const tr = trackRef.current;
    if (!tr) return;
    const w = tr.clientWidth || 1;
    setPhotoIdx(Math.round(tr.scrollLeft / w));
  };

  /* The photo strip is a scroller and it sits inside the row that expands the
     card, so a tap has to be told apart from both a swipe through the photos
     and a tap meant for the row. Anything that travelled counts as a drag and
     is left alone; a tap that stayed put opens the viewer and stops there. */
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const onPressStart = (e: React.PointerEvent) => { pressAt.current = { x: e.clientX, y: e.clientY }; };
  const tapped = (e: React.MouseEvent) => {
    const p = pressAt.current;
    pressAt.current = null;
    if (!p) return true;
    return Math.abs(e.clientX - p.x) < 10 && Math.abs(e.clientY - p.y) < 10;
  };

  const viewable = photos.filter(isSafeUrl);
  const openPhotos = (e: React.MouseEvent, start: number) => {
    if (!viewable.length || !tapped(e)) return;
    e.stopPropagation();
    lightbox.open(viewable, start);
  };

  const uploading = uploadingId === o.id;

  let receiptBtn: React.ReactNode;
  if (isDraft) {
    receiptBtn = (
      <button className="receipt-btn primary" onClick={(e) => { e.stopPropagation(); onEdit(o.id); }}>
        {T.addSend}
      </button>
    );
  } else if (isRejected) {
    receiptBtn = (
      <button className="receipt-btn urgent" disabled={uploading} onClick={(e) => { e.stopPropagation(); onUploadReceipt(o.id); }}>
        {uploading ? (isAr() ? "جاري الرفع…" : "Uploading…") : <><UpIco />{T.reupload}</>}
      </button>
    );
  } else if (o.hasReceipt && o.receiptUrl) {
    receiptBtn = (
      <button className="receipt-btn" onClick={(e) => { e.stopPropagation(); onViewReceipt(o.id); }}>
        <EyeIco />{T.view}
      </button>
    );
  } else {
    receiptBtn = (
      <button className="receipt-btn" disabled={uploading} onClick={(e) => { e.stopPropagation(); onUploadReceipt(o.id); }}>
        {uploading ? (isAr() ? "جاري الرفع…" : "Uploading…") : <><UpIco />{T.upload}</>}
      </button>
    );
  }

  // Admin actions (refund/reject) live in their own note field; only surface a
  // merchant note when the business owner genuinely wrote something different.
  const bizIsAdminNote = !!o.adminNotes && String(o.businessNotes || "").trim() === String(o.adminNotes || "").trim();

  return (
    <div className={"order" + (isApproved ? " approved" : "") + (open ? " open" : "")} data-oid={o.id}>
      {/* Open, the photo grows to fill the top of the card and the header
          chevron fades out under it, so there is nothing left to press to shut
          it again. This is that button.

          It is anchored to the card, not to the photo. It used to live inside
          the photo, and the photo animates from a 40px thumbnail to the full
          width of the card over most of half a second — so the button rode
          that whole journey across the screen every time a card was opened. */}
      {open && (
        <button
          type="button"
          className="ord-collapse"
          aria-label={T.collapse}
          title={T.collapse}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
      <div className="row" onClick={onToggle}>
        <div className="photo-wrap">
          <div className="hero-scroll" ref={trackRef} onScroll={onPhotoScroll}>
            {photos.length ? (
              photos.map((u, i) => (
                <div className="photo-slide" key={u + i}>
                  {/* Only the open card's photo opens the viewer. Shut, it is a
                      40px thumbnail sitting in a row whose whole job is to open
                      the card — taking that tap away from it would be taking it
                      from the row. */}
                  <img
                    src={u}
                    alt=""
                    loading="lazy"
                    onPointerDown={open ? onPressStart : undefined}
                    onClick={open ? (e) => openPhotos(e, viewable.indexOf(u)) : undefined}
                    style={{
                      /* Only the first photo is the cover, and the owner's
                         framing is a fact about the cover. The rest were never
                         dragged, so they stay centred. */
                      ...(i === 0 && product ? coverStyle(product.coverFocusX, product.coverFocusY) : null),
                      ...(open && isSafeUrl(u) ? { cursor: "zoom-in" } : null),
                    }}
                  />
                </div>
              ))
            ) : (
              <div className="photo-slide">{product ? <ProductCover p={product} /> : "📦"}</div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="photo-dots">
              {photos.map((u, i) => (
                <span key={u + i} className={"photo-dot" + (i === photoIdx ? " active" : "")} />
              ))}
            </div>
          )}
        </div>
        <div className="row-main">
          <div
            className="row-name"
            {...(o.customerName || (o.productName && o.productName !== "(no product)") ? { "data-no-i18n": "" } : {})}
          >
            {o.customerName || (o.productName && o.productName !== "(no product)" ? o.productName : T.noProduct)}
          </div>
          <div className="row-sub-wrap">
            <span className="code-chip">
              {T.orderCode}: <strong>{o.id}</strong>
            </span>
            {!!o.reserveDate && <span className="row-date">{o.reserveDate}</span>}
          </div>
        </div>
        <div className="row-right">
          {pill}
          {staleDraft && (
            <span className="status-pill err" title={T.prodChangedNote}>{T.prodChanged}</span>
          )}
          {commTag}
        </div>
        <span className="chev">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>

      <div className="body-wrap">
        <div className="body-inner">
          <div className="body">
            <div className="product-block">
              <div
                className="product-name"
                {...(o.productName && o.productName !== "(no product)" ? { "data-no-i18n": "" } : {})}
              >
                {o.productName && o.productName !== "(no product)" ? o.productName : T.noProduct}
              </div>
              {/* Reserve or instant delivery, read off the live product — the
                  order does not carry it, and the answer is whatever the
                  listing says today. */}
              {/* How long this order's city takes, folded. The city's own
                  figure when the shop gave one, else the country's. */}
              {!!product && (
                <DeliveryEtaRow
                  cityEta={product.d?.[o.countryCode]?.c?.[o.city]?.eta}
                  zoneEta={product.d?.[o.countryCode]?.eta}
                  city={cityLabel(o.city)}
                  ar={isAr()}
                />
              )}
              {(product?.fulfilment || liveProduct?.fulfilment) && (
                <div style={{ margin: "4px 0 2px" }}>
                  <FulfilmentBadge
                    value={product?.fulfilment ?? liveProduct?.fulfilment}
                    ar={isAr()}
                    size="sm"
                  />
                </div>
              )}
              {!!variants.length && (
                <div className="variant-row">
                  {variants.map((v, i) => (
                    <div className="variant-item" key={i}>
                      <div className="variant-chip">
                        <Check />
                        <span className="variant-label" data-no-i18n>{(v.group || "") + ":"}</span>
                        <span className="variant-value" data-no-i18n>{v.val}</span>
                      </div>
                      {!!v.photo && (
                        <div
                          className="variant-swatch"
                          role={isSafeUrl(v.photo) ? "button" : undefined}
                          aria-label={isSafeUrl(v.photo) ? `${v.group || ""} ${v.val}` : undefined}
                          onClick={isSafeUrl(v.photo)
                            ? (e) => { e.stopPropagation(); lightbox.openOne(v.photo as string); }
                            : undefined}
                          style={{
                            backgroundImage: `url('${v.photo}')`,
                            ...(isSafeUrl(v.photo) ? { cursor: "zoom-in" } : null),
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {staleDraft && (
                <div className="admin-note">
                  <AlertIco />
                  <div>{T.prodChangedNote}</div>
                </div>
              )}
            </div>

            {(!!o.phone || !!o.whatsapp) && (
              <div className="contact-row">
                {!!o.phone && <div className="contact-chip"><PhoneIco />{dispPhone(o.phone)}</div>}
                {!!o.whatsapp && <div className="contact-chip wa"><WaIco />{dispPhone(o.whatsapp)}</div>}
              </div>
            )}

            {(!!o.country || !!o.city || !!o.address) && (
              <div className="addr-block">
                <Pin />
                <div className="addr-rows">
                  {!!o.country && <div className="addr-row"><span className="addr-label">{T.country}:</span>{o.country}</div>}
                  {!!o.city && <div className="addr-row"><span className="addr-label">{T.city}:</span>{o.city}</div>}
                  {!!o.address && (
                    <div className="addr-row">
                      <span className="addr-label">{T.address}:</span>
                      <span data-no-i18n>{o.address}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="summary-card">
              <div className="summary-header">
                <div className="summary-title">{T.summary}</div>
                <div className="summary-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                </div>
              </div>
              <div className="summary-row">
                <span className="summary-label">{T.price}</span>
                <span className="summary-value"><Money n={o.price} sym={o._sym} code={o._curCode} /></span>
              </div>
              <div className="summary-row">
                <span className="summary-label">{T.qty} (×{qtyN})</span>
                <span className="summary-value"><Money n={lineTotal} sym={o._sym} code={o._curCode} /></span>
              </div>
              <div className="summary-row">
                <span className="summary-label">{T.ship}</span>
                <span className="summary-value"><FreeOrMoney n={o.shipping} sym={o._sym} code={o._curCode} free={zoned} /></span>
              </div>
              <div className="summary-row">
                <span className="summary-label">{T.dlv}</span>
                <span className="summary-value"><FreeOrMoney n={o.delivery} sym={o._sym} code={o._curCode} free={zoned} /></span>
              </div>
              <div className="summary-divider" />
              <div className="summary-total-row">
                <span className="summary-total-label">{T.total}</span>
                <span className="summary-total-value"><Money n={o.total} sym={o._sym} code={o._curCode} /></span>
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4, textAlign: "end" }} data-no-i18n>
                {codParts.label} <Money n={codAmt} sym={o._sym} code={o._curCode} />{codParts.suffix}
              </div>
            </div>

            <div className={"commission-block" + (isApproved ? "" : " muted")}>
              <div>
                <div className="commission-label">{T.comm}{qtyN > 1 ? ` (×${qtyN})` : ""}</div>
                {/* "Pending review" is a statement about where the order is, so
                    it belongs only to the order that is actually under review.
                    It used to show for everything that was not yet approved,
                    which meant a rejected, cancelled or not-yet-sent order all
                    claimed a review that nobody was doing. */}
                {isPending && <div className="commission-hint">{T.pendingComm}</div>}
              </div>
              {isApproved ? (
                <span className="commission-value">+<Money n={commAmount} sym={o._sym} code={o._curCode} /></span>
              ) : (
                <span className="commission-value muted" style={isFailed ? { color: "#e07070" } : undefined}>
                  <Money n={commAmount} sym={o._sym} code={o._curCode} />
                </span>
              )}
            </div>

            {!!o.reviewedAt && (
              <div className="meta-line">{T.reviewedAt}: {fmtDT(o.reviewedAt)}</div>
            )}

            {(isRejected || isFailed) && !!o.adminNotes && (
              <div className="admin-note">
                <AlertIco />
                <div>
                  <b>{T.adminNoteLbl}:</b> <span data-no-i18n>{o.adminNotes}</span>
                </div>
              </div>
            )}
            {isFailed && !!o.businessNotes && !bizIsAdminNote && (
              <div className="admin-note">
                <AlertIco />
                <div>
                  <b>{T.bizNoteLbl}:</b> <span data-no-i18n>{o.businessNotes}</span>
                </div>
              </div>
            )}

            <div className="divider" />
            <div className="receipt-card">
              {receiptBtn}
              <button className="howto-link" onClick={(e) => { e.stopPropagation(); onHowTo(o.id); }}>
                {T.how}
              </button>
            </div>
            <div className="icon-btns-row">
              <div
                className={"icon-btn" + (canEdit ? "" : " disabled")}
                title="Edit"
                onClick={canEdit ? (e) => { e.stopPropagation(); onEdit(o.id); } : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div
                className={"icon-btn danger" + (canEdit ? "" : " disabled")}
                title="Delete"
                onClick={canEdit ? (e) => { e.stopPropagation(); onDelete(o.id); } : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const UpIco = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const EyeIco = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
