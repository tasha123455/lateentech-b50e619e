import { useEffect, useState } from "react";

import { useBusinessData } from "../BusinessDataProvider";
import { isAr, splitCC, stripCC, dispPhone } from "../lib/format";

function t(en: string, ar: string): string { return isAr() ? ar : en; }

export function ProfileOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, profile, reloadProfile } = useBusinessData();
  const ar = isAr();

  const [name, setName] = useState("");
  const [biz, setBiz] = useState("");
  const [waNum, setWaNum] = useState("");
  const [waCc, setWaCc] = useState("\u200E+218\u200E");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [avatarHint, setAvatarHint] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [crOpen, setCrOpen] = useState(false);
  const [crPhone, setCrPhone] = useState(false);
  const [crEmail, setCrEmail] = useState(false);
  const [crCountry, setCrCountry] = useState(false);
  const [delStatus, setDelStatus] = useState<{ id: string; status: string; scheduled_for?: string | null } | null>(null);
  const [delOverlayOpen, setDelOverlayOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(profile?.full_name || "");
    setBiz(profile?.business_name || "");
    const wa = stripCC(profile?.whatsapp);
    setWaNum(wa.num || "");
    setWaCc(wa.cc || "\u200E+218\u200E");
    setAvatarHint(t("Tap the camera to change photo", "اضغط على أيقونة الكاميرا لتغيير الصورة"));
    void reloadProfile();
    (async () => {
      try { setDelStatus((await api.getAccountDeletionStatus()) as typeof delStatus); } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const avatarUrl = profile?.avatar_signed_url as string | undefined;

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert(t("Image too large (max 5 MB)", "الصورة كبيرة جداً (أقصى 5 ميغابايت)")); return; }
    setAvatarHint(t("Uploading photo…", "جارٍ رفع الصورة…"));
    try {
      await api.uploadAvatar(file);
      await reloadProfile();
      setAvatarHint(t("Tap the camera to change photo", "اضغط على أيقونة الكاميرا لتغيير الصورة"));
    } catch (e) {
      console.error(e);
      alert(ar ? "فشل رفع الصورة" : "Upload failed");
      setAvatarHint(t("Tap the camera to change photo", "اضغط على أيقونة الكاميرا لتغيير الصورة"));
    }
  };

  const save = async () => {
    const waDigits = waNum.replace(/\D/g, "");
    if (waDigits && !/^09[1-4]\d{7}$/.test(waDigits)) {
      alert(ar ? "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094" : "Phone must be 10 digits and start with 091, 092, 093, or 094.");
      return;
    }
    const mainPhoneDigits = stripCC(profile?.phone).num || "";
    if (waDigits && mainPhoneDigits && waDigits === mainPhoneDigits) {
      alert(ar ? "لا يمكن أن يكون رقم الهاتف الإضافي نفس رقم الهاتف الأساسي" : "Additional phone number can't be the same as your phone number.");
      return;
    }
    const wa = waDigits ? "+218" + waDigits : "";
    const patch = { full_name: name.trim() || null, business_name: biz.trim() || null, whatsapp: wa.trim() || null };
    setSaveState("saving");
    try {
      await api.updateProfile(patch);
      await reloadProfile();
      setSaveState("saved");
      setTimeout(() => { setSaveState("idle"); onClose(); }, 700);
    } catch (e) {
      console.error(e);
      alert(ar ? "فشل الحفظ" : "Save failed");
      setSaveState("idle");
    }
  };

  const sendChangeRequest = () => {
    const items: string[] = [];
    if (crPhone) items.push(ar ? "رقم الهاتف" : "Phone number");
    if (crEmail) items.push(ar ? "البريد الإلكتروني" : "Email");
    if (crCountry) items.push(ar ? "الدولة" : "Country");
    if (!items.length) return;
    const p = profile || {};
    const pname = p.full_name || "";
    const lines = ar
      ? ["مرحباً، أرغب بطلب تغيير في بيانات حسابي على لاتين.", "الاسم: " + pname, "الهاتف الحالي: " + (p.phone || "-"), "البريد الحالي: " + (p.email || "-"), "أريد تغيير: " + items.join("، ")]
      : ["Hello, I would like to request a change to my Lateen account.", "Name: " + pname, "Current phone: " + (p.phone || "-"), "Current email: " + (p.email || "-"), "I want to change: " + items.join(", ")];
    const msg = encodeURIComponent(lines.join("\n"));
    window.open("https://wa.me/218915756638?text=" + msg, "_blank");
    setCrOpen(false);
    alert(t("WhatsApp opened to send your request to the admin", "تم فتح واتساب لإرسال طلبك إلى الأدمن"));
  };

  const saveTxt = saveState === "saving" ? t("Saving…", "جارٍ الحفظ…") : saveState === "saved" ? t("Saved", "تم الحفظ") : t("Save", "حفظ");

  let deleteSlot: React.ReactNode;
  if (delStatus && delStatus.status === "scheduled") {
    const d = delStatus.scheduled_for ? new Date(delStatus.scheduled_for) : null;
    const dateStr = d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
    deleteSlot = (
      <div onClick={() => setDelOverlayOpen(true)} style={{ cursor: "pointer", textAlign: "right", fontSize: 12, lineHeight: 1.5, color: "#e07070" }}>
        {t("Account deletion scheduled for", "حذف الحساب مجدول بتاريخ")} <b data-no-i18n="">{dateStr}</b>
      </div>
    );
  } else if (delStatus && delStatus.status === "wallet_review") {
    deleteSlot = (
      <div onClick={() => setDelOverlayOpen(true)} style={{ cursor: "pointer", textAlign: "right", fontSize: 12, lineHeight: 1.5, color: "#e07070" }}>
        {t("Deletion request under review", "طلب حذف الحساب قيد المراجعة")}
      </div>
    );
  } else {
    deleteSlot = (
      <button type="button" onClick={() => setDelOverlayOpen(true)} style={{ background: "transparent", color: "#e07070", border: "1px solid #e07070", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {t("Delete my account", "حذف الحساب")}
      </button>
    );
  }

  return (
    <>
      <div className="menu-overlay open" id="profile-overlay">
        <div className="menu-backdrop" onClick={onClose} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, background: "#1e1e1e", padding: "1.5rem", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: "var(--color-text-primary)" }}>{t("Profile", "الملف الشخصي")}</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: "1.25rem" }}>
            <div style={{ position: "relative" }}>
              <div
                id="prof-avatar"
                style={{ width: 88, height: 88, borderRadius: "50%", background: "#0A3C2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "#34c77b", fontWeight: 500, backgroundSize: "cover", backgroundPosition: "center", overflow: "hidden", backgroundImage: avatarUrl ? `url('${avatarUrl}')` : undefined }}
              />
              <label htmlFor="prof-avatar-file" style={{ position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: "50%", background: "#34c77b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid #1e1e1e" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
                </svg>
              </label>
              <input id="prof-avatar-file" type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { void pickAvatar(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{avatarHint}</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <label className="pd-lbl">
              <span className="pd-lbl-head">{t("Full name", "الاسم الكامل")}</span>
              <input className="pd-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Example: Kim Kardashian", "مثال: هيفاء وهبي")} />
            </label>
            <label className="pd-lbl">
              <span className="pd-lbl-head">{t("Business name", "اسم المشروع")}</span>
              <input className="pd-inp" value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Business name" />
            </label>
            <div style={{ border: "1px solid #2a2a2a", borderRadius: 14, padding: 14, display: "grid", gap: 12, background: "#181818" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Phone number", "رقم الهاتف")}</span>
                <span dir="ltr" style={{ fontSize: 13, color: "var(--color-text-primary)" }} data-no-i18n="">{dispPhone(profile?.phone)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Email", "البريد الإلكتروني")}</span>
                <span dir="ltr" style={{ fontSize: 13, color: "var(--color-text-primary)", textAlign: "end", wordBreak: "break-all" }} data-no-i18n="">{profile?.email as string || ""}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("Country", "الدولة")}</span>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }} data-no-i18n="">🇱🇾 Libya</span>
              </div>
            </div>
            <button type="button" onClick={() => { setCrPhone(false); setCrEmail(false); setCrCountry(false); setCrOpen(true); }} style={{ width: "100%", background: "transparent", border: "1px solid #3a3a3a", color: "var(--color-text-primary)", borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {t("Change", "تغيير")}
            </button>
            <label className="pd-lbl">
              <span className="pd-lbl-head">
                {t("WhatsApp or additional phone number", "واتساب او رقم هاتف إضافي")}{" "}
                <span style={{ color: "var(--color-text-tertiary)", fontSize: 10, fontWeight: 400 }}>{t("(optional)", "(اختياري)")}</span>
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button type="button" className="pd-inp pd-picker-btn" onClick={() => setPickerOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 4, width: 82 }} dir="ltr">
                    <span data-no-i18n="">{waCc}</span>
                    <span style={{ opacity: 0.5, fontSize: 11 }}>▾</span>
                  </button>
                  {pickerOpen ? (
                    <div className="pd-picker-list" style={{ display: "block", position: "absolute", zIndex: 5, width: 190, top: "calc(100% + 4px)" }}>
                      <button type="button" className="pd-picker-item" onClick={() => { setWaCc("\u200E+218\u200E"); setPickerOpen(false); }} dir="ltr">
                        <span>+218 — <span data-i18n="Libya">Libya</span></span>
                      </button>
                      <div className="pd-picker-item pd-picker-disabled">
                        <span data-i18n="More">More</span>
                        <span className="pd-soon-pill" data-i18n="Soon">Soon</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <input className="pd-inp" value={waNum} onChange={(e) => setWaNum(e.target.value)} placeholder="092xxxxxxx" inputMode="numeric" dir="ltr" style={{ textAlign: "left", flex: 1 }} />
              </div>
            </label>
          </div>
          <button onClick={() => void save()} disabled={saveState === "saving"} style={{ width: "100%", marginTop: "1.25rem", background: "#34c77b", color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: saveState === "saving" ? 0.7 : 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
            <span>{saveTxt}</span>
          </button>
          <div style={{ marginTop: 28, paddingTop: 16, borderTop: "0.5px solid #2a2a2a" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>{deleteSlot}</div>
          </div>
        </div>
      </div>

      {crOpen ? (
        <div className="menu-overlay open" id="change-request-overlay" style={{ zIndex: 110, alignItems: "center", justifyContent: "center" }}>
          <div className="menu-backdrop" onClick={() => setCrOpen(false)} />
          <div style={{ position: "relative", width: "min(88%,360px)", background: "#1e1e1e", borderRadius: 16, padding: "1.25rem", border: "0.5px solid #2a2a2a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>{t("What would you like to change?", "ما الذي تريد تغييره؟")}</div>
              <button onClick={() => setCrOpen(false)} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{ display: "grid", gap: 0, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", borderBottom: "0.5px solid #2a2a2a", cursor: "pointer" }}>
                <input type="checkbox" checked={crPhone} onChange={(e) => setCrPhone(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#8b83e8", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{t("Change phone number", "تغيير رقم الهاتف")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", borderBottom: "0.5px solid #2a2a2a", cursor: "pointer" }}>
                <input type="checkbox" checked={crEmail} onChange={(e) => setCrEmail(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#8b83e8", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{t("Change email", "تغيير البريد الإلكتروني")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px", cursor: "pointer" }}>
                <input type="checkbox" checked={crCountry} onChange={(e) => setCrCountry(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#8b83e8", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{t("Change country", "تغيير الدولة")}</span>
              </label>
            </div>
            <button
              type="button"
              onClick={sendChangeRequest}
              disabled={!crPhone && !crEmail && !crCountry}
              style={{ width: "100%", background: "#8b83e8", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: (!crPhone && !crEmail && !crCountry) ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              </svg>
              <span>{t("Send to admin for change", "إرسال إلى الأدمن للتغيير")}</span>
            </button>
          </div>
        </div>
      ) : null}

      {delOverlayOpen ? (
        <DeleteAccountOverlayLazy open={delOverlayOpen} onClose={() => setDelOverlayOpen(false)} />
      ) : null}
    </>
  );
}

// Local import kept lazy-free (direct) to avoid a circular import cycle
// between the profile overlay and the delete-account overlay.
import { DeleteAccountOverlay as DeleteAccountOverlayLazy } from "./DeleteAccountOverlay";
