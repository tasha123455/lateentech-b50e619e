import { useEffect, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { MIN_WITHDRAW } from "../lib/constants";
import { isAr, t } from "../lib/format";
import { Money } from "../ui/Money";
import { PayoutFieldsBlock } from "./PayoutFields";
import { phoneMeta, type PayoutFields as Fields } from "./usePayoutForm";

export function WithdrawOverlay({
  open, onClose, fields, set, persist,
}: {
  open: boolean;
  onClose: () => void;
  fields: Fields;
  set: (patch: Partial<Fields>) => void;
  persist: () => void;
}) {
  const { api, analytics, walletCur, walletBalance, payout, refreshWalletAndPayout } = useMarketerData();
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (open) setRequested(false);
  }, [open]);

  const curData = analytics.earnByCur[walletCur] || { sym: walletCur === "LYD" ? "د.ل" : "£", amount: 0 };

  const close = () => {
    persist();
    onClose();
  };

  const confirm = async () => {
    if (busy) return;
    const meta = phoneMeta(fields.method);
    const isPhoneMethod = !!meta;
    const bankRequired = fields.method !== "Bank of Unity" && !isPhoneMethod;

    if (isPhoneMethod) {
      const valid = new RegExp("^(" + meta!.prefixes.join("|") + ")\\d{7}$").test(fields.phone.trim());
      if (!fields.method || !valid) {
        alert(
          t(
            "Please enter a valid phone number. " + meta!.hintEn + ".",
            "الرجاء إدخال رقم هاتف صحيح. " + meta!.hintAr + ".",
          ),
        );
        return;
      }
    } else if (!fields.method || !fields.holder.trim() || !fields.acct.trim() || (bankRequired && !fields.bank)) {
      alert(
        isAr()
          ? "يرجى تعبئة طريقة الدفع، البنك، اسم صاحب الحساب، ورقم الحساب حتى يتمكن الأدمن من الدفع لك."
          : "Please fill in your payout method, bank, account holder, and account number so the admin can pay you.",
      );
      return;
    }

    persist();
    setBusy(true);
    try {
      // Re-check the window server-side before committing to a request. The
      // refresh returns the fresh state, since `payout` here is render-time.
      const fresh = await refreshWalletAndPayout();
      if (!fresh.canWithdraw) {
        alert(fresh.statusText || t("Withdrawal is not available yet", "السحب غير متاح الآن"));
        setBusy(false);
        return;
      }
      if (api.updateProfile) {
        await api.updateProfile({
          payout_method: fields.method,
          payout_bank_name: isPhoneMethod ? null : fields.bank || null,
          payout_account_holder: isPhoneMethod ? null : fields.holder,
          payout_account_number: isPhoneMethod ? fields.phone : fields.acct,
          payout_iban: isPhoneMethod ? null : fields.iban || null,
          payout_swift: isPhoneMethod ? null : fields.swift || null,
          payout_notes: fields.notes || null,
        });
      }
      const amt = Number(fresh.balance || walletBalance || 0);
      if (amt < MIN_WITHDRAW) {
        alert(t("Minimum withdraw amount 20 LYD", "اقل قيمه يمكن سحبها 20 د.ل"));
        setBusy(false);
        return;
      }
      await api.requestPayout(amt);
    } catch (e) {
      console.error("[Lateen] payout", e);
      alert((isAr() ? "فشل: " : "Failed: ") + (e as Error).message);
      setBusy(false);
      return;
    }
    setBusy(false);
    setRequested(true);
    onClose();
    void refreshWalletAndPayout();
  };

  return (
    <div className={"menu-overlay" + (open ? " open" : "")}>
      <div className="menu-backdrop" onClick={close} />
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, background: "#1e1e1e",
          borderRadius: "20px 20px 0 0", padding: "1.5rem", borderTop: "0.5px solid #333",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ width: 36, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 1.25rem" }} />
        <div style={{ fontSize: 17, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
          Withdraw earnings
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
          Funds arrive in 2–5 business days
        </div>
        <div style={{ background: "#2a2a2a", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 30, fontWeight: 500, color: "var(--color-text-primary)" }}>
            <Money n={walletBalance} sym={curData.sym} code={walletCur} />
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Confirm your payout details below
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <PayoutFieldsBlock fields={fields} set={set} required />
        </div>

        <button
          onClick={() => void confirm()}
          disabled={busy}
          style={{
            width: "100%", height: 44, borderRadius: 12, border: "none", background: "#f0eeeb",
            color: "#0D0D0D", fontSize: 14, fontWeight: 500, cursor: "pointer",
            fontFamily: "var(--font-sans)", marginBottom: 10,
          }}
        >
          {requested ? t("Requested", "تم الطلب") : "Save & request withdrawal"}
        </button>
        <button
          onClick={close}
          style={{
            width: "100%", height: 40, borderRadius: 12, border: "0.5px solid #333", background: "transparent",
            color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
