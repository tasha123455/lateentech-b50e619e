import { useCallback, useEffect, useState } from "react";

import { isAr } from "../lib/format";
import { loadPayoutDraft, savePayoutDraft, type PayoutDraft } from "../lib/storage";
import type { MarketerProfile } from "../lib/types";

export type PayoutFields = {
  country: string; method: string; bank: string; holder: string;
  acct: string; phone: string; iban: string; swift: string; notes: string;
};

const EMPTY: PayoutFields = {
  country: "", method: "", bank: "", holder: "", acct: "", phone: "", iban: "", swift: "", notes: "",
};

/** Credit methods take a phone number instead of bank/account details. */
export function phoneMeta(method: string): { prefixes: string[]; hintEn: string; hintAr: string } | null {
  if (method === "Libyana Credit")
    return { prefixes: ["092", "094"], hintEn: "Number starts with 092 or 094", hintAr: "الرقم يبدا من 092 او 094" };
  if (method === "Madar Credit")
    return { prefixes: ["091", "093"], hintEn: "Number starts with 091 or 093", hintAr: "الرقم يبدا من 091 او 093" };
  return null;
}

/** Bank of Unity has a single fixed bank, so the picker is locked out. */
export const bankLocked = (method: string) => method === "Bank of Unity";

export function payoutLabel(v: string): string {
  const arMap: Record<string, string> = {
    Libya: "ليبيا", "One pay": "وان باي", "Bank of Unity": "مصرف الوحده | وان باي",
    "Libyana Credit": "رصيد ليبيانا", "Madar Credit": "رصيد مدار", "Select…": "اختر…",
  };
  /* "Bank of Unity" is the stored value and cannot move without rewriting
     every profile that already carries it, so both corrections happen here at
     the label: the bank's own English name is Wahda Bank — الوحدة
     transliterated, not translated — and the choice names One Pay alongside
     it, that being the service the money actually arrives through. */
  const enMap: Record<string, string> = { "Bank of Unity": "Wahda Bank | One Pay" };
  if (isAr()) return arMap[v] || v;
  return enMap[v] || v;
}

/** Keeps only digits, and only those that can still form an allowed prefix. */
export function sanitizePayoutPhone(value: string, method: string): string {
  const meta = phoneMeta(method);
  const allowed = meta ? meta.prefixes : ["092", "094", "091", "093"];
  const digits = (value || "").replace(/\D/g, "");
  let result = "";
  for (let i = 0; i < digits.length && result.length < 10; i++) {
    const next = result + digits[i];
    if (next.length <= 3) {
      if (allowed.some((p) => p.indexOf(next) === 0)) result = next;
    } else {
      result = next;
    }
  }
  return result;
}

/** One payout form shared by the profile page and the withdraw sheet — they
    edited two DOM scopes that were kept in sync before, so they share state
    here instead. Persisted so a half-filled form survives a reload. */
export function usePayoutForm(userId: string, profile: MarketerProfile | null) {
  const [fields, setFields] = useState<PayoutFields>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Profile values first, then the local draft on top (draft wins, as before).
  useEffect(() => {
    if (hydrated) return;
    const fromProfile: PayoutFields = {
      country: "",
      method: profile?.payout_method || "",
      bank: profile?.payout_bank_name || "",
      holder: profile?.payout_account_holder || "",
      acct: profile?.payout_account_number || "",
      phone: profile?.payout_account_number || "",
      iban: profile?.payout_iban || "",
      swift: profile?.payout_swift || "",
      notes: profile?.payout_notes || "",
    };
    const draft: PayoutDraft = loadPayoutDraft(userId);
    const merged = { ...fromProfile };
    (Object.keys(draft) as Array<keyof PayoutDraft>).forEach((k) => {
      const v = draft[k];
      if (v) (merged as Record<string, string>)[k] = v;
    });
    setFields(merged);
    if (profile) setHydrated(true);
  }, [profile, userId, hydrated]);

  const set = useCallback(
    (patch: Partial<PayoutFields>) => {
      setFields((prev) => {
        const next = { ...prev, ...patch };
        if (patch.method !== undefined) {
          // Switching to a credit method clears a number that no longer fits.
          const meta = phoneMeta(next.method);
          if (meta && next.phone && !meta.prefixes.some((p) => next.phone.indexOf(p) === 0)) next.phone = "";
          if (bankLocked(next.method)) next.bank = "";
        }
        savePayoutDraft(next, userId);
        return next;
      });
    },
    [userId],
  );

  const persist = useCallback(() => savePayoutDraft(fields, userId), [fields, userId]);

  return { fields, set, persist };
}
