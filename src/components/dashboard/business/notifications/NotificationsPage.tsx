import { useEffect, useMemo, useState } from "react";
import { changedTitle } from "@/lib/changedFields";
import { FulfilmentBadge } from "@/components/shared/FulfilmentBadge";
import { asFulfilment } from "@/lib/fulfilment";
import { coverStyle } from "@/lib/coverFocus";
import { useAccordion } from "@/lib/useAccordion";

import { useBusinessData } from "../BusinessDataProvider";
import { bidiIsolate, isAr, splitCC } from "../lib/format";

function tr(en: string, ar: string): string {
  return isAr() ? ar : en;
}

function arStarsPhrase(n: number): string {
  if (n === 1) return "نجمه واحده";
  if (n === 2) return "نجمتين";
  if (n >= 3 && n <= 10) return n + " نجوم";
  return n + " نجمه";
}

function ago(t: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  const ar = isAr();
  if (s < 60) return ar ? s + "ث" : s + "s";
  if (s < 3600) return ar ? Math.floor(s / 60) + "د" : Math.floor(s / 60) + "m";
  if (s < 86400) return ar ? Math.floor(s / 3600) + "س" : Math.floor(s / 3600) + "h";
  return ar ? Math.floor(s / 86400) + "يوم" : Math.floor(s / 86400) + "d";
}

function parseData(d: unknown): Record<string, unknown> | null {
  if (!d) return null;
  if (typeof d === "string") {
    try { return JSON.parse(d) as Record<string, unknown>; } catch { return null; }
  }
  return d as Record<string, unknown>;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function Row({ k, v, noTranslate }: { k: string; v: string; noTranslate?: boolean }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
      <span data-no-i18n={noTranslate ? "" : undefined} style={{ color: "var(--color-text-primary)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

/** The mark on a report notification.
 *
 *  Drawn rather than an emoji: ⚠️ is a different picture on every phone, and
 *  three of them in a row is the visual register of a scam text. One small
 *  triangle in the same red the card already uses says the same thing without
 *  shouting, and it inherits the line's own size so it never fights the title.
 *
 *  aria-hidden because the title says what this is; a screen reader announcing
 *  "warning" before it would be reading the decoration aloud. */
function WarnMark() {
  return (
    <svg
      viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      style={{
        width: "1.05em", height: "1.05em", flexShrink: 0,
        marginInlineStart: 6, verticalAlign: "-0.15em",
      }}
    >
      <path
        d="M12 3.6 22 20.4H2z"
        fill="rgba(226,75,74,0.16)" stroke="#E24B4A" strokeWidth="1.7" strokeLinejoin="round"
      />
      <path d="M12 10v4.4" stroke="#E24B4A" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.05" fill="#E24B4A" />
    </svg>
  );
}

export function NotificationsPage({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { api, notifications, reviews, reloadNotifications } = useBusinessData();
  const { isOpen: isNotifOpen, toggle: toggleNotif } = useAccordion();
  const [avatarByMarketer, setAvatarByMarketer] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const amap: Record<string, string> = {};
      await Promise.all(
        (reviews || []).map(async (r) => {
          if (!r.marketer_id) return;
          try {
            const av = r.avatar_path ? await api.avatarPublicUrl(r.avatar_path) : "";
            amap[r.marketer_id] = av;
          } catch { /* ignore */ }
        }),
      );
      if (!cancelled) setAvatarByMarketer(amap);
    })();
    return () => { cancelled = true; };
  }, [reviews, api]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      try { await api.markNotificationsRead(); } catch { /* ignore */ }
      await reloadNotifications();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const items = useMemo(() => notifications, [notifications]);

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="page-title">Notifications</div>
        <button
          type="button"
          aria-label="Close"
          onClick={onBack}
          style={{ width: 34, height: 34, borderRadius: "50%", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      </div>
      <div className="notif-list" id="notif-list">
        {!items.length ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
            {tr("No notifications yet.", "لا توجد إشعارات بعد.")}
          </div>
        ) : (
          items.map((n) => {
            const kind = ((n as Record<string, unknown>).kind as string) || "";
            let t = n.title || "";
            let b = n.body || "";
            let reviewDetails: React.ReactNode = null;

            if (kind === "new_order" || t === "New order") {
              t = tr("New order", "طلب جديد");
              b = tr("A new order has been received. Check the Orders page.", "وصلك طلب جديد. راجع صفحة الطلبات.");
            }
            let d = parseData(n.data);
            if (kind === "account_deletion_scheduled" || t === "Account deletion scheduled") {
              const sched = d && d.scheduled_for ? new Date(str(d.scheduled_for)) : null;
              const dateStr = sched ? sched.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
              t = tr("Account deletion scheduled", "سوف يتم حذف حسابك");
              b = tr(
                "Your account will be permanently deleted on " + dateStr + ". You can cancel anytime from your profile info page.",
                "سيتم حذف حسابك نهائياً بتاريخ " + dateStr + ". يمكنك إلغاء الطلب في أي وقت من صفحه معلوماتك الشخصيه.",
              );
            }
            if (kind === "account_deletion_rejected" || t === "Account deletion request declined") {
              t = tr("Account deletion request declined", "تم رفض طلب حذف حسابك");
            }
            /* Says which detail moved rather than "your details", which is
               the whole thing somebody wants to know when their sign-in
               suddenly works differently. */
            if (kind === "change_request_done") {
              t = changedTitle(d ? (d as { fields?: unknown }).fields : null, isAr());
            }
            const isAdminMsg = kind === "admin_message" || kind === "admin_broadcast";
            if (isAdminMsg) b = "";
            if (kind === "order_refunded") {
              const pn = d ? str(d.product_name) : "";
              const cn = d ? str(d.customer_name) : "";
              t = tr("Order refunded", "تم استرجاع الطلب");
              b = isAr() ? "تم استرجاع طلبية " + pn + " للزبون " + cn : "Order " + pn + " refunded for customer " + cn;
            }
            /* A report against this shop's product. Serious enough to be
               marked, but marked with a drawn triangle rather than a row of
               emoji — three ⚠️ in a list of tidy rows reads as spam, and the
               emoji renders differently on every phone. */
            let warn = false;
            if (kind === "product_reported") {
              t = tr("A report about your product", "هناك بلاغ على منتجك");
              warn = true;
            }
            let author = "";
            let rating = 0;
            if (kind === "product_review") {
              author = d ? str(d.author) || "Marketer" : "Marketer";
              const pname = d ? str(d.product_name) : "";
              rating = d ? Number(d.rating) || 0 : 0;
              t = tr("New product review", "تقييم جديد للمنتج");
              /* Every part that is a name or a count is isolated. A product
                 called "clothes" sitting in an Arabic line would otherwise
                 swallow the digit that follows it — a European number takes the
                 direction of the Latin word before it — and "3 نجوم" would
                 render with its 3 stranded on the far side of the word it
                 counts. The same happens the other way with an Arabic product
                 name in the English line. */
              const iso = bidiIsolate;
              b = isAr()
                ? `${iso(author)} قيّم المنتج ${iso(pname)} ${iso(arStarsPhrase(rating))}`
                : `${iso(author)} rated ${iso(pname)} ${iso(rating + " " + (rating === 1 ? "star" : "stars"))}`;
              const photoUrl = d ? str(d.photo) : "";
              const text = d ? str(d.text) : "";
              if (text) {
                const stars = "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
                reviewDetails = (
                  <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "#181818", border: "0.5px solid #232323", fontSize: 12, color: "var(--color-text-primary)" }}>
                    <div style={{ color: "#e9b949", letterSpacing: 2, marginBottom: 4 }}>{stars}</div>
                    <span data-no-i18n="">{text}</span>
                    {/* Not a link to anything. A review's photo is context for
                        the words next to it; opening it full screen was a tap
                        people hit while trying to scroll. */}
                    {photoUrl ? (
                      <div
                        style={{ marginTop: 8, width: 64, height: 64, borderRadius: 10, overflow: "hidden", border: "1px solid var(--color-border-secondary)" }}
                      >
                        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", display: "block", ...coverStyle(d?.cover_focus_x, d?.cover_focus_y) }} />
                      </div>
                    ) : null}
                  </div>
                );
              } else if (photoUrl) {
                reviewDetails = (
                  <div
                    style={{ marginTop: 8, width: 64, height: 64, borderRadius: 10, overflow: "hidden", border: "1px solid var(--color-border-secondary)" }}
                  >
                    <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", display: "block", ...coverStyle(d?.cover_focus_x, d?.cover_focus_y) }} />
                  </div>
                );
              }
            }

            /* A report about this shop's product opens like the rest. It was
               left off this list, so the card carried the one line of its
               title and nothing else: tapping it did nothing, which reads as
               a notification that is stuck. What the shop needs is inside —
               which product, what kind of report, and what the admin said
               about it. */
            const isReport = kind === "product_reported";
            const expandable = kind === "new_order" || kind === "order_refunded" || isAdminMsg || isReport;
            const color = kind === "new_order" ? "#34c77b"
              : kind === "order_refunded" || kind === "product_reported" ? "#E24B4A"
              : kind === "product_review" ? "#e9b949" : "#7f77dd";

            const iconD = d || {};
            const liveAv = kind === "product_review" && iconD.marketer_id ? avatarByMarketer[str(iconD.marketer_id)] : "";
            const iconRaw = kind === "product_review" ? (liveAv || str(iconD.avatar)) : str(iconD.product_photo || iconD.photo);
            const iconPhotoUrl = iconRaw && /^(https?:|data:|\/)/.test(iconRaw) ? iconRaw : "";
            const hasPhoto = !!iconPhotoUrl;
            const reviewInitial = kind === "product_review" ? (author.trim().charAt(0).toUpperCase() || "M") : "";

            const isNew = !n.read_at;
            const rightDot = isNew
              ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E24B4A", flexShrink: 0, marginTop: 4 }} />
              : <div style={{ width: 8, flexShrink: 0 }} />;

            let detailsHtml: React.ReactNode = null;
            if (isReport && d) {
              /* Its own shape. A report has no order behind it — no customer,
                 no address, no quantity — so it cannot borrow the block below,
                 which would come out as a column of empty rows. */
              const rPhoto = str(d.product_photo);
              const rType = str(d.report_type);
              const typeLbl = rType === "product"
                ? tr("Product", "المنتج")
                : rType === "merchant" || rType === "business"
                  ? tr("Merchant", "التاجر")
                  : tr("Other", "أخرى");
              detailsHtml = (
                <div className="notif-details-box">
                  {!hasPhoto && rPhoto && /^(https?:|data:|\/)/.test(rPhoto) ? (
                    <div style={{ margin: "-2px 0 10px 0" }}>
                      <img src={rPhoto} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "#0d0d0d", borderRadius: 10, display: "block" }} />
                    </div>
                  ) : null}
                  <Row k={tr("Product", "المنتج")} v={str(d.product_name)} noTranslate />
                  <Row k={tr("Report type", "نوع البلاغ")} v={typeLbl} />
                  {d.admin_comment ? (
                    <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(226,75,74,0.09)", border: "0.5px solid rgba(226,75,74,0.3)", color: "#f0a3a2", fontSize: 11.5 }}>
                      <b>{tr("Admin notes", "ملاحظات الأدمن")}:</b> <span data-no-i18n="">{str(d.admin_comment)}</span>
                    </div>
                  ) : null}
                </div>
              );
            } else if (expandable && d) {
              const photoUrl = str(d.product_photo || d.photo);
              const photo = (!hasPhoto && photoUrl && /^(https?:|data:|\/)/.test(photoUrl)) ? (
                <div style={{ margin: "-2px 0 10px 0" }}>
                  <img src={photoUrl} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", background: "#0d0d0d", borderRadius: 10, display: "block" }} />
                </div>
              ) : null;
              const adminMsgText = isAdminMsg ? str(d.message || n.body) : "";
              const custPhone = splitCC(str(d.customer_phone));
              const custWa = d.customer_whatsapp ? splitCC(str(d.customer_whatsapp)) : null;
              const variants = Array.isArray(d.selected_variants) ? (d.selected_variants as Array<Record<string, unknown>>) : [];
              detailsHtml = (
                <div className="notif-details-box">
                  {photo}
                  {adminMsgText ? (
                    <div style={{ padding: "8px 10px", borderRadius: 8, background: "#0f0f0f", color: "var(--color-text-secondary)", fontSize: 12, whiteSpace: "pre-wrap" }} data-no-i18n="">{adminMsgText}</div>
                  ) : null}
                  <Row k={tr("Order Code", "كود الطلبيه")} v={str(d.order_code)} />
                  <Row k={tr("Product", "المنتج")} v={str(d.product_name)} noTranslate />
                  {/* Reserve or instant delivery, as the listing stood when
                      this notification was sent. */}
                  {!!asFulfilment(d.fulfilment) && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12 }}>
                      <span style={{ color: "var(--color-text-secondary)" }}>{tr("Fulfilment", "طريقة التسليم")}</span>
                      <span style={{ textAlign: "right" }}><FulfilmentBadge value={d.fulfilment} ar={isAr()} size="sm" /></span>
                    </div>
                  )}
                  <Row k={tr("Qty", "الكمية")} v={str(d.qty)} />
                  <Row k={tr("Customer", "الزبون")} v={str(d.customer_name)} noTranslate />
                  <Row k={tr("Phone", "الهاتف")} v={custPhone.cc ? `${custPhone.cc} | ${custPhone.num}` : custPhone.num} />
                  {custWa ? <Row k={tr("WhatsApp or additional phone number", "واتساب أو رقم هاتف إضافي")} v={custWa.cc ? `${custWa.cc} | ${custWa.num}` : custWa.num} /> : null}
                  <Row k={tr("City", "المدينة")} v={str(d.customer_city)} />
                  <Row k={tr("Country", "الدولة")} v={str(d.customer_country)} />
                  <Row k={tr("Address", "العنوان")} v={str(d.customer_address)} noTranslate />
                  {variants.length ? variants.map((sv, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12 }}>
                      <span data-no-i18n="" style={{ color: "var(--color-text-secondary)" }}>{str(sv.name)}</span>
                      <span data-no-i18n="" style={{ color: "var(--color-text-primary)", textAlign: "right" }}>{str(sv.value)}</span>
                    </div>
                  )) : (
                    <>
                      <Row k={tr("Size", "المقاس")} v={str(d.size)} noTranslate />
                      <Row k={tr("Colour", "اللون")} v={str(d.color)} noTranslate />
                    </>
                  )}
                  {d.customer_notes ? (
                    <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "#0f0f0f", color: "var(--color-text-secondary)", fontSize: 11 }}>
                      <b>{tr("Marketer note", "ملاحظات المسوق")}:</b> <span data-no-i18n="">{str(d.customer_notes)}</span>
                    </div>
                  ) : null}
                  {kind === "order_refunded" && (d.admin_comment || d.admin_note) ? (
                    <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(226,75,74,0.09)", border: "0.5px solid rgba(226,75,74,0.3)", color: "#f0a3a2", fontSize: 11.5 }}>
                      <b>{tr("Admin notes", "ملاحظات الأدمن")}:</b> <span data-no-i18n="">{str(d.admin_comment || d.admin_note)}</span>
                    </div>
                  ) : null}
                </div>
              );
            }

            const iconHtml = iconPhotoUrl ? (
              <div className="notif-icon notif-icon-photo" style={{ backgroundImage: `url('${iconPhotoUrl}')` }} />
            ) : kind === "product_review" ? (
              <div className="notif-icon" style={{ background: "var(--color-background-tertiary)", color: "var(--color-text-secondary)", fontWeight: 600 }}>{reviewInitial}</div>
            ) : (
              <div className="notif-icon" style={{ background: color + "22", color }}>•</div>
            );

            if (expandable && detailsHtml) {
              const isOpen = isNotifOpen(n.id);
              return (
                <div className={"notif-item expandable" + (isOpen ? " expanded" : "")} data-id={n.id} key={n.id}>
                  <div className="notif-top" onClick={() => toggleNotif(n.id)}>
                    {hasPhoto ? (
                      <div className="notif-photo-wrap">
                        {/* Cropped small, so it keeps the owner's framing. */}
                        <img src={iconPhotoUrl} alt="" loading="lazy" style={coverStyle(d?.cover_focus_x, d?.cover_focus_y)} />
                      </div>
                    ) : iconHtml}
                    <div className="notif-row-text">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-title" data-no-i18n={isAdminMsg ? "" : undefined}>
                    {t}
                    {warn && <WarnMark />}
                  </div>
                        {b ? <div className="notif-body">{b}</div> : null}
                        <div className="notif-time">{ago(n.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>{rightDot}</div>
                    </div>
                  </div>
                  {/* Open, a tap anywhere shuts it again — the header it opened
                      from is off the top of the screen by the time you have
                      read to the bottom of a long one, and the detail is most
                      of the card. Taps on something that does its own job —
                      a photo that opens, a phone number that dials — are left
                      alone. Same rule as the marketer's list. */}
                  <div
                    className="notif-detail-body"
                    onClick={isOpen ? (e) => {
                      const el = e.target as HTMLElement | null;
                      if (el?.closest("a, button, img, textarea, input, iframe, [role='button']")) return;
                      toggleNotif(n.id);
                    } : undefined}
                  >
                    {detailsHtml}
                  </div>
                </div>
              );
            }

            return (
              <div className="notif-item" key={n.id}>
                {iconHtml}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-title" data-no-i18n={isAdminMsg ? "" : undefined}>
                    {t}
                    {warn && <WarnMark />}
                  </div>
                  {b ? <div className="notif-body">{b}</div> : null}
                  {reviewDetails}
                  <div className="notif-time">{ago(n.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>{rightDot}</div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
