import { changedTitle } from "@/lib/changedFields";
import { isPdfUrl } from "@/lib/filePicker";
import { coverStyle } from "@/lib/coverFocus";
import { marketOf } from "@/lib/markets";
import { LIBYA } from "@/lib/markets/libya";
import { useAccordion } from "@/lib/useAccordion";

import { useMarketerData } from "../MarketerDataProvider";
import { ago, isAr, isSafeUrl, parseData, t } from "../lib/format";
import type { NotificationRow } from "../lib/types";
import { usePhotoLightbox } from "../ui/PhotoLightbox";
import { NotifDetailBox } from "./detailBits";

/** Maps a raw notification onto the title/body actually shown to the marketer. */
function localize(n: NotificationRow): { t: string; b: string } {
  const title = n.title;
  const body = n.body || "";
  const d = parseData(n.data);
  const amtNum = d.amount != null ? Number(d.amount) : null;
  const amtStr =
    amtNum != null && !isNaN(amtNum)
      ? amtNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;

  if (n.kind === "payout_paid" || title === "Withdrawal successful") {
    // The payout carries the currency it was paid in. Notifications written
    // before markets existed do not, and those are all Libyan, so the default
    // market answers for them.
    const cur = (d.currency as string) || marketOf(null).money.currencyCode;
    const curAr = cur === "LYD" ? "د.ل" : cur;
    const amtLine = amtStr ? t("Amount: " + amtStr + " " + cur, "المبلغ: " + amtStr + " " + curAr) : "";
    const doneLine = t("Your withdrawal has been paid successfully.", "تم تحويل مبلغ السحب إلى حسابك بنجاح.");
    return {
      t: t("Withdrawal Completed", "تم تحويل المبلغ"),
      b: amtLine ? amtLine + "\n" + doneLine : doneLine,
    };
  }
  if (n.kind === "payout_note" || title === "Withdrawal request needs attention") {
    return {
      t: t(
        "Withdrawal failed, tap to know more",
        "فشل إيداع المبلغ من محفظتك إلى حسابك، انقر لمعرفه المزيد",
      ),
      b: body,
    };
  }
  if (n.kind === "order_refunded" || title === "Order refunded") {
    const pname = (d.product_name as string) || "";
    const enT = (pname ? pname + " " : "") + "fee was refunded back to the customer";
    const enB = amtStr != null ? "-" + amtStr + " was deducted from your wallet to the customer" : "";
    const arT = "عربون " + (pname ? pname + " " : "") + "تم استرجاعه للزبون،";
    const arB = amtStr != null ? "و تم خصم -" + amtStr + " من حسابك إلى الزبون" : "";
    return { t: t(enT, arT), b: t(enB, arB) };
  }
  if (n.kind === "order_failed" || title === "Order failed" || title === "Cash on Delivery Failed") {
    return {
      t: t("Cash on Delivery Failed", "فشل الدفع عند الاستلام"),
      b: t("The customer did not receive the product", "لم يستلم الزبون المنتج"),
    };
  }
  if (n.kind === "order_delivered" || title === "Order Delivered") {
    /* Delivery starts the refund window rather than releasing the money, so
       saying only "the customer received it" would leave the marketer
       wondering why their available balance did not move. The number comes
       from the notification itself — it is the market's rule at the moment
       the order was delivered, not whatever the rule happens to be today. */
    const days = Number(d.available_in_days) || LIBYA.money.refundWindowDays;
    return {
      t: t("Order Delivered", "تم تسليم الطلب"),
      b: t(
        `The customer has received the product. Your commission becomes available to withdraw in ${days} days.`,
        `استلم الزبون المنتج. عمولتك تصبح متاحة للسحب بعد ${days} أيام.`,
      ),
    };
  }
  if (n.kind === "receipt_verified" || title === "Receipt Verified") {
    return {
      t: t("Receipt Verified", "تم اعتماد الإيصال"),
      b: t(
        "Your payment receipt has been verified. Your commission is on the way, and becomes available once the order is delivered.",
        "تم اعتماد الإيصال. عمولتك في الطريق، وتصبح متاحة بعد تسليم الطلبية.",
      ),
    };
  }
  if (n.kind === "receipt_rejected" || title === "Receipt rejected by the admin") {
    return { t: t("Receipt rejected by the admin", "تم رفض الإيصال من قبل الأدمن"), b: "" };
  }
  if (n.kind === "report_reviewed" || title === "Report reviewed") {
    return { t: t("Report reviewed", "تمت مراجعة البلاغ"), b: body };
  }
  if (n.kind === "account_deletion_scheduled" || title === "Account deletion scheduled") {
    const sched = d.scheduled_for ? new Date(d.scheduled_for as string) : null;
    const dateStr = sched ? sched.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
    return {
      t: t("Account deletion scheduled", "سوف يتم حذف حسابك"),
      b: t(
        "Your account will be permanently deleted on " + dateStr + ". You can cancel anytime from your profile info page.",
        "سيتم حذف حسابك نهائياً بتاريخ " + dateStr + ". يمكنك إلغاء الطلب في أي وقت من صفحه معلوماتك الشخصيه.",
      ),
    };
  }
  if (n.kind === "account_deletion_rejected" || title === "Account deletion request declined") {
    return { t: t("Account deletion request declined", "تم رفض طلب حذف حسابك"), b: body };
  }
  /* Named rather than vague: "Your email was updated" says which detail moved,
     which is the whole thing somebody wants to know when their sign-in
     suddenly works differently. The fields ride along in the notification's
     data, so the wording is built here and reads in whichever language the
     person has the app in. */
  if (n.kind === "change_request_done") {
    return { t: changedTitle(d.fields, isAr()), b: body };
  }
  if (n.kind === "admin_message" || n.kind === "admin_broadcast") {
    return { t: title, b: "" };
  }
  return { t: title, b: body };
}

export function NotificationsPage({ onBack }: { onBack: () => void }) {
  const { notifications, newNotifIds } = useMarketerData();
  const { isOpen, toggle } = useAccordion();
  const lightbox = usePhotoLightbox();

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>Notifications</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onBack}
          style={{
            width: 34, height: 34, borderRadius: "50%", border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)", color: "var(--color-text-primary)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            fontSize: 18, lineHeight: 1, padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div className="notif-list">
        {!notifications.length ? (
          <div className="empty-center" style={{ padding: "60px 20px" }}>
            <div className="empty-text" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
              {t("No notifications yet.", "لا توجد إشعارات بعد.")}
            </div>
          </div>
        ) : (
          notifications.map((n) => (
            <NotifItem
              key={n.id}
              n={n}
              isNew={newNotifIds.has(n.id)}
              expanded={isOpen(n.id)}
              onToggle={() => toggle(n.id)}
              onPhoto={lightbox.openOne}
            />
          ))
        )}
      </div>
    </>
  );
}

export function NotifItem({
  n, isNew, expanded, onToggle, onPhoto,
}: {
  n: NotificationRow;
  isNew: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPhoto: (url: string) => void;
}) {
  const L = localize(n);
  const d = parseData(n.data);

  const isFailed = n.kind === "order_failed";
  const isDelivered = n.kind === "order_delivered";
  const isVerified = n.kind === "receipt_verified";
  const isRejected = n.kind === "receipt_rejected";
  const isReportReviewed = n.kind === "report_reviewed";
  const isRefunded = n.kind === "order_refunded";
  const isNote = n.kind === "payout_note";
  const isAdminMsg = n.kind === "admin_message" || n.kind === "admin_broadcast";
  const isPaid = n.kind === "payout_paid";
  const expandable =
    isFailed || isDelivered || isVerified || isRejected || isReportReviewed || isRefunded || isNote || isAdminMsg || isPaid;

  const color = isPaid
    ? "#2dbd8f"
    : isNote
      ? "#e07070"
      : isFailed || isRejected || isRefunded
        ? "#e07070"
        : isDelivered || isVerified || isReportReviewed
          ? "#2dbd8f"
          : "#7f77dd";

  const iconRaw = (d.product_photo || d.photo) as string | undefined;
  // A PDF attachment has no thumbnail to put in the row, so the row keeps its
  // coloured dot and the document shows in the body instead.
  const iconPhotoUrl = isSafeUrl(iconRaw) && !isPdfUrl(iconRaw) ? (iconRaw as string) : "";
  const hasPhoto = !!iconPhotoUrl;
  /* The one picture worth opening: the receipt the admin attaches to a paid
     withdrawal. Everything else here is a product photo. */
  const zoomable = isPaid && expanded;

  const icon = hasPhoto ? (
    <div className="notif-icon notif-icon-photo" style={{ backgroundImage: `url('${iconPhotoUrl}')` }} />
  ) : (
    <div className="notif-icon" style={{ background: color + "22", color }}>•</div>
  );

  /** Collapses on a tap that was not meant for something inside. */
  const onInsideTap = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest("a, button, img, textarea, input, iframe, [role='button']")) return;
    onToggle();
  };

  const mainText = L.t;
  const subText = isNote ? "" : L.b;

  const rightDot = isNew ? (
    <div className="notif-new-dot" style={{ flexShrink: 0, marginTop: 4 }} />
  ) : (
    <div style={{ width: 8, flexShrink: 0 }} />
  );

  if (!expandable) {
    return (
      <div className="notif-item">
        {icon}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-title" {...(isAdminMsg ? { "data-no-i18n": "" } : {})}>{mainText}</div>
          {!!subText && <div className="notif-body">{subText}</div>}
          <div className="notif-time">{ago(n.created_at)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>{rightDot}</div>
      </div>
    );
  }

  return (
    <div className={"notif-item expandable" + (expanded ? " expanded" : "")} data-id={n.id}>
      <div className="notif-top" onClick={onToggle}>
        {hasPhoto ? (
          <div className="notif-photo-wrap">
            {/* Cropped to a small square, so it is framed the way the owner
                framed it rather than from the middle.

                Only the receipt the admin sends for a paid withdrawal opens
                full screen. For every other kind this is the product's own
                photo, already shown at the size it is worth, and the tap did
                nothing but interrupt someone scrolling the list. Shut, it is a
                34px thumbnail in a row whose only job is to open the card. */}
            <img
              src={iconPhotoUrl}
              alt=""
              loading="lazy"
              onClick={zoomable ? (e) => { e.stopPropagation(); onPhoto(iconPhotoUrl); } : undefined}
              style={{
                ...coverStyle(d.cover_focus_x, d.cover_focus_y),
                ...(expanded ? { objectFit: "contain" as const } : null),
                ...(zoomable ? { cursor: "zoom-in" } : null),
              }}
            />
          </div>
        ) : (
          icon
        )}
        <div className="notif-row-text">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="notif-title" {...(isAdminMsg ? { "data-no-i18n": "" } : {})}>{mainText}</div>
            {!!subText && <div className="notif-body">{subText}</div>}
            <div className="notif-time">{ago(n.created_at)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>{rightDot}</div>
        </div>
      </div>
      {/* Open, a tap anywhere shuts it again. It used to be only the header,
          which is off the top of the screen by the time you have read to the
          bottom of a long one. Taps on something that does its own job — a
          photo that opens, a phone number that dials — are left alone. */}
      <div className="notif-detail-body" onClick={expanded ? onInsideTap : undefined}>
        <NotifDetailBox n={n} hasRowPhoto={hasPhoto} onPhoto={onPhoto} />
      </div>
    </div>
  );
}
