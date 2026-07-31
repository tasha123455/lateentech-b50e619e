import { useEffect, useRef, useState } from "react";

import type { ReceiptOrder } from "../lib/types";

/** A real note box (not a bare prompt) so the admin can write a message
    delivered to BOTH the marketer and the business owner with the refund.
    Post-delivery refunds also reverse stock, sales and every analytics counter
    server-side. Resolves with the note, or null if cancelled. */
export function RefundModal({
  order, onDone,
}: {
  order: ReceiptOrder | null;
  onDone: (comment: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(id);
  }, []);

  const delivered = !!order && (order.status === "delivered" || order.status === "confirmed");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.72)" }} onClick={() => onDone(null)} />
      <div
        style={{
          position: "relative", width: "100%", maxWidth: 420, background: "#101010",
          border: "0.5px solid #262626", borderRadius: 16, padding: "18px 16px",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "#f4f2ef", marginBottom: 8 }}>Refund this order</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#9e9b97", marginBottom: 12 }}>
          {delivered ? (
            <>
              This order was already delivered. Refunding it will mark it as <b>failed</b>, restore the product stock,
              remove its pieces sold and revenue from the business owner's analytics, and remove its platform fee from
              your totals.
            </>
          ) : (
            "This removes the order's platform fee from your totals and deducts the marketer's fee from their wallet."
          )}
        </div>
        <div style={{ fontSize: 12, color: "#9e9b97", marginBottom: 6 }}>
          Note to the marketer &amp; business owner (optional)
        </div>
        <textarea
          ref={taRef}
          rows={4}
          placeholder="Explain why this order is being refunded…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", background: "#161616", border: "0.5px solid #262626",
            borderRadius: 10, color: "#f4f2ef", fontSize: 13, padding: 10, fontFamily: "inherit", resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={() => onDone(null)}
            style={{
              flex: 1, height: 38, borderRadius: 19, background: "transparent", border: "0.5px solid #333",
              color: "#c9c8c4", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onDone(note.trim())}
            style={{
              flex: 1, height: 38, borderRadius: 19, background: "#7c9cf0", border: "none",
              color: "#0b0b0b", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Refund
          </button>
        </div>
      </div>
    </div>
  );
}
