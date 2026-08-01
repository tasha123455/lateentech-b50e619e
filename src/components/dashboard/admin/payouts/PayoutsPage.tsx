import { useEffect, useState } from "react";

import { money as marketerMoney, moneyParts } from "@/components/dashboard/marketer/lib/format";
import { useAdminData, usePayoutsOpenRef } from "../AdminDataProvider";
import { dispPhone, initials, money, when } from "../lib/format";
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

/** Collapsed, the card is who is owed what and the button that settles it —
 *  plus the receipt, since the button will not fire without one. The bank
 *  details and the failure note fold away. */
function PayoutCard({
  p, receipt, onReceipt, note, onNote, onPaid, onSendNote,
}: {
  p: PayoutRequest;
  receipt: string | null;
  onReceipt: (url: string | null) => void;
  note: string;
  onNote: (v: string) => void;
  onPaid: (p: PayoutRequest, liveBal: number, shown: string) => Promise<void>;
  onSendNote: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

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
    <div className={"adm-payout-card" + (open ? " open" : "")}>
      <button className="pay-head" onClick={() => setOpen((v) => !v)}>
        <div className="adm-user-av" data-no-i18n>
          {u.avatar_signed_url
            ? <img src={u.avatar_signed_url} alt="" loading="lazy" decoding="async" />
            : initials(name)}
        </div>
        <div className="pay-head-mid">
          <div className="adm-pay-name" data-no-i18n>{name}</div>
          {!!u.email && <div className="adm-pay-sub" data-no-i18n>{u.email}</div>}
          <div className="adm-pay-sub" data-no-i18n>
            {[dispPhone(u.phone), when(p.requested_at)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="adm-pay-amt"><WalletAmount n={liveBal} sym={cur} code={curCode} /></div>
        <svg
          className={"rpt-head-chev" + (open ? " open" : "")}
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* The receipt sits beside the button it unlocks: without proof of the
          transfer there is nothing to mark paid, so the button stays disabled
          rather than failing on an alert after the fact. */}
      <div className="pay-settle">
        <PhotoPicker
          url={receipt}
          onChange={onReceipt}
          idleHint="Attach transfer receipt"
          attachedHint="Receipt attached"
          verifyDecodable={false}
        />
        <button
          className="adm-btn adm-btn-acc pay-paid-btn"
          disabled={!receipt}
          title={receipt ? undefined : "Attach the transfer receipt first"}
          onClick={() => void onPaid(p, liveBal, shown)}
        >
          Paid
        </button>
      </div>

      {open && (
        <div className="pay-body">
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

          {/* Sending a note fails the request, so it is named for what it does. */}
          <div className="pay-fail">
            <button className="pay-fail-hd" onClick={() => setFailOpen((v) => !v)}>
              <span>Failed</span>
              <svg
                className={"rpt-more-chev" + (failOpen ? " open" : "")}
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {failOpen && (
              <div className="pay-fail-body">
                <input
                  type="text"
                  className="pay-fail-inp"
                  placeholder="Send a note to the marketer (e.g. missing IBAN)"
                  value={note}
                  onChange={(e) => onNote(e.target.value)}
                />
                <button className="del-btn del-btn-reject" onClick={() => void onSendNote(p.id)}>
                  Send note
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
    body = payouts.map((p) => (
      <PayoutCard
        key={p.id}
        p={p}
        receipt={receipts[p.id] || null}
        onReceipt={(url) =>
          setReceipts((prev) => {
            const next = { ...prev };
            if (url) next[p.id] = url;
            else delete next[p.id];
            return next;
          })
        }
        note={notes[p.id] || ""}
        onNote={(v) => setNotes((prev) => ({ ...prev, [p.id]: v }))}
        onPaid={markPaid}
        onSendNote={sendNote}
      />
    ));
  }

  return (
    <>
      <div className="adm-h1">Payout Manager</div>
      <div className="adm-section">{body}</div>
    </>
  );
}
