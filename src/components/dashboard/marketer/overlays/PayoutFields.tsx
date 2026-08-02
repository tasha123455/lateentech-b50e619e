import { useState } from "react";
import { PickerChevron } from "@/components/auth/CountryCodePicker";

import { PAYOUT_BANKS, PAYOUT_METHODS, bankLabel } from "../lib/constants";
import { isAr } from "../lib/format";
import { bankLocked, payoutLabel, phoneMeta, sanitizePayoutPhone, type PayoutFields as Fields } from "./usePayoutForm";

/** Country / method dropdown built out of buttons, matching the original markup. */
function Picker({
  label, value, options, required, onPick,
}: {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <label className="pd-lbl">
      <span className="pd-lbl-head">
        {label} {required && <span className="pd-req">*</span>}
      </span>
      <button
        type="button"
        className="pd-inp pd-picker-btn"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <span data-no-i18n>{payoutLabel(value || "Select…")}</span>
        <PickerChevron />
      </button>
      <div className="pd-picker-list" style={{ display: open ? "block" : "none" }}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="pd-picker-item"
            onClick={() => { onPick(o); setOpen(false); }}
          >
            {payoutLabel(o)}
          </button>
        ))}
        <div className="pd-picker-item pd-picker-disabled">
          <span>More</span>
          <span className="pd-soon-pill">Soon</span>
        </div>
      </div>
    </label>
  );
}

/** The payout / bank details block, shared by the profile page and the
    withdraw sheet. `required` marks the fields with a red asterisk, which the
    withdraw sheet does and the profile page doesn't. */
export function PayoutFieldsBlock({
  fields, set, required,
}: {
  fields: Fields;
  set: (patch: Partial<Fields>) => void;
  required?: boolean;
}) {
  const meta = phoneMeta(fields.method);
  const isPhoneMethod = !!meta;
  const locked = bankLocked(fields.method);
  const ar = isAr();

  return (
    <>
      <Picker
        label="Country"
        value={fields.country}
        options={["Libya"]}
        required={required}
        onPick={(v) => set({ country: v })}
      />
      <Picker
        label="Method"
        value={fields.method}
        options={PAYOUT_METHODS}
        required={required}
        onPick={(v) => set({ method: v })}
      />

      <label
        className={"pd-lbl" + (locked ? " pd-bank-disabled" : "")}
        style={{ display: isPhoneMethod ? "none" : undefined }}
      >
        <span className="pd-lbl-head">
          <span data-i18n="Bank">Bank</span> {required && <span className="pd-req">*</span>}
        </span>
        <select
          className="pd-inp"
          value={fields.bank}
          disabled={locked}
          onChange={(e) => set({ bank: e.target.value })}
        >
          <option value="">Select…</option>
          {/* The Arabic name is the value in every language: it is what the
              profile already stores, so switching language must not rewrite
              somebody's saved bank. */}
          {PAYOUT_BANKS.map((b) => (
            <option key={b} value={b}>{bankLabel(b, ar)}</option>
          ))}
        </select>
      </label>

      <label className="pd-lbl" style={{ display: isPhoneMethod ? undefined : "none" }}>
        <span className="pd-lbl-head" data-i18n="Phone number">Phone number</span>
        <input
          className="pd-inp"
          placeholder={meta ? meta.prefixes[0] + "XXXXXXX" : "092XXXXXXX"}
          inputMode="numeric"
          maxLength={10}
          dir="ltr"
          style={{ textAlign: "left" }}
          value={fields.phone}
          onChange={(e) => set({ phone: sanitizePayoutPhone(e.target.value, fields.method) })}
        />
        <span
          data-no-i18n
          style={{ color: "#ff6b7a", fontSize: 10, textTransform: "none", letterSpacing: "normal", marginTop: 2 }}
        >
          {meta ? (ar ? meta.hintAr : meta.hintEn) : ""}
        </span>
      </label>

      <label className="pd-lbl" style={{ display: isPhoneMethod ? "none" : undefined }}>
        <span className="pd-lbl-head">
          <span data-i18n="Account holder">Account holder</span> {required && <span className="pd-req">*</span>}
        </span>
        <input
          className="pd-inp"
          placeholder="Full name on account"
          value={fields.holder}
          onChange={(e) => set({ holder: e.target.value })}
        />
      </label>

      <label className="pd-lbl" style={{ display: isPhoneMethod ? "none" : undefined }}>
        <span className="pd-lbl-head">
          <span data-i18n="Account number">Account number</span> {required && <span className="pd-req">*</span>}
        </span>
        <input
          className="pd-inp"
          placeholder="Account number"
          value={fields.acct}
          onChange={(e) => set({ acct: e.target.value })}
        />
      </label>

      <div
        className="pd-iban-row"
        style={{ display: isPhoneMethod ? "none" : "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <label className="pd-lbl">
          <span className="pd-lbl-head">IBAN</span>
          <input className="pd-inp" placeholder="optional" value={fields.iban} onChange={(e) => set({ iban: e.target.value })} />
        </label>
        <label className="pd-lbl">
          <span className="pd-lbl-head">SWIFT/BIC</span>
          <input className="pd-inp" placeholder="optional" value={fields.swift} onChange={(e) => set({ swift: e.target.value })} />
        </label>
      </div>

      <label className="pd-lbl">
        <span className="pd-lbl-head">Notes (optional)</span>
        <textarea
          className="pd-inp"
          rows={2}
          placeholder="Write any additional notes"
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
    </>
  );
}
