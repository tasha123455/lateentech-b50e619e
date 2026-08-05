import { useEffect, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { useAccordion } from "@/lib/useAccordion";

import { searchMatcher } from "@/components/dashboard/marketer/lib/format";

import { dispPhone, initials } from "../lib/format";
import type { VerifyMarketer } from "../lib/types";
import { ReceiptCard } from "./ReceiptCard";

/** The receipt list for one marketer, split into New / History. Refreshes in
    the background update the counts and cards without rebuilding the search
    input, so a mid-typed search never loses focus or text. */
export function MarketerDetailOverlay({
  marketer, onClose, onApprove, onReject, onRefund,
}: {
  marketer: VerifyMarketer | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRefund: (id: string) => void;
}) {
  /* Only while the sheet is actually up. This component stays mounted
     with a null prop when it is closed, so locking unconditionally held
     the page still for the whole session. */
  useScrollLock(!!marketer);
  const [tab, setTab] = useState<"new" | "history">("new");
  const [search, setSearch] = useState("");
  const { isOpen, toggle, close } = useAccordion();

  // Opening a different marketer resets the view. Keyed on the id alone so a
  // background data refresh doesn't wipe a mid-typed search.
  const marketerId = marketer?.id;
  useEffect(() => {
    if (!marketerId) return;
    setTab("new");
    setSearch("");
    close();
  }, [marketerId, close]);

  const open = !!marketer;
  const q = search.trim();
  const match = searchMatcher(q);

  let body: React.ReactNode = null;
  if (!marketer) {
    body = <div className="adm-empty">This marketer has no receipts to show.</div>;
  } else {
    const baseList = tab === "new" ? marketer.pending : marketer.history;
    const list = q
      ? baseList.filter((o) =>
          match(
            [
              o.product && o.product.name,
              o.customer_name,
              o.customer_phone,
              "#" + (o.order_number || String(o.id || "").slice(0, 8)),
              marketer.name, marketer.phone, marketer.email,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        )
      : baseList;

    body = (
      <>
        <div className="adm-mkt-detail-head">
          <div className="adm-mkt-av" data-no-i18n>
            {marketer.avatar_signed_url
              ? <img src={marketer.avatar_signed_url} alt="" loading="lazy" decoding="async" />
              : initials(marketer.name)}
          </div>
          <div>
            <div className="adm-mkt-detail-name" data-no-i18n>{marketer.name}</div>
            <div className="adm-mkt-detail-contact" data-no-i18n>
              {[dispPhone(marketer.phone), marketer.email].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div className="adm-filter-row">
          <button className={"adm-filter-chip" + (tab === "new" ? " on" : "")} onClick={() => setTab("new")}>
            New{tab === "new" ? ` (${marketer.pending.length})` : ""}
          </button>
          <button className={"adm-filter-chip" + (tab === "history" ? " on" : "")} onClick={() => setTab("history")}>
            History{tab === "history" ? ` (${marketer.history.length})` : ""}
          </button>
        </div>
        <input
          className="adm-search"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div>
          {!list.length ? (
            <div className="adm-empty">
              {q
                ? "No receipts match your search."
                : tab === "new"
                  ? "No pending receipts. This marketer is all caught up."
                  : "No reviewed receipts yet."}
            </div>
          ) : (
            list.map((o) => (
              <ReceiptCard
                key={o.id}
                o={o}
                onApprove={onApprove}
                onReject={onReject}
                onRefund={onRefund}
                open={isOpen(o.id)}
                onToggle={() => toggle(o.id)}
              />
            ))
          )}
        </div>
      </>
    );
  }

  return (
    <div
      className={"adm-pdetail" + (open ? " open" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm-pdetail-card">
        <button className="adm-pdetail-close" onClick={onClose}>×</button>
        <div>{body}</div>
      </div>
    </div>
  );
}
