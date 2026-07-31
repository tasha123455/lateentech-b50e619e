import { useEffect, useState } from "react";

import { money as marketerMoney, moneyParts } from "@/components/dashboard/marketer/lib/format";
import { useAdminData, usePayoutsOpenRef } from "../AdminDataProvider";
import { initials, money, when } from "../lib/format";
import type { PayoutRequest } from "../lib/types";
import { PhotoPicker } from "../ui/PhotoPicker";

/** Payout amounts follow the marketer's own wallet currency, not the admin's
    dinar default — so they use the marketer-side money formatter. */
function WalletAmount({ n, sym, code }: { n: unknown; sym: string; code: string }) {
  const { amount, sym: symbol, code: cc, ar } = moneyParts(n, sym, code);
  if (ar) return <>{amount}<span className="cur-sym">{symbol}</span></>;
  if (cc) return <>{amount} <span className="cur-sym">{cc}</span></>;
  return <><span className="cur-sym">{symbol}</span>{amount}</>;
}

export function PayoutsPage({ active }: { active: boolean }) {
  const { payouts, loadPayouts, loading, failed, api } = useAdminData();
  const openRef = usePayoutsOpenRef();
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Only poll while this page is on screen.
  useEffect(() => {
    openRef.current = active;
    if (active) void loadPayouts();
    return () => { openRef.current = false; };
  }, [active, loadPayouts, openRef]);

  const markPaid = async (p: PayoutRequest, liveBal: number, shown: string) => {
    const receiptUrl = receipts[p.id];
    if (!receiptUrl) {
      alert("Attach a photo of the transfer receipt first.");
      return;
    }
    if (!confirm("Confirm you have manually transferred " + shown + "? This will reduce the marketer's balance.")) return;
    try {
      await api.admin.markPayoutPaid(p.id, receiptUrl);
      setReceipts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      await loadPayouts();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
    void liveBal;
  };

  const sendNote = async (id: string) => {
    const note = (notes[id] || "").trim();
    if (!note) {
      alert("Type a note first.");
      return;
    }
    if (!confirm("Send this note to the marketer? Their request will be marked failed so they can fix it and re-request.")) return;
    try {
      await api.admin.notePayout(id, note);
      setNotes((prev) => ({ ...prev, [id]: "" }));
      await loadPayouts();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  let body: React.ReactNode;
  if (loading.payouts) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (failed.payouts) {
    body = <div className="adm-empty">Failed to load.</div>;
  } else if (!payouts.length) {
    body = <div className="adm-empty">No payout requests pending.</div>;
  } else {
    body = payouts.map((p) => {
      const u = p.user || {};
      const name = u.business_name || u.full_name || "Marketer";
      const cur = (p.wallet && p.wallet.currency && p.wallet.currency.symbol) || "$";
      const curCode = (p.wallet && p.wallet.currency && p.wallet.currency.code) || "";
      const liveBal = p.wallet && p.wallet.balance != null ? Number(p.wallet.balance) : Number(p.amount || 0);
      const shown = marketerMoney(liveBal, cur, curCode) || money(liveBal);

      const detail = (label: string, val?: string | null) =>
        val ? (
          <div className="adm-pay-detail-row" key={label}>
            <span className="adm-pay-detail-k">{label}</span>
            <span className="adm-pay-detail-v" data-no-i18n>{val}</span>
          </div>
        ) : null;

      const hasAny =
        u.payout_method || u.payout_bank_name || u.payout_account_holder || u.payout_account_number ||
        u.payout_iban || u.payout_swift || u.payout_notes;

      return (
        <div className="adm-payout-card" key={p.id}>
          <div className="adm-payout-row">
            <div className="adm-user-av" data-no-i18n>{initials(name)}</div>
            <div className="adm-pay-info">
              <div className="adm-pay-name" data-no-i18n>{name}</div>
              <div className="adm-pay-sub">{(u.phone || "") + " · " + when(p.requested_at)}</div>
            </div>
            <div className="adm-pay-amt">
              <div><WalletAmount n={liveBal} sym={cur} code={curCode} /></div>
            </div>
            <button
              className="adm-btn adm-btn-acc"
              style={{ flex: "0 0 auto", padding: "0 14px" }}
              onClick={() => void markPaid(p, liveBal, shown)}
            >
              Paid
            </button>
          </div>

          {hasAny ? (
            <div className="adm-pay-details">
              {detail("Method", u.payout_method)}
              {detail("Bank", u.payout_bank_name)}
              {detail("Account holder", u.payout_account_holder)}
              {detail("Account #", u.payout_account_number)}
              {detail("IBAN", u.payout_iban)}
              {detail("SWIFT/BIC", u.payout_swift)}
              {detail("Notes", u.payout_notes)}
            </div>
          ) : (
            <div className="adm-pay-details adm-pay-details-empty">
              No payout details on file — contact the marketer.
            </div>
          )}

          <div style={{ padding: "10px 14px 0" }}>
            <PhotoPicker
              url={receipts[p.id] || null}
              onChange={(url) =>
                setReceipts((prev) => {
                  const next = { ...prev };
                  if (url) next[p.id] = url;
                  else delete next[p.id];
                  return next;
                })
              }
              idleHint="Attach transfer receipt photo to mark as paid"
              attachedHint="Receipt attached"
              verifyDecodable={false}
            />
          </div>

          <div style={{ display: "flex", gap: 6, padding: "10px 14px 12px", borderTop: "0.5px solid var(--border-2)" }}>
            <input
              type="text"
              placeholder="Send a note to the marketer (e.g. missing IBAN)"
              value={notes[p.id] || ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
              style={{
                flex: 1, height: 34, padding: "0 10px", borderRadius: 8,
                border: "0.5px solid var(--border-2)", background: "#0f0f0f", color: "#fff", fontSize: 12,
              }}
            />
            <button className="adm-btn" style={{ padding: "0 12px" }} onClick={() => void sendNote(p.id)}>
              Send note
            </button>
          </div>
        </div>
      );
    });
  }

  return (
    <>
      <div className="adm-h1">Payout Manager</div>
      <div className="adm-section">{body}</div>
    </>
  );
}
