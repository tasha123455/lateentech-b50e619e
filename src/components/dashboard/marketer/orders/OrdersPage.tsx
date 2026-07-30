import { useMemo, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr, normSearch } from "../lib/format";
import { locSearchText, orderMatchesFilter } from "../lib/mappers";
import { removeDraft } from "../lib/storage";
import type { MarketerOrder } from "../lib/types";
import { OrderCard } from "./OrderCard";
import { filterLabels } from "./orderText";

const FILTERS = ["all", "draft", "pending", "approved", "rejected", "failed"] as const;

export function OrdersPage({
  onAddOrder, onEditOrder, onOpenSaved, onHowTo, onUploadReceipt, uploadingId,
}: {
  onAddOrder: () => void;
  onEditOrder: (o: MarketerOrder) => void;
  onOpenSaved: () => void;
  onHowTo: (o: MarketerOrder) => void;
  onUploadReceipt: (id: string) => void;
  uploadingId: string | null;
}) {
  const { orders, setOrders, products, productsMap, userId, blockIfFrozen, frozen } = useMarketerData();

  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const q = normSearch(query.trim());

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, draft: 0, pending: 0, approved: 0, rejected: 0, failed: 0 };
    orders.forEach((o) => {
      FILTERS.forEach((f) => {
        if (orderMatchesFilter(o, f)) c[f]++;
      });
    });
    return c;
  }, [orders]);

  const shown = useMemo(
    () =>
      orders.filter((o) => {
        if (!orderMatchesFilter(o, filter)) return false;
        if (!q) return true;
        const hay = normSearch(
          [o.id, o.customerName, o.phone, o.whatsapp, o.address, o.productName, o.size, o.color, o.notes,
           locSearchText(o.city, o.country, o.countryCode)]
            .filter(Boolean)
            .join(" "),
        );
        return hay.includes(q);
      }),
    [orders, filter, q],
  );

  const labels = filterLabels();
  const ar = isAr();

  const editOrder = (id: string) => {
    if (blockIfFrozen()) return;
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    if (["pending", "approved", "confirmed", "delivered", "cancelled"].includes(o._status as string)) return;
    onEditOrder(o);
  };

  const deleteOrder = (id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    if (["pending", "approved", "confirmed", "delivered", "cancelled"].includes(o._status as string)) return;
    if (!o.dbId) removeDraft(id, userId);
    setOrders((prev) => prev.filter((x) => x.id !== id));
  };

  const viewReceipt = (id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o || !o.receiptUrl) return;
    try {
      window.open(o.receiptUrl, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span>Orders</span>
        <button
          type="button"
          onClick={onOpenSaved}
          style={{
            display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px",
            borderRadius: 20, border: "1px solid #7f77dd", background: "transparent", color: "#7f77dd",
            fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#e07070" stroke="#e07070" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          <span>Saved</span>
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", margin: "0 0 14px" }}>
        <button
          className="add-order-btn"
          onClick={onAddOrder}
          disabled={frozen}
          style={frozen ? { opacity: 0.45, pointerEvents: "none", cursor: "not-allowed" } : undefined}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span data-i18n="Add order">Add order</span>
        </button>
      </div>

      <div style={{ position: "relative", margin: "0 0 12px" }}>
        <svg
          style={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", pointerEvents: "none", opacity: 0.6 }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your orders"
          data-i18n-ph="Search your orders"
          style={{
            width: "100%", boxSizing: "border-box", background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)", borderRadius: 12,
            color: "var(--color-text-primary)", fontFamily: "var(--font-sans)", fontSize: 13,
            padding: "10px 12px 10px 34px", outline: "none",
          }}
        />
      </div>

      <div className="ord-fchip-row" data-no-i18n>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <div key={f} className={"ord-fchip" + (active ? " active" : "")} data-f={f} onClick={() => setFilter(f)}>
              {labels[f]}{active ? ` (${counts[f] || 0})` : ""}
            </div>
          );
        })}
      </div>

      {!orders.length ? (
        <div className="empty-center">
          <div className="empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.6" strokeLinecap="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="empty-text">
            No orders yet.
            <br />
            Tap the button above to add your first order.
          </div>
        </div>
      ) : (
        <div className="orders-list-pg">
          {!shown.length ? (
            <div className="empty-text" data-no-i18n style={{ padding: "2rem 1rem", textAlign: "center" }}>
              {ar ? "لا توجد طلبات مطابقة لبحثك" : "No orders match your search."}
            </div>
          ) : (
            shown.map((o) => (
              <OrderCard
                key={o.id}
                o={o}
                product={products.find((p) => p.id === o.productKey) || null}
                liveProduct={o.productKey ? productsMap[o.productKey] || null : null}
                onEdit={editOrder}
                onDelete={deleteOrder}
                onUploadReceipt={onUploadReceipt}
                onViewReceipt={viewReceipt}
                onHowTo={(id) => {
                  const found = orders.find((x) => x.id === id);
                  if (found) onHowTo(found);
                }}
                uploadingId={uploadingId}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
