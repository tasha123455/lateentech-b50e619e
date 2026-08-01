import { useEffect, useMemo, useState } from "react";

import { normSearch } from "@/components/dashboard/marketer/lib/format";

import { useAdminData } from "../AdminDataProvider";
import { dispPhone, initials } from "../lib/format";
import type { ReceiptOrder, VerifyMarketer } from "../lib/types";
import { MarketerDetailOverlay } from "./MarketerDetailOverlay";
import { RefundModal } from "./RefundModal";

export function VerifyPage({ active }: { active: boolean }) {
  const { verifyMarketers, loadVerify, loadMetrics, loading, failed, api } = useAdminData();
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<ReceiptOrder | null>(null);

  useEffect(() => {
    if (active) void loadVerify();
  }, [active, loadVerify]);

  /* A marketer is a match on their own details or on anything in any receipt
     of theirs — customer, that customer's number, the order code, the product.
     normSearch folds case and the Arabic letter variants, so typing in either
     language finds the same row. */
  const q = normSearch(search);
  const list = useMemo(() => {
    if (!q) return verifyMarketers;
    const text = (m: VerifyMarketer) =>
      normSearch(
        [
          m.name, m.phone, m.email,
          ...[...m.pending, ...m.history].flatMap((o) => [
            o.customer_name,
            o.customer_phone,
            "#" + (o.order_number || String(o.id || "").slice(0, 8)),
            o.product && o.product.name,
          ]),
        ]
          .filter(Boolean)
          .join(" "),
      );
    return verifyMarketers.filter((m) => text(m).includes(q));
  }, [verifyMarketers, q]);

  const approve = async (id: string) => {
    if (!confirm("Approve this receipt? The order will be forwarded to the business owner.")) return;
    try {
      await api.admin.approveOrder(id);
      void loadVerify();
    } catch (e) {
      alert("Approve failed: " + (e as Error).message);
    }
  };

  const reject = async (id: string) => {
    const notes = prompt("Reason for rejecting this receipt? (visible to the marketer)");
    if (notes === null) return;
    try {
      await api.admin.rejectOrder(id, notes || "Receipt rejected");
      void loadVerify();
    } catch (e) {
      alert("Reject failed: " + (e as Error).message);
    }
  };

  const startRefund = (id: string) => {
    let found: ReceiptOrder | null = null;
    for (const m of verifyMarketers) {
      found = (m.pending || []).find((o) => o.id === id) || (m.history || []).find((o) => o.id === id) || found;
      if (found && found.id === id) break;
    }
    setRefundOrder(found);
  };

  const finishRefund = async (comment: string | null) => {
    const order = refundOrder;
    setRefundOrder(null);
    if (comment === null || !order) return;
    try {
      await api.admin.refundOrder(order.id, comment);
      void loadVerify();
      void loadMetrics();
    } catch (e) {
      alert("Refund failed: " + (e as Error).message);
    }
  };

  let body: React.ReactNode;
  if (loading.verify) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (failed.verify) {
    body = <div className="adm-empty">Failed to load.</div>;
  } else if (!list.length) {
    body = (
      <div className="adm-empty">
        {verifyMarketers.length ? "No marketers match your search." : "No receipts awaiting review."}
      </div>
    );
  } else {
    body = list.map((m) => (
      <div className="adm-mkt-row" key={m.id} onClick={() => setDetailId(m.id)}>
        <div className="adm-mkt-av" data-no-i18n>
          {m.avatar_signed_url
            ? <img src={m.avatar_signed_url} alt="" loading="lazy" decoding="async" />
            : initials(m.name)}
        </div>
        <div className="adm-mkt-main">
          <div className="adm-mkt-name-row">
            <span className="adm-mkt-name" data-no-i18n>{m.name}</span>
            {m.pending.length ? (
              <span className="adm-mkt-badge">{m.pending.length} pending</span>
            ) : (
              <span className="adm-mkt-badge clear">All clear</span>
            )}
          </div>
          <div className="adm-mkt-contact" data-no-i18n>
            {[dispPhone(m.phone), m.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="adm-mkt-chev">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    ));
  }

  return (
    <>
      <input
        className="adm-search"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="adm-section">{body}</div>

      <MarketerDetailOverlay
        marketer={detailId ? verifyMarketers.find((m) => m.id === detailId) || null : null}
        onClose={() => setDetailId(null)}
        onApprove={approve}
        onReject={reject}
        onRefund={startRefund}
      />

      {!!refundOrder && <RefundModal order={refundOrder} onDone={finishRefund} />}
    </>
  );
}
