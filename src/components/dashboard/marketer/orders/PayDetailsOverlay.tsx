import { useState } from "react";

import { DEPOSIT_ACCOUNT_NAME, DEPOSIT_ACCOUNT_NUMBER } from "../lib/constants";

/** Copy button that flips to "Copied!" for two seconds. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={"copy-btn" + (done ? " done" : "")}
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Copied!" : "Copy"}
    </button>
  );
}

/** The company account the upfront deposit must be sent to. */
export function DepositAccountRows() {
  return (
    <>
      <div className="copy-row">
        <div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 2 }} data-i18n="Account name">
            Account name
          </div>
          <div className="copy-val" data-no-i18n>{DEPOSIT_ACCOUNT_NAME}</div>
        </div>
      </div>
      <div className="copy-row" style={{ marginTop: 6 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 2 }} data-i18n="Account number">
            Account number
          </div>
          <div className="copy-val" data-no-i18n>{DEPOSIT_ACCOUNT_NUMBER}</div>
        </div>
        <CopyButton text={DEPOSIT_ACCOUNT_NUMBER} />
      </div>
      <div className="copy-row" style={{ marginTop: 6 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 2 }} data-i18n="Bank">
            Bank
          </div>
          <div className="copy-val" data-i18n="Wahda bank">Wahda bank</div>
        </div>
      </div>
    </>
  );
}

export function PayDetailsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={"overlay" + (open ? " open" : "")} style={{ zIndex: 1200, position: "fixed", inset: 0 }}>
      <div className="overlay-bg" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-title" data-i18n="Payment details">Payment details</div>
        <div className="sheet-sub" data-i18n="Ask the customer to send the fee to:">Ask the customer to send the fee to:</div>
        <div className="instr-card light" style={{ marginBottom: 14 }}>
          <DepositAccountRows />
        </div>
        <button className="cancel-btn" onClick={onClose} data-i18n="Close">Close</button>
      </div>
    </div>
  );
}
