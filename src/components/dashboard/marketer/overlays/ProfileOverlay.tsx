import { useEffect, useRef, useState } from "react";
import { AdminEmailEditor } from "@/components/dashboard/shared/AdminEmailEditor";
import { PickerChevron } from "@/components/auth/CountryCodePicker";

import { useMarketerData } from "../MarketerDataProvider";
import { dispPhone, isAr, stripCC } from "../lib/format";
import { Avatar } from "../ui/Avatar";
import { ChangeRequestOverlay } from "./ChangeRequestOverlay";
import { DeleteAccountOverlay, DeleteAccountSlot, useDeletionStatus } from "./DeleteAccountOverlay";
import { PayoutFieldsBlock } from "./PayoutFields";
import { profT } from "./profileText";
import { phoneMeta, type PayoutFields as Fields } from "./usePayoutForm";

export function ProfileOverlay({
  open, onClose, fields, set,
}: {
  open: boolean;
  onClose: () => void;
  fields: Fields;
  set: (patch: Partial<Fields>) => void;
}) {
  const { api, profile, avatarUrl, reloadProfile } = useMarketerData();

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [waCc, setWaCc] = useState("‎+218‎");
  const [waPickerOpen, setWaPickerOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // Shown straight away after an admin changes it, so the row is not stale.
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [avatarHint, setAvatarHint] = useState("");
  const [changeOpen, setChangeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = profT();
  const deletion = useDeletionStatus(open);

  // Re-seed from the profile every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const p = profile || {};
    setName(p.full_name || "");
    const w = stripCC(p.whatsapp);
    setWhatsapp(w.num || "");
    setWaCc(w.cc || "‎+218‎");
    setSaveState("idle");
    setAvatarHint("");
  }, [open, profile]);

  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      alert(t.tooBig);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setAvatarHint(t.uploading);
    try {
      await api.uploadAvatar(f);
      await reloadProfile();
      setAvatarHint("");
    } catch (e) {
      console.error(e);
      alert(isAr() ? "فشل رفع الصورة" : "Upload failed");
      setAvatarHint("");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    const ar = isAr();
    const waDigits = whatsapp.replace(/\D/g, "");
    if (waDigits && !/^09[1-4]\d{7}$/.test(waDigits)) {
      alert(ar
        ? "رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 091 أو 092 أو 093 أو 094"
        : "Phone must be 10 digits and start with 091, 092, 093, or 094.");
      return;
    }
    const mainPhoneDigits = stripCC(profile?.phone).num || "";
    if (waDigits && mainPhoneDigits && waDigits === mainPhoneDigits) {
      alert(ar
        ? "لا يمكن أن يكون رقم الهاتف الإضافي نفس رقم الهاتف الأساسي"
        : "Additional phone number can't be the same as your phone number.");
      return;
    }

    const meta = phoneMeta(fields.method);
    const isPhoneMethod = !!meta;
    if (isPhoneMethod && !new RegExp("^(" + meta!.prefixes.join("|") + ")\\d{7}$").test(fields.phone.trim())) {
      alert(ar
        ? "الرجاء إدخال رقم هاتف صحيح. " + meta!.hintAr + "."
        : "Please enter a valid phone number. " + meta!.hintEn + ".");
      return;
    }

    setSaveState("saving");
    try {
      await api.updateProfile({
        full_name: name.trim() || null,
        whatsapp: waDigits ? "+218" + waDigits : null,
        payout_method: fields.method.trim() || null,
        payout_bank_name: isPhoneMethod ? null : fields.bank.trim() || null,
        payout_account_holder: isPhoneMethod ? null : fields.holder.trim() || null,
        payout_account_number: isPhoneMethod ? fields.phone.trim() || null : fields.acct.trim() || null,
        payout_iban: isPhoneMethod ? null : fields.iban.trim() || null,
        payout_swift: isPhoneMethod ? null : fields.swift.trim() || null,
        payout_notes: fields.notes.trim() || null,
      });
      await reloadProfile();
      setSaveState("saved");
      setTimeout(() => {
        setSaveState("idle");
        onClose();
      }, 700);
    } catch (e) {
      console.error(e);
      alert(isAr() ? "فشل الحفظ" : "Save failed");
      setSaveState("idle");
    }
  };

  const p = profile || {};

  return (
    <div className={"menu-overlay" + (open ? " open" : "")}>
      <div className="menu-backdrop" onClick={onClose} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, background: "#1e1e1e", padding: "1.5rem", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: "var(--color-text-primary)" }}>{t.title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: "1.25rem" }}>
          <div style={{ position: "relative" }}>
            <Avatar
              url={avatarUrl}
              name={name}
              style={{
                width: 88, height: 88, borderRadius: "50%", background: "#2a2a2a", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 28, color: "#8b83e8",
                fontWeight: 500, overflow: "hidden",
              }}
            />
            <label
              htmlFor="prof-avatar-file"
              style={{
                position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: "50%",
                background: "#8b83e8", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", border: "2px solid #1e1e1e",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </label>
            <input
              id="prof-avatar-file"
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => void pickAvatar(e.target.files?.[0])}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{avatarHint || t.hint}</div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label className="pd-lbl">
            <span className="pd-lbl-head">{t.name}</span>
            <input className="pd-inp" placeholder={t.namePh} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div style={{ border: "1px solid #2a2a2a", borderRadius: 14, padding: 14, display: "grid", gap: 12, background: "#181818" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {t.phone}
              </span>
              <span dir="ltr" style={{ fontSize: 13, color: "var(--color-text-primary)" }} data-no-i18n>
                {dispPhone(newPhone || p.phone) || "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {t.email}
              </span>
              <span dir="ltr" style={{ fontSize: 13, color: "var(--color-text-primary)", textAlign: "end", wordBreak: "break-all" }} data-no-i18n>
                {newEmail || p.email || "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }} data-i18n="Country">
                Country
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-primary)" }} data-no-i18n>
                🇱🇾 {isAr() ? "ليبيا" : "Libya"}
              </span>
            </div>
            <AdminEmailEditor
              current={newEmail || p.email}
              currentPhone={newPhone || p.phone}
              onChanged={setNewEmail}
              onPhoneChanged={setNewPhone}
            />
          </div>

          <button
            type="button"
            onClick={() => setChangeOpen(true)}
            style={{
              width: "100%", background: "transparent", border: "1px solid #3a3a3a",
              color: "var(--color-text-primary)", borderRadius: 10, padding: 11, fontSize: 13,
              fontWeight: 500, cursor: "pointer",
            }}
          >
            {t.changeBtn}
          </button>

          <label className="pd-lbl">
            <span className="pd-lbl-head">
              <span>{t.wa}</span>{" "}
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 10, fontWeight: 400 }}>{t.opt}</span>
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <button
                  type="button"
                  className="pd-inp pd-picker-btn"
                  onClick={() => setWaPickerOpen((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 4, width: 82 }}
                  dir="ltr"
                >
                  <span>{waCc}</span>
                  <PickerChevron />
                </button>
                <div
                  className="pd-picker-list"
                  style={{ display: waPickerOpen ? "block" : "none", position: "absolute", zIndex: 5, width: 190, top: "calc(100% + 4px)" }}
                >
                  <button type="button" className="pd-picker-item" onClick={() => setWaPickerOpen(false)} dir="ltr">
                    <span>+218 — <span data-i18n="Libya">Libya</span></span>
                  </button>
                  <div className="pd-picker-item pd-picker-disabled">
                    <span data-i18n="More">More</span>
                    <span className="pd-soon-pill" data-i18n="Soon">Soon</span>
                  </div>
                </div>
              </div>
              <input
                className="pd-inp"
                placeholder="092xxxxxxx"
                inputMode="numeric"
                dir="ltr"
                style={{ textAlign: "left", flex: 1 }}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </label>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "0.5px solid #2a2a2a", display: "grid", gap: 10 }}>
            <div
              style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}
              data-i18n="Payout / Bank details"
            >
              Payout / Bank details
            </div>
            <PayoutFieldsBlock fields={fields} set={set} />
          </div>
        </div>

        <button
          onClick={() => void save()}
          disabled={saveState === "saving"}
          style={{
            width: "100%", marginTop: "1.25rem", background: "#8b83e8", color: "#fff", border: "none",
            borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: saveState === "saving" ? 0.7 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>{saveState === "saving" ? t.saving : saveState === "saved" ? t.saved : t.save}</span>
        </button>

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "0.5px solid #2a2a2a" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <DeleteAccountSlot status={deletion.status} onOpen={() => setDeleteOpen(true)} />
          </div>
        </div>
      </div>

      <ChangeRequestOverlay open={changeOpen} onClose={() => setChangeOpen(false)} />
      <DeleteAccountOverlay
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        status={deletion.status}
        setStatus={deletion.setStatus}
        wallet={deletion.wallet}
        onChanged={() => void deletion.refresh()}
      />
    </div>
  );
}
