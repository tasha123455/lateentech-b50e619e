import { useState } from "react";

import { dispPhone, whenFull } from "../lib/format";
import type { ReceiptOrder } from "../lib/types";
import { Money } from "../ui/Money";
import { useLightbox } from "../ui/Lightbox";

function StatusPill({ o }: { o: ReceiptOrder }) {
  if (o.refunded_at) return <span className="adm-recpt-status adm-status-refunded">↺ Refunded</span>;
  if (o.status === "pending") return <span className="adm-recpt-status adm-status-pending">⏳ Pending verification</span>;
  if (o.status === "approved" || o.status === "confirmed") return <span className="adm-recpt-status adm-status-approved">✓ Approved</span>;
  if (o.status === "delivered") return <span className="adm-recpt-status adm-status-approved">✓ Delivered</span>;
  if (o.status === "cancelled") return <span className="adm-recpt-status adm-status-rejected">✕ Failed</span>;
  return <span className="adm-recpt-status adm-status-rejected">✕ Rejected</span>;
}

const Chev = ({ open, cls }: { open: boolean; cls: string }) => (
  <svg
    className={cls + (open ? " open" : "")}
    width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Who and what the order is, folded away: the product's photo, then the
 *  customer, their number, the order code and the product name. */
function OrderInfo({ o, onPhoto }: { o: ReceiptOrder; onPhoto: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const prodPhoto = (o.product && Array.isArray(o.product.photos) && o.product.photos[0]) || "";
  const orderCode = "#" + (o.order_number || String(o.id || "").slice(0, 8).toUpperCase());
  const productName = (o.product && o.product.name) || "Order";

  return (
    <div className="rcpt-info">
      <button className="rcpt-info-hd" onClick={() => setOpen((v) => !v)}>
        <span>Order details</span>
        <Chev open={open} cls="rcpt-info-chev" />
      </button>
      {open && (
        <div className="rcpt-info-body">
          <div className="rcpt-info-photo">
            {prodPhoto ? (
              <img src={prodPhoto} alt="" data-no-i18n onClick={() => onPhoto(prodPhoto)} />
            ) : (
              <div className="rcpt-info-photo-empty">📦</div>
            )}
          </div>
          <div className="rcpt-kv">
            <span className="rcpt-kv-k">Customer</span>
            <span className="rcpt-kv-v" data-no-i18n>{o.customer_name || "—"}</span>
          </div>
          <div className="rcpt-kv">
            <span className="rcpt-kv-k">Phone number</span>
            <span className="rcpt-kv-v" data-no-i18n>{dispPhone(o.customer_phone) || "—"}</span>
          </div>
          <div className="rcpt-kv">
            <span className="rcpt-kv-k">Order code</span>
            <span className="rcpt-kv-v" data-no-i18n>{orderCode}</span>
          </div>
          <div className="rcpt-kv">
            <span className="rcpt-kv-k">Product</span>
            <span className="rcpt-kv-v" data-no-i18n>{productName}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReceiptCard({
  o, onApprove, onReject, onRefund,
}: {
  o: ReceiptOrder;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRefund: (id: string) => void;
}) {
  const lightbox = useLightbox();
  const [open, setOpen] = useState(false);

  const qty = Number(o.qty || 0);
  const unitPrice = Number(o.unit_price || 0);
  const marketerFee = Number(o.commission || 0) * qty;
  const platformFee = Number(o.platform_fee || 0) * qty;
  const orderValue = unitPrice * qty;
  /* What the marketer has to put down: their own fee plus the platform's. */
  const total = marketerFee + platformFee;
  const isRefunded = !!o.refunded_at;

  // Refunding only makes sense for a receipt the admin already approved (the
  // only point real platform-fee revenue was counted), and only once.
  const canRefund =
    (o.status === "approved" || o.status === "confirmed" || o.status === "delivered") && !isRefunded;

  /* The timestamps ride into the fullscreen receipt rather than taking a row
     on the card — they only ever matter while you are looking at the receipt. */
  const openReceipt = () => {
    if (!o.receipt_url) return;
    lightbox.open(
      o.receipt_url,
      <>
        <div><span>Created</span> <span data-no-i18n>{whenFull(o.created_at)}</span></div>
        {!!o.receipt_uploaded_at && (
          <div><span>Uploaded</span> <span data-no-i18n>{whenFull(o.receipt_uploaded_at)}</span></div>
        )}
        {!!o.reviewed_at && (
          <div><span>Reviewed</span> <span data-no-i18n>{whenFull(o.reviewed_at)}</span></div>
        )}
        {isRefunded && (
          <div><span>Refunded</span> <span data-no-i18n>{whenFull(o.refunded_at)}</span></div>
        )}
      </>,
    );
  };

  return (
    <div className={"adm-recpt-card" + (open ? " open" : "")}>
      {/* Collapsed, this is the whole card: the receipt to look at, what the
          platform earns, what the marketer owes, and where it stands. */}
      {/* Small, in the corner — the state is a glance, not a headline. */}
      <StatusPill o={o} />
      <button className="rcpt-head" onClick={() => setOpen((v) => !v)}>
        <span
          className="rcpt-head-thumb"
          onClick={(e) => { e.stopPropagation(); openReceipt(); }}
          role="button"
          tabIndex={-1}
          aria-label="Receipt"
        >
          {o.receipt_url ? (
            <img src={o.receipt_url} alt="receipt" data-no-i18n />
          ) : (
            <span className="rcpt-head-thumb-empty">📄</span>
          )}
        </span>
        <span className="rcpt-head-mid">
          <span className="rcpt-head-money">
            <span className="rcpt-kv-k">Platform fee</span>
            <span className="rcpt-head-fee"><Money n={platformFee} /></span>
          </span>
          <span className="rcpt-head-money">
            <span className="rcpt-kv-k">Total</span>
            <span className="rcpt-head-total"><Money n={total} /></span>
          </span>
        </span>
        <Chev open={open} cls="rcpt-head-chev" />
      </button>

      {open && (
        <div className="rcpt-body">
          <OrderInfo o={o} onPhoto={(u) => lightbox.open(u)} />

          {o.status === "rejected" && (
            <div className="adm-note-block">
              <div className="adm-note-block-label">Admin note</div>
              <div className="adm-note-block-text">
                {o.admin_notes && String(o.admin_notes).trim() ? (
                  <span data-no-i18n>{o.admin_notes}</span>
                ) : (
                  "No note was provided."
                )}
              </div>
            </div>
          )}

          {/* Bordered, so the figures read as one block rather than loose
              lines running into the buttons below. */}
          <div className="adm-order-detail-rows rcpt-figures">
            <div className="adm-detail-row"><span>Price</span><span><Money n={unitPrice} /></span></div>
            <div className="adm-detail-row"><span>Qty</span><span>{qty}</span></div>
            <div className="adm-detail-row"><span>Order value</span><span><Money n={orderValue} /></span></div>
            <div className="adm-detail-row"><span>Marketer fee</span><span><Money n={marketerFee} /></span></div>
          </div>

          {o.status === "pending" && (
            <div className="adm-actions" style={{ marginTop: 10 }}>
              <button className="adm-btn adm-btn-no" onClick={() => onReject(o.id)}>Reject with note</button>
              <button className="adm-btn adm-btn-ok" onClick={() => onApprove(o.id)}>Approve &amp; forward</button>
            </div>
          )}

          {canRefund && (
            <button className="adm-btn-refund" onClick={() => onRefund(o.id)}>Refund customer</button>
          )}
        </div>
      )}
    </div>
  );
}
