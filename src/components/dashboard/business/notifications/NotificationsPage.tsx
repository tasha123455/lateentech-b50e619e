import { useEffect, useMemo, useState } from "react";

import { useBusinessData } from "../BusinessDataProvider";
import { isAr, splitCC } from "../lib/format";
import { useLightbox } from "../ui/Lightbox";

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

export function NotificationsPage({ active, onBack }: { active: boolean; onBack: () => void }) {
  const { api, notifications, reviews, reloadNotifications } = useBusinessData();
  const lightbox = useLightbox();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
    <div className="page active" id="pg-notif">
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
            const kind = (n.type as string) || (n as Record<string, unknown>).kind as string || "";
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
            const isAdminMsg = kind === "admin_message" || kind === "admin_broadcast";
            if (isAdminMsg) b = "";
            if (kind === "order_refunded") {
              const pn = d ? str(d.product_name) : "";
              const cn = d ? str(d.customer_name) : "";
              t = tr("Order refunded", "تم استرجاع الطلب");
              b = isAr() ? "تم استرجاع طلبية " + pn + " للزبون " + cn : "Order " + pn + " refunded for customer " + cn;
            }
            let author = "";
            let rating = 0;
            if (kind === "product_review") {
              author = d ? str(d.author) || "Marketer" : "Marketer";
              const pname = d ? str(d.product_name) : "";
              rating = d ? Number(d.rating) || 0 : 0;
              t = tr("New product review", "تقييم جديد للمنتج");
              b = isAr()
                ? `${author} قيّم المنتج ${pname} ${arStarsPhrase(rating)}`
                : `${author} rated ${pname} ${rating} ${rating === 1 ? "star" : "stars"}`;
              const photoUrl = d ? str(d.photo) : "";
              const text = d ? str(d.text) : "";
              if (text) {
                const stars = "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
                reviewDetails = (
                  <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "#181818", border: "0.5px solid #232323", fontSize: 12, color: "var(--color-text-primary)" }}>
                    <div style={{ color: "#e9b949", letterSpacing: 2, marginBottom: 4 }}>{stars}</div>
                    <span data-no-i18n="">{text}</span>
                    {photoUrl ? (
                      <div
                        style={{ marginTop: 8, width: 64, height: 64, borderRadius: 10, overflow: "hidden", cursor: "pointer", border: "1px solid var(--color-border-secondary)" }}
                        onClick={(e) => { e.stopPropagation(); lightbox.open([photoUrl], 0); }}
                      >
                        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    ) : null}
                  </div>
                );
              } else if (photoUrl) {
                reviewDetails = (
                  <div
                    style={{ marginTop: 8, width: 64, height: 64, borderRadius: 10, overflow: "hidden", cursor: "pointer", border: "1px solid var(--color-border-secondary)" }}
                    onClick={(e) => { e.stopPropagation(); lightbox.open([photoUrl], 0); }}
                  >
                    <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                );
              }
            }

            const expandable = kind === "new_order" || kind === "order_refunded" || isAdminMsg;
            const color = kind === "new_order" ? "#34c77b" : kind === "order_refunded" ? "#E24B4A" : kind === "product_review" ? "#e9b949" : "#7f77dd";

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
            if (expandable && d) {
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
              const isOpen = !!expanded[n.id];
              return (
                <div className={"notif-item expandable" + (isOpen ? " expanded" : "")} data-id={n.id} key={n.id}>
                  <div className="notif-top" onClick={() => setExpanded((s) => ({ ...s, [n.id]: !s[n.id] }))}>
                    {hasPhoto ? (
                      <div className="notif-photo-wrap"><img src={iconPhotoUrl} alt="" loading="lazy" /></div>
                    ) : iconHtml}
                    <div className="notif-row-text">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="notif-title" data-no-i18n={isAdminMsg ? "" : undefined}>{t}</div>
                        {b ? <div className="notif-body">{b}</div> : null}
                        <div className="notif-time">{ago(n.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>{rightDot}</div>
                    </div>
                  </div>
                  <div className="notif-detail-body">{detailsHtml}</div>
                </div>
              );
            }

            return (
              <div className="notif-item" key={n.id}>
                {iconHtml}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-title" data-no-i18n={isAdminMsg ? "" : undefined}>{t}</div>
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
    </div>
  );
}
