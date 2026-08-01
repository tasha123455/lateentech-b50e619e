import { useEffect, useMemo, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { initials } from "../lib/format";
import type { ReceiptOrder } from "../lib/types";
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

  const q = search.trim().toLowerCase();
  const list = useMemo(
    () =>
      verifyMarketers.filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      ),
    [verifyMarketers, q],
  );

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
        <div className="adm-mkt-av" data-no-i18n>{initials(m.name)}</div>
        <div className="adm-mkt-main">
          <div className="adm-mkt-name-row">
            <span className="adm-mkt-name" data-no-i18n>{m.name}</span>
            {m.pending.length ? (
              <span className="adm-mkt-badge">{m.pending.length} pending</span>
            ) : (
              <span className="adm-mkt-badge clear">All clear</span>
            )}
          </div>
          <div className="adm-mkt-contact">{[m.phone, m.email].filter(Boolean).join(" · ")}</div>
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
      <div className="adm-h1">Order Verification Hub</div>
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
