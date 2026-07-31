import { whenFull } from "../lib/format";
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

export function ReceiptCard({
  o, onApprove, onReject, onRefund,
}: {
  o: ReceiptOrder;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRefund: (id: string) => void;
}) {
  const lightbox = useLightbox();

  const qty = Number(o.qty || 0);
  const unitPrice = Number(o.unit_price || 0);
  const marketerFee = Number(o.commission || 0) * qty;
  const platformFee = Number(o.platform_fee || 0) * qty;
  const productTotal = unitPrice * qty;
  const productName = (o.product && o.product.name) || "Order";
  const prodPhoto = (o.product && Array.isArray(o.product.photos) && o.product.photos[0]) || "";
  const isRefunded = !!o.refunded_at;
  const orderCode = "#" + (o.order_number || String(o.id || "").slice(0, 8).toUpperCase());
  const customer = [o.customer_name, o.customer_phone].filter(Boolean).join(" · ");

  // Refunding only makes sense for a receipt the admin already approved (the
  // only point real platform-fee revenue was counted), and only once.
  const canRefund =
    (o.status === "approved" || o.status === "confirmed" || o.status === "delivered") && !isRefunded;

  return (
    <div className="adm-recpt-card">
      <div className="adm-row-top" style={{ alignItems: "flex-start" }}>
        <div className="adm-thumbs-row">
          <div className="adm-thumb-block">
            {prodPhoto ? (
              <img className="adm-prod-thumb" src={prodPhoto} alt="" onClick={() => lightbox.open(prodPhoto)} />
            ) : (
              <div className="adm-thumb-empty" style={{ width: 44, height: 44 }}>📦</div>
            )}
            <span className="adm-thumb-block-label">Product</span>
          </div>
          <div className="adm-thumb-block">
            {o.receipt_url ? (
              <img className="adm-thumb" src={o.receipt_url} alt="receipt" onClick={() => lightbox.open(o.receipt_url!)} />
            ) : (
              <div className="adm-thumb-empty">📄</div>
            )}
            <span className="adm-thumb-block-label">Receipt</span>
          </div>
        </div>
        <div className="adm-row-mid">
          <div className="adm-row-name">
            {o.product && o.product.name ? <span data-no-i18n>{productName}</span> : productName}
          </div>
          <div style={{ marginTop: 5 }}><StatusPill o={o} /></div>
        </div>
        <div className="adm-row-amt"><Money n={platformFee} /></div>
      </div>

      <details className="adm-order-details" style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#9e9b97", listStyle: "none" }}>
          ▸ Order code &amp; timestamps
        </summary>
        <div style={{ marginTop: 6, fontSize: 12, color: "#c9c8c4", lineHeight: 1.6 }}>
          <div><span data-no-i18n>{orderCode}</span></div>
          <div>Created: {whenFull(o.created_at)}</div>
          {!!o.receipt_uploaded_at && <div>Uploaded: {whenFull(o.receipt_uploaded_at)}</div>}
        </div>
      </details>

      {!!customer && (
        <div className="adm-row-sub" style={{ marginTop: 2 }}>
          Customer: <span data-no-i18n>{customer}</span>
        </div>
      )}

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

      <div className="adm-order-detail-rows" style={{ marginTop: 8 }}>
        <div className="adm-detail-row"><span>Price</span><span><Money n={unitPrice} /></span></div>
        <div className="adm-detail-row"><span>Qty</span><span>{qty}</span></div>
        <div className="adm-detail-row"><span>Total</span><span><Money n={productTotal} /></span></div>
        <div className="adm-detail-row"><span>Marketer fee</span><span><Money n={marketerFee} /></span></div>
        <div className="adm-detail-row"><span>Platform fee</span><span><Money n={platformFee} /></span></div>
      </div>

      {o.status !== "pending" && !!o.reviewed_at && (
        <div className="adm-row-sub" style={{ opacity: 0.7, marginTop: 6 }}>
          Reviewed: {whenFull(o.reviewed_at)}
          {isRefunded ? " · Refunded: " + whenFull(o.refunded_at) : ""}
        </div>
      )}

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
  );
}
