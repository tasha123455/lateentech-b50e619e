import { useCallback, useEffect, useState } from "react";

import { LIBYA } from "@/lib/markets/libya";
import { payoutMethod, payoutPhonePrefixes } from "@/lib/markets";

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

/** Credit methods take a phone number instead of bank/account details.
 *  Which methods those are, and which prefixes they accept, is the market's
 *  answer — see src/lib/markets/libya.ts. */
export function phoneMeta(method: string): { prefixes: string[]; hintEn: string; hintAr: string } | null {
  const m = payoutMethod(method, LIBYA);
  if (!m?.phonePrefixes) return null;
  return { prefixes: m.phonePrefixes, hintEn: m.phoneHintEn ?? "", hintAr: m.phoneHintAr ?? "" };
}

/** Some methods are tied to a single institution, so the picker is locked out. */
export const bankLocked = (method: string) => !!payoutMethod(method, LIBYA)?.fixedBank;

export function payoutLabel(v: string): string {
  const ar = isAr();
  const m = payoutMethod(v, LIBYA);
  if (m) return ar ? m.labelAr : m.labelEn;
  // Not a payout method: the country name and the empty-state placeholder
  // share this label helper.
  const arMap: Record<string, string> = { Libya: LIBYA.nameAr, "Select…": "اختر…" };
  return ar ? arMap[v] || v : v;
}

/** Keeps only digits, and only those that can still form an allowed prefix. */
export function sanitizePayoutPhone(value: string, method: string): string {
  const meta = phoneMeta(method);
  const allowed = meta ? meta.prefixes : payoutPhonePrefixes(LIBYA);
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
