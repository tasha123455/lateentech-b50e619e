import { isValidElement, type ReactNode } from "react";

import { FulfilmentBadge } from "@/components/shared/FulfilmentBadge";
import { asFulfilment } from "@/lib/fulfilment";
import { isPdfUrl } from "@/lib/filePicker";
import { LIBYA } from "@/lib/markets/libya";
import { daysPhrase, isAr, isSafeUrl, parseData, splitCC, t } from "../lib/format";
import type { NotificationRow } from "../lib/types";

/** One label/value line inside an expanded notification or transaction. */
export function DetailRow({ k, v, noTranslate }: { k: string; v: unknown; noTranslate?: boolean }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
      <span {...(noTranslate ? { "data-no-i18n": "" } : {})} style={{ color: "var(--color-text-primary)", textAlign: "right" }}>
        {/* An element passes through as itself, so a caller can hand over a
            money amount with its symbol in the smaller `.cur-sym` span rather
            than a flat string that draws the symbol at full size. */}
        {isValidElement(v) ? v : String(v)}
      </span>
    </div>
  );
}

/** Phone rendered as "+218 | 09xxxxxxx" with the bidi marks kept intact. */
export function PhoneRow({ label, phone }: { label: string; phone: unknown }) {
  const p = splitCC(phone);
  const v = p.cc ? p.cc + " | " + p.num : p.num;
  return <DetailRow k={label} v={v} />;
}

/** Variant rows use the real group names from selected_variants; the legacy
    size/colour pair is only a fallback for older orders. */
export function VariantRows({ d }: { d: Record<string, unknown> }) {
  const sv = Array.isArray(d?.selected_variants)
    ? (d.selected_variants as Array<{ name?: string; value?: string }>)
    : null;
  if (sv && sv.length) {
    return (
      <>
        {sv.map((v, i) => (
          <DetailRow key={i} k={(v && v.name) || ""} v={(v && v.value) || ""} noTranslate />
        ))}
      </>
    );
  }
  return (
    <>
      <DetailRow k={t("Size", "المقاس")} v={d?.size} noTranslate />
      <DetailRow k={t("Colour", "اللون")} v={d?.color} noTranslate />
    </>
  );
}

/** Free-text block (customer notes, admin notes, report body…). */
export function NoteBlock({
  label, text, background = "#0f0f0f", color = "var(--color-text-secondary)", marginTop = 6, italic,
}: {
  label: string;
  text: ReactNode;
  background?: string;
  color?: string;
  marginTop?: number;
  /** Set where the text is something the reader wrote themselves, so it reads
   *  back as a quotation rather than as more of the app's own prose. */
  italic?: boolean;
}) {
  if (!text) return null;
  return (
    <div style={{ marginTop, padding: "8px 10px", borderRadius: 8, background, color, fontSize: 11 }}>
      <b>{label}:</b>{" "}
      <span data-no-i18n style={italic ? { fontStyle: "italic" } : undefined}>{text}</span>
    </div>
  );
}

/** Why the money is not in the wallet yet, in full, when the card is opened.
 *
 *  The row above says the commission arrives in two days and invites a tap;
 *  this is what the tap is for. It is written as reassurance rather than as
 *  terms: the waiting period exists to protect the person reading it as much
 *  as the customer, and saying so is the difference between a rule and a
 *  reason.
 *
 *  The number comes from the notification, so a card sent under an older rule
 *  keeps saying what that marketer was actually told at the time. */
function RefundProtection({ days }: { days: number }) {
  const ar = isAr();
  const d = daysPhrase(days, ar);
  /* English wants the hyphenated form in front of a noun — "a 2-day refund
     period", not "a 2 days refund period". Arabic reads the same either way. */
  const dAttr = ar ? d : Math.max(1, Math.round(days)) + "-day";
  const paras = ar
    ? [
        `بيش نحافظوا على حق الزبون ونمنعوا أي عمليات نصب، كل طلب فيه فترة استرجاع مدتها ${d} من وقت ما يتسجل إنه تم التسليم.`,
        `عمولتك ما تنزلش في محفظتك إلا بعد ما تكمل هالفترة. الإجراء هذه يحمي الزبون من أي عمليه نصب أو تاجر غير ملتزم، ويحميك انت حتى من ديون اضطرارك ترجع العمولة لو صار استرجاع خلال ${d}.`,
        `بعد انتهاء فترة ${d}، العمولة توصل لمحفظتك و تعتبر نهائية وغير قابلة للاسترجاع بأي حال من الأحوال.`,
      ]
    : [
        `To protect customers from fraud, every order includes a ${dAttr} refund period after it has been marked as delivered.`,
        `Your commission will be credited to your wallet only after this ${dAttr} period ends. This policy protects customers from fraudulent sellers and protects you from having to repay commissions if an order is refunded.`,
        `Once the ${dAttr} refund period has passed, your commission is final and non-refundable, regardless of any refund requests made afterward.`,
      ];

  return (
    <div
      data-no-i18n
      style={{
        margin: "0 0 10px", padding: "10px 12px", borderRadius: 8,
        background: "#0f0f0f", border: "0.5px solid #1e2a22",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#35c98f", marginBottom: 6 }}>
        {ar ? "فترة حماية الاسترجاع" : "Refund Protection Period"}
      </div>
      {paras.map((p, i) => (
        <p
          key={i}
          style={{
            margin: i === paras.length - 1 ? 0 : "0 0 7px",
            fontSize: 11, lineHeight: 1.65, color: "var(--color-text-secondary)",
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}

/** Everything inside an opened notification, for one event.
 *
 *  The wallet's transactions list is the same five events read a second time —
 *  a commission arriving, a refund going out, a withdrawal paid or failed, a
 *  receipt turned down — so it opens onto this same box rather than a second
 *  hand-built copy of it. The copy had drifted: a PDF receipt came out as a
 *  broken image, a turned-down receipt did not show the receipt at all, the
 *  shop's own note on a failed delivery was missing, and the admin's note was
 *  labelled differently in the two places. One component, one answer.
 *
 *  `hasRowPhoto` says the row above already shows this picture, so the body
 *  does not repeat it — true in the notifications list, never in the wallet,
 *  where the row carries the +/− instead. `leadRows` is for what only the
 *  wallet has to say: the amount that moved, and whether it went through. */
export function NotifDetailBox({
  n, hasRowPhoto = false, onPhoto, leadRows,
}: {
  n: NotificationRow;
  hasRowPhoto?: boolean;
  onPhoto: (url: string) => void;
  leadRows?: ReactNode;
}) {
  const d = parseData(n.data);

  const isFailed = n.kind === "order_failed";
  const isRejected = n.kind === "receipt_rejected";
  const isReportReviewed = n.kind === "report_reviewed";
  const isRefunded = n.kind === "order_refunded";
  const isNote = n.kind === "payout_note";
  const isAdminMsg = n.kind === "admin_message" || n.kind === "admin_broadcast";
  const isPaid = n.kind === "payout_paid";
  const isDelivered = n.kind === "order_delivered";

  const borderColor = isFailed || isRejected || isRefunded || isNote ? "#2a1a1a" : "#142a20";
  const photoUrl = (d.product_photo || d.photo) as string | undefined;

  const bodyPhoto =
    !hasRowPhoto && isSafeUrl(photoUrl) ? (
      <div style={{ margin: "-2px 0 10px 0" }}>
        {isPdfUrl(photoUrl) ? (
          <iframe
            src={photoUrl}
            title={t("Attachment", "المرفق")}
            style={{ width: "100%", height: 220, border: "none", borderRadius: 10, display: "block", background: "#fff" }}
          />
        ) : (
          <img
            src={photoUrl}
            alt=""
            onClick={isPaid ? (e) => { e.stopPropagation(); onPhoto(photoUrl!); } : undefined}
            style={{
              width: "100%", maxHeight: 220, objectFit: "contain", background: "#0d0d0d",
              borderRadius: 10, display: "block", ...(isPaid ? { cursor: "zoom-in" } : null),
            }}
          />
        )}
      </div>
    ) : null;

  const receiptImg =
    isRejected && isSafeUrl(d.receipt_url) ? (
      <div style={{ margin: "0 0 10px 0" }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
          {t("Receipt", "الإيصال")}
        </div>
        {/* The rejected receipt may be the PDF they uploaded. Inline it the
            same way, in the browser's own viewer, so they can see what the
            admin saw without leaving the notification. */}
        {isPdfUrl(d.receipt_url as string) ? (
          <iframe
            src={d.receipt_url as string}
            title={t("Receipt", "الإيصال")}
            style={{ width: "100%", height: 240, border: "none", borderRadius: 10, display: "block", background: "#fff" }}
          />
        ) : (
          <img
            src={d.receipt_url as string}
            alt=""
            style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 10, display: "block", background: "#0f0f0f" }}
          />
        )}
      </div>
    ) : null;

  const adminNoteText = isRejected
    ? (d.admin_notes as string)
    : isRefunded || isNote
      ? ((d.admin_comment || d.admin_note || (isNote ? n.body || "" : "")) as string)
      : ((d.admin_notes || d.admin_comment || d.admin_note || "") as string);

  const reportTypeLbl = isReportReviewed
    ? d.report_type === "product"
      ? t("Product", "المنتج")
      : d.report_type === "merchant"
        ? t("Merchant", "التاجر")
        : t("Other", "أخرى")
    : "";

  const adminMsgText = isAdminMsg ? ((d.message || n.body || "") as string) : "";

  return (
    <div className="notif-details-box" style={{ borderColor }}>
      {bodyPhoto}
      {receiptImg}
      {!!adminMsgText && (
        <div
          style={{
            padding: "8px 10px", borderRadius: 8, background: "#0f0f0f",
            color: "var(--color-text-secondary)", fontSize: 12, whiteSpace: "pre-wrap",
          }}
          data-no-i18n
        >
          {adminMsgText}
        </div>
      )}
      {leadRows}
      {isDelivered && <RefundProtection days={Number(d.available_in_days) || LIBYA.money.refundWindowDays} />}
      <DetailRow k={t("Order Code", "كود الطلبيه")} v={d.order_code} />
      {isReportReviewed && <DetailRow k={t("Report type", "نوع البلاغ")} v={reportTypeLbl} />}
      {/* The marketer's own words, read back to them beside the admin's
          answer, so the reply has something to be a reply to. Italic
          because it is a quotation of what they wrote, not app copy. */}
      {isReportReviewed && (
        <NoteBlock label={t("Your report", "بلاغك")} text={d.report_message as string} italic />
      )}
      <OrderDetailRowsWithoutCode d={d} />
      <NoteBlock label={t("Notes", "ملاحظات")} text={d.customer_notes as string} />
      <NoteBlock
        label={t("Admin notes", "ملاحظات الأدمن")}
        text={adminNoteText}
        background="#2a1a1a"
        color="#f0c0c0"
        marginTop={8}
      />
      <NoteBlock
        label={t("Business owner notes", "ملاحظات التاجر")}
        text={d.business_notes as string}
        background="#2a1a1a"
        color="#f0c0c0"
        marginTop={8}
      />
    </div>
  );
}

/** The order block minus the code row, which the box renders earlier so the
    report-type row can sit between them (matching the original ordering). */
function OrderDetailRowsWithoutCode({ d }: { d: Record<string, unknown> }) {
  const rest = { ...d };
  delete rest.order_code;
  return <OrderDetailRows d={rest} />;
}

/** The shared address/customer block used by both notifications and transactions. */
export function OrderDetailRows({ d }: { d: Record<string, unknown> }) {
  return (
    <>
      <DetailRow k={t("Order Code", "كود الطلبيه")} v={d.order_code} />
      <DetailRow k={t("Product", "المنتج")} v={d.product_name} noTranslate />
      {/* Reserve or instant delivery, as the listing stood when this was sent.
          Absent from notifications about a product listed before the choice
          existed, and from ones sent before this shipped. */}
      {!!asFulfilment(d.fulfilment) && (
        <DetailRow
          k={t("Fulfilment", "طريقة التسليم")}
          v={<FulfilmentBadge value={d.fulfilment} ar={isAr()} size="sm" />}
        />
      )}
      <DetailRow k={t("Qty", "الكمية")} v={d.qty} />
      <DetailRow k={t("Customer", "الزبون")} v={d.customer_name} noTranslate />
      <PhoneRow label={t("Phone", "الهاتف")} phone={d.customer_phone} />
      {!!d.customer_whatsapp && <PhoneRow label={t("WhatsApp", "واتساب")} phone={d.customer_whatsapp} />}
      <DetailRow k={t("City", "المدينة")} v={d.customer_city} />
      <DetailRow k={t("Country", "الدولة")} v={d.customer_country} />
      <DetailRow k={t("Address", "العنوان")} v={d.customer_address} noTranslate />
      <VariantRows d={d} />
    </>
  );
}
