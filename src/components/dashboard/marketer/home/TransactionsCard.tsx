import { useState } from "react";

import { useAccordion } from "@/lib/useAccordion";

import { useMarketerData } from "../MarketerDataProvider";
import { dateMatches, type BreakdownSelection } from "../lib/analytics";
import { fmtDT, parseData, t } from "../lib/format";
import type { NotificationRow } from "../lib/types";
import { DetailRow, NotifDetailBox } from "../notifications/detailBits";
import { Money } from "../ui/Money";
import { usePhotoLightbox } from "../ui/PhotoLightbox";

/** Wallet movements, derived from the marketer's own notifications feed. */
const KINDS: Record<string, "add" | "subtract" | "withdraw" | "reject" | "failed"> = {
  receipt_verified: "add",
  order_refunded: "subtract",
  payout_paid: "withdraw",
  receipt_rejected: "reject",
  payout_note: "failed",
};

export function TransactionsCard({ sel }: { sel: BreakdownSelection }) {
  const { notifications, orders, walletCur, analytics } = useMarketerData();
  const [open, setOpen] = useState(false);
  const { isOpen, toggle } = useAccordion();
  const lightbox = usePhotoLightbox();

  /* This card lives inside the analytics card, under the boxes the range tabs
     drive, so it answers to the same tabs. A movement is dated by when it
     happened — the notification's own timestamp — which is the date the row
     already prints. */
  const noFilter = !sel.day && !sel.month && !sel.year;
  const rows = (notifications || [])
    .filter((n) => KINDS[n.kind] && (noFilter || dateMatches(new Date(n.created_at), sel)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const rawSymbol = (analytics.earnByCur[walletCur] && analytics.earnByCur[walletCur].sym) || "د.ل";

  return (
    <div className="mkbd-card" style={{ margin: "16px 0 0" }}>
      <button className={"mkbd-toggle" + (open ? " open" : "")} onClick={() => setOpen((v) => !v)}>
        <span className="mkbd-toggle-left">
          <span className="mkbd-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </span>
          <span>Transactions</span>
        </span>
        <span className="mkbd-chev">▾</span>
      </button>
      <div className={"mkbd-wrap" + (open ? " open" : "")}>
        <div className="mkbd-inner">
          <div className="mkbd-body">
            <div className="notif-list" style={{ marginTop: 16 }}>
              {!rows.length ? (
                <div className="empty-center" style={{ padding: "40px 20px" }}>
                  <div className="empty-text" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>
                    {noFilter
                      ? t("No transactions yet.", "لا توجد تحركات بعد.")
                      : t("No transactions in this range.", "لا توجد تحركات في هذه الفترة.")}
                  </div>
                </div>
              ) : (
                rows.map((n) => (
                  <TxnItem
                    key={n.id}
                    n={n}
                    sym={rawSymbol}
                    code={walletCur}
                    expanded={isOpen(n.id)}
                    onToggle={() => toggle(n.id)}
                    onPhoto={lightbox.openOne}
                    findOrderAmount={(orderId) => {
                      const ord = orders.find((o) => o.dbId === orderId);
                      return ord ? (ord.commPerUnit || 0) * (ord.qty || 0) : null;
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TxnItem({
  n, sym, code, expanded, onToggle, onPhoto, findOrderAmount,
}: {
  n: NotificationRow;
  sym: string;
  code: string;
  expanded: boolean;
  onToggle: () => void;
  onPhoto: (url: string) => void;
  findOrderAmount: (orderId: unknown) => number | null;
}) {
  const d = parseData(n.data);
  const type = KINDS[n.kind];

  let amount: number | null = null;
  let title = "";
  if (type === "add") {
    amount = findOrderAmount(d.order_id) ?? (d.amount != null ? Number(d.amount) : null);
    title = t("Commission added", "عمولة مضافة");
  } else if (type === "subtract") {
    amount = d.amount != null ? Number(d.amount) : null;
    title = t("Order refunded", "استرجاع طلب");
  } else if (type === "reject") {
    amount = null;
    title = t("Receipt rejected by admin", "تم رفض الإيصال من الأدمن");
  } else if (type === "failed") {
    amount = d.amount != null ? Number(d.amount) : null;
    title = t("Withdrawal failed", "فشل إيداع المبلغ");
  } else {
    amount = d.amount != null ? Number(d.amount) : null;
    title = t("Withdrawal completed", "تم سحب المبلغ");
  }

  const isX = type === "reject" || type === "failed";
  const color = type === "add" ? "#35c98f" : type === "withdraw" ? "#7f77dd" : "#e2685f";
  const sign = type === "add" ? "+" : isX ? "" : "-";
  const amtStr =
    amount != null ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  /* What only the wallet has to say. Everything below these two rows is the
     notification for this same event, rendered by the same component — the
     wallet is the second place one movement is read, not a second account
     of it. */
  const leadRows =
    type === "withdraw" || type === "failed" ? (
      <>
        <DetailRow k={t("Amount", "المبلغ")} v={<Money n={amount ?? 0} sym={sym} code={code} />} />
        <DetailRow
          k={t("Status", "الحالة")}
          v={type === "withdraw" ? t("Paid", "مدفوع") : t("Failed", "فشل")}
        />
      </>
    ) : null;

  return (
    <div className={"notif-item expandable" + (expanded ? " expanded" : "")} data-id={n.id}>
      <div className="notif-top" onClick={onToggle}>
        <div className="notif-icon" style={{ background: color + "22", color, fontWeight: 700 }}>
          {isX ? "✕" : sign}
        </div>
        <div className="notif-row-text">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="notif-title">{title}</div>
            {amtStr && (
              <div className="notif-body" style={{ color, fontWeight: 600, fontSize: 13 }}>
                {sign}
                <Money n={amount ?? 0} sym={sym} code={code} />
              </div>
            )}
            <div className="notif-time">{fmtDT(n.created_at)}</div>
          </div>
        </div>
      </div>
      <div
        className="notif-detail-body"
        onClick={expanded ? (e) => {
          const el = e.target as HTMLElement | null;
          if (el?.closest("a, button, img, textarea, input, iframe, [role='button']")) return;
          onToggle();
        } : undefined}
      >
        <NotifDetailBox n={n} onPhoto={onPhoto} leadRows={leadRows} />
      </div>
    </div>
  );
}
