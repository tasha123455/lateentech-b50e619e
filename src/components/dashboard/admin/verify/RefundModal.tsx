import { useEffect, useRef, useState } from "react";

import { isAr } from "@/components/dashboard/marketer/lib/format";

import type { ReceiptOrder } from "../lib/types";

/** A real note box (not a bare prompt) so the admin can write a message
    delivered to BOTH the marketer and the business owner with the refund.
    Post-delivery refunds also reverse stock, sales and every analytics counter
    server-side. Resolves with the note, or null if cancelled. */
/** The only two things a refund can be for. Anything else — the customer
 *  changed their mind, refused the parcel, could not be reached — is ordinary
 *  trade risk, the fee stays earned, and the business marks the order failed
 *  instead. The database enforces the same two values, so this list is the
 *  policy rather than a suggestion. */
export type RefundReason = "not_delivered" | "wrong_item";

export function RefundModal({
  order, onDone,
}: {
  order: ReceiptOrder | null;
  onDone: (result: { comment: string; reason: RefundReason } | null) => void;
}) {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<RefundReason | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);

  const delivered = !!order && (order.status === "delivered" || order.status === "confirmed");
  const ar = isAr();

  /* Written out in both languages rather than left to the page-wide text-node
     translator. That walker matches a text node against the dictionary, and
     the sentence below is split into three nodes by the <b> in the middle of
     it — so it could never match anything, which is why this dialog was still
     English on an Arabic page. */
  const t = {
    title: ar ? "استرجاع هذه الطلبية" : "Refund this order",
    deliveredBody: ar
      ? "تم تسليم هذه الطلبية بالفعل. استرجاعها سيجعلها فاشلة، ويعيد كمية المنتج للمخزون، ويحذف القطع المباعة والإيرادات من تحليلات صاحب العمل، ويحذف عمولة المنصة من إجمالياتك."
      : "This order was already delivered. Refunding it will mark it as failed, restore the product stock, remove its pieces sold and revenue from the business owner's analytics, and remove its platform fee from your totals.",
    body: ar
      ? "هذا يحذف عمولة المنصة الخاصة بالطلبية من إجمالياتك، ويخصم عمولة المسوّق من محفظته."
      : "This removes the order's platform fee from your totals and deducts the marketer's fee from their wallet.",
    reasonLbl: ar ? "سبب الاسترجاع" : "Reason for the refund",
    notDelivered: ar ? "لم يتم التسليم إطلاقاً" : "Nothing was ever delivered",
    wrongItem: ar ? "تم تسليم منتج مختلف" : "A different product was delivered",
    reasonHint: ar
      ? "الاسترجاع للحالتين أعلاه فقط. الطلبية الفاشلة أو التي رفضها الزبون لا تُسترجع — الرسوم تبقى للمسوّق."
      : "Refunds are only for these two cases. A failed or refused order is not refundable — the fee stays with the marketer.",
    noteLbl: ar ? "ملاحظة للمسوّق وصاحب العمل (اختياري)" : "Note to the marketer & business owner (optional)",
    notePh: ar ? "وضّح سبب استرجاع هذه الطلبية…" : "Explain why this order is being refunded…",
    cancel: ar ? "إلغاء" : "Cancel",
    refund: ar ? "استرجاع" : "Refund",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="wasla-scrim" style={{ position: "absolute", inset: 0 }} onClick={() => onDone(null)} />
      <div
        style={{
          position: "relative", width: "100%", maxWidth: 420, background: "#101010",
          border: "0.5px solid #262626", borderRadius: 16, padding: "18px 16px",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "#f4f2ef", marginBottom: 8 }} data-no-i18n>{t.title}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#9e9b97", marginBottom: 12 }} data-no-i18n>
          {delivered ? t.deliveredBody : t.body}
        </div>
        <div style={{ fontSize: 12, color: "#9e9b97", marginBottom: 6 }} data-no-i18n>{t.reasonLbl}</div>
        <div style={{ display: "grid", gap: 6, marginBottom: 6 }}>
          {([["not_delivered", t.notDelivered], ["wrong_item", t.wrongItem]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setReason(key)}
              data-no-i18n
              style={{
                textAlign: "start", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                fontSize: 12.5, fontFamily: "inherit",
                background: reason === key ? "rgba(124,156,240,0.16)" : "#161616",
                border: "0.5px solid " + (reason === key ? "#7c9cf0" : "#262626"),
                color: reason === key ? "#cddaff" : "#c9c8c4",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: "#7d7a76", marginBottom: 12 }} data-no-i18n>{t.reasonHint}</div>
        <div style={{ fontSize: 12, color: "#9e9b97", marginBottom: 6 }} data-no-i18n>{t.noteLbl}</div>
        <textarea
          ref={taRef}
          rows={4}
          placeholder={t.notePh}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", background: "#161616", border: "0.5px solid #262626",
            borderRadius: 10, color: "#f4f2ef", fontSize: 13, padding: 10, fontFamily: "inherit", resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={() => onDone(null)}
            style={{
              flex: 1, height: 38, borderRadius: 19, background: "transparent", border: "0.5px solid #333",
              color: "#c9c8c4", fontSize: 13, cursor: "pointer",
            }}
            data-no-i18n
          >
            {t.cancel}
          </button>
          <button
            onClick={() => reason && onDone({ comment: note.trim(), reason })}
            disabled={!reason}
            style={{
              flex: 1, height: 38, borderRadius: 19, border: "none",
              background: reason ? "#7c9cf0" : "#2a2a2a",
              color: reason ? "#0b0b0b" : "#6a6a6a", fontSize: 13, fontWeight: 600,
              cursor: reason ? "pointer" : "not-allowed",
            }}
            data-no-i18n
          >
            {t.refund}
          </button>
        </div>
      </div>
    </div>
  );
}
