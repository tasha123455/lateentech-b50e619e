import { platThreshold } from "../lib/constants";
import type { MarketerOrder } from "../lib/types";
import { Money } from "../ui/Money";
import { DepositAccountRows } from "./PayDetailsOverlay";

/** "How to collect fee" sheet for a specific order. */
export function InstructionsOverlay({
  order, onClose, onUpload, onOpenDepositInfo,
}: {
  order: MarketerOrder | null;
  onClose: () => void;
  onUpload: () => void;
  onOpenDepositInfo: () => void;
}) {
  const open = !!order;
  const qtyN = order?.qty || 1;
  const comm = (order?.commPerUnit || 0) * qtyN;
  const plat = (order?.platformPerUnit || 0) * qtyN;
  const totalDeposit = parseFloat((comm + plat).toFixed(2));
  const sym = order?._sym || "$";
  const code = order?._curCode || "";
  const yourPct = Math.round((order?.pct || 0) * 100);
  const platFixed = (order?.price || 0) <= platThreshold(order?.market);
  const platPct = order && order.price > 0 ? Math.round(((order.platformPerUnit || 0) / order.price) * 100) : 0;

  return (
    <div className={"overlay" + (open ? " open" : "")}>
      <div className="overlay-bg" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-title" data-i18n="How to collect fee">How to collect fee</div>

        <div className="instr-card light">
          <div className="instr-step">
            <div className="step-num">1</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="step-title" data-i18n="Request a deposit from the customer">
                Request a deposit from the customer
              </div>
              <div className="step-body">
                <span data-i18n="Ask the customer to deposit">Ask the customer to deposit</span>{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>{totalDeposit.toFixed(2)}</strong> <span>LYD</span>{" "}
                <span data-i18n="into this account.">into this account.</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <DepositAccountRows />
              </div>
            </div>
          </div>

          <div className="instr-step">
            <div className="step-num">2</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="step-title" data-i18n="Send the payment receipt">Send the payment receipt</div>
              <div
                className="step-body"
                data-i18n="Once the deposit is made, upload a photo of the receipt so it can be reviewed."
              >
                Once the deposit is made, upload a photo of the receipt so it can be reviewed.
              </div>
              <div className="upload-box dashed-lg" onClick={onUpload} style={{ marginTop: 10, cursor: "pointer", textAlign: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7f77dd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className="upload-icon-label" data-i18n="Tap to upload receipt">Tap to upload receipt</div>
              </div>
              <div
                className="step-body"
                style={{ marginTop: 8 }}
                data-i18n="The company will verify the deposit, then credit your funds to your wallet for withdrawal."
              >
                The company will verify the deposit, then credit your funds to your wallet for withdrawal.
              </div>
            </div>
          </div>
        </div>

        <div className="instr-card dark" style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>
            <span>
              <span data-i18n="Your fee">Your fee</span> (<span>{yourPct}</span>%)
            </span>
            <span style={{ color: "#fff" }}><Money n={comm} sym={sym} code={code} /></span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>
            <span>
              <span data-i18n="Platform fee">Platform fee</span>
              <span data-no-i18n>{platFixed ? "" : ` (${platPct}%)`}</span>
            </span>
            <span style={{ color: "#fff" }}><Money n={plat} sym={sym} code={code} /></span>
          </div>
          <div style={{ height: "0.5px", background: "#2a2a2a", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 600, color: "#fff" }}>
            <span data-i18n="Total deposit required">Total deposit required</span>
            <span><Money n={totalDeposit} sym={sym} code={code} /></span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenDepositInfo}
          style={{
            width: "100%", padding: 11, borderRadius: 10, border: "0.5px solid #e07070",
            background: "rgba(224,112,112,0.12)", color: "#e07070", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "var(--font-sans)", cursor: "pointer", marginBottom: 10,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span data-i18n="Important notes">Important notes</span>
        </button>
        <button className="cancel-btn" onClick={onClose} data-i18n="Close">Close</button>
      </div>
    </div>
  );
}
