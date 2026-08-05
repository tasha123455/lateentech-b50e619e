import { useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { dateMatches, type BreakdownSelection } from "../lib/analytics";
import { fmtDT, isSafeUrl, parseData, t } from "../lib/format";
import type { NotificationRow } from "../lib/types";
import { DetailRow, NoteBlock, OrderDetailRows } from "../notifications/detailBits";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
                    expanded={expanded.has(n.id)}
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
  /* The same green/red edge the notification for this event carries, so one
     movement looks like one thing wherever it is read. */
  const borderColor = type === "add" || type === "withdraw" ? "#142a20" : "#2a1a1a";
  const sign = type === "add" ? "+" : isX ? "" : "-";
  const amtStr =
    amount != null ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  const photoUrl = (d.product_photo || d.photo) as string | undefined;
  const photoValid = isSafeUrl(photoUrl);
  /* A paid withdrawal used to show the admin's receipt twice: once as the
     row's own icon, and again inside the body. One of them stood alone with
     nothing to say what it was — so the one that keeps the amount and the
     status beside it is the one that stays. */

  /* Only the receipt the admin sends for a completed withdrawal opens full
     screen. Everywhere else the picture is the product's own photo, already
     shown at the size it is worth — blowing that up is a gesture that leads
     nowhere, and it fires on a card people are trying to scroll past. */
  const zoomable = type === "withdraw";
  const bigPhoto = photoValid ? (
    <div style={{ margin: "-2px 0 10px 0" }}>
      <img
        src={photoUrl}
        alt=""
        onClick={zoomable ? (e) => { e.stopPropagation(); onPhoto(photoUrl!); } : undefined}
        style={{
          width: "100%", maxHeight: 220, objectFit: "contain", background: "#0d0d0d",
          borderRadius: 10, display: "block", ...(zoomable ? { cursor: "zoom-in" } : null),
        }}
      />
    </div>
  ) : null;

  let detailRows: React.ReactNode;
  if (type === "failed") {
    detailRows = (
      <>
        {bigPhoto}
        <DetailRow k={t("Amount", "المبلغ")} v={<Money n={amount ?? 0} sym={sym} code={code} />} />
        <DetailRow k={t("Status", "الحالة")} v={t("Failed", "فشل")} />
        <NoteBlock
          label={t("Note", "ملاحظة")}
          text={(d.admin_comment || d.admin_note) as string}
          background="#2a1a1a"
          color="#f0c0c0"
          marginTop={8}
        />
      </>
    );
  } else if (type === "withdraw") {
    detailRows = (
      <>
        {bigPhoto}
        <DetailRow k={t("Amount", "المبلغ")} v={<Money n={amount ?? 0} sym={sym} code={code} />} />
        <DetailRow k={t("Status", "الحالة")} v={t("Paid", "مدفوع")} />
      </>
    );
  } else {
    detailRows = (
      <>
        {bigPhoto}
        <OrderDetailRows d={d} />
        <NoteBlock label={t("Notes", "ملاحظات")} text={d.customer_notes as string} />
        <NoteBlock
          label={t("Note", "ملاحظة")}
          text={(d.admin_notes || d.admin_comment || d.admin_note) as string}
          background="#2a1a1a"
          color="#f0c0c0"
          marginTop={8}
        />
      </>
    );
  }

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
        <div className="notif-details-box" style={{ borderColor }}>{detailRows}</div>
      </div>
    </div>
  );
}
