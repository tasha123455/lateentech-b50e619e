import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";
import { dispPhone, initials, whenFull } from "../lib/format";
import type { AdminReport } from "../lib/types";
import { Money } from "../ui/Money";
import { goToAccount } from "../users/UserCard";

const typeLabel = (t?: string | null): string => {
  if (t === "product") return "Product";
  if (t === "merchant" || t === "business") return "Merchant";
  if (!t) return "Other";
  return String(t).charAt(0).toUpperCase() + String(t).slice(1);
};

const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

/** Phone, email and the way into the account, folded away — the card is about
 *  the complaint, not about the person who filed it. */
function MoreInfo({
  phone, email, onGoToAccount,
}: {
  phone?: string | null;
  email?: string | null;
  onGoToAccount: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rpt-more">
      <button className="rpt-more-hd" onClick={() => setOpen((v) => !v)}>
        <span>More info</span>
        <svg
          className={"rpt-more-chev" + (open ? " open" : "")}
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="rpt-more-body">
          <div className="rpt-more-row">
            <span className="rpt-more-k">Phone Number</span>
            <span className="rpt-more-v" data-no-i18n>{dispPhone(phone) || "—"}</span>
          </div>
          <div className="rpt-more-row">
            <span className="rpt-more-k">Email</span>
            <span className="rpt-more-v" data-no-i18n>{email || "—"}</span>
          </div>
          <button className="adm-go-btn rpt-go-btn" onClick={onGoToAccount}>Go to Account</button>
        </div>
      )}
    </div>
  );
}

/** The bell beside each party. Marketer and business each get their own, so a
 *  reply to one is never mistaken for a reply to the other. */
function FeedbackBell({
  open, onToggle, value, onChange, onSend, busy, placeholder, sendLabel,
}: {
  open: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  sendLabel: string;
}) {
  return (
    <>
      <button
        className={"rpt-bell" + (open ? " on" : "")}
        onClick={onToggle}
        aria-label="Feedback"
        title="Feedback"
      >
        <Bell />
      </button>
      {open && (
        <div className="rpt-feedback">
          <textarea
            className="rpt-comment-ta"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button className="adm-btn adm-btn-acc" style={{ width: "100%" }} disabled={busy} onClick={onSend}>
            {sendLabel}
          </button>
        </div>
      )}
    </>
  );
}

function ReportCard({
  r, onOpenProduct, onResolve, onNotifyBusiness,
}: {
  r: AdminReport;
  onOpenProduct: (id: string) => void;
  onResolve: (id: string, comment: string) => Promise<void>;
  onNotifyBusiness: (businessId: string, comment: string) => Promise<void>;
}) {
  const [openBell, setOpenBell] = useState<"" | "marketer" | "business">("");
  const [mkText, setMkText] = useState("");
  const [bizText, setBizText] = useState("");
  const [busy, setBusy] = useState(false);

  const reporter = r.reporter || {};
  const business = r.business || {};
  const product = r.product || {};
  const reporterName = reporter.full_name || "Unknown marketer";
  const businessName = business.business_name || business.full_name || "Unknown business";
  const photo = Array.isArray(product.photos) ? product.photos[0] : null;

  const send = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rpt-card">
      <div className="rpt-date" data-no-i18n>{whenFull(r.created_at)}</div>

      <div className="rpt-party-ttl">Marketer</div>
      <div className="rpt-party">
        <div className="adm-user-av" data-no-i18n>{initials(reporterName)}</div>
        <div className="rpt-name" data-no-i18n>{reporterName}</div>
      </div>

      <MoreInfo
        phone={reporter.phone}
        email={reporter.email}
        onGoToAccount={() => goToAccount(r.reporter_id || "", "marketer", reporterName)}
      />

      <div className="rpt-kv">
        <span className="rpt-kv-k">Report Type</span>
        <span className="rpt-kv-v">{typeLabel(r.report_type)}</span>
      </div>

      <div className="rpt-kv-k rpt-comment-lbl">Comment</div>
      <div className="rpt-msg" data-no-i18n>
        {r.message ? r.message : <span style={{ opacity: 0.6 }}>No comment</span>}
      </div>

      <div className="rpt-bell-row">
        <FeedbackBell
          open={openBell === "marketer"}
          onToggle={() => setOpenBell((v) => (v === "marketer" ? "" : "marketer"))}
          value={mkText}
          onChange={setMkText}
          busy={busy}
          placeholder="Write your review of this report — the marketer will see it as 'Report reviewed'"
          sendLabel="Send review to marketer"
          onSend={() => void send(() => onResolve(r.id, mkText))}
        />
      </div>

      {!!r.business_id && (
        <>
          <div className="rpt-divider" />
          <div className="rpt-party-ttl">Business</div>
          <div className="rpt-name" data-no-i18n style={{ marginBottom: 8 }}>{businessName}</div>

          <div className="rpt-prod">
            {photo ? (
              <img className="rpt-mini-thumb" src={photo} alt="" data-no-i18n />
            ) : (
              <div className="rpt-mini-thumb-empty">📦</div>
            )}
            <div className="rpt-prod-rows">
              <div className="rpt-kv">
                <span className="rpt-kv-k">Product</span>
                <span className="rpt-kv-v" data-no-i18n>{product.name || ""}</span>
                {!product.name && <span className="rpt-kv-v">Product no longer available</span>}
              </div>
              <div className="rpt-kv">
                <span className="rpt-kv-k">Price</span>
                <span className="rpt-kv-v">
                  {product.price != null ? <Money n={product.price} /> : "—"}
                </span>
              </div>
              <div className="rpt-kv">
                <span className="rpt-kv-k">Product Code</span>
                <span className="rpt-kv-v" data-no-i18n>{product.code || "—"}</span>
              </div>
            </div>
          </div>

          {/* Straight to the product being complained about, not the shop's
              dashboard — the admin already knows which product they are on. */}
          <button
            className="adm-go-btn rpt-go-btn"
            onClick={() => goToAccount(r.business_id!, "business", businessName, r.product_id || undefined)}
          >
            Go to Account
          </button>

          <div className="rpt-bell-row">
            <FeedbackBell
              open={openBell === "business"}
              onToggle={() => setOpenBell((v) => (v === "business" ? "" : "business"))}
              value={bizText}
              onChange={setBizText}
              busy={busy}
              placeholder="Write a note to the business about this report"
              sendLabel="Send note to business"
              onSend={() => void send(async () => {
                await onNotifyBusiness(r.business_id!, bizText);
                setBizText("");
                setOpenBell("");
              })}
            />
          </div>
        </>
      )}

      {!!r.product_id && (
        <button className="rpt-view-prod" onClick={() => onOpenProduct(r.product_id!)}>
          Open product details
        </button>
      )}
    </div>
  );
}

export function ReportsPage({
  active, onBack, onOpenProduct,
}: {
  active: boolean;
  onBack: () => void;
  onOpenProduct: (id: string) => void;
}) {
  const { reports, loadReports, api } = useAdminData();
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!active) return;
    void loadReports().then(() => setLoadedOnce(true));
  }, [active, loadReports]);

  /* No history: a reviewed report is finished with and drops off the page, so
     there is nothing to filter between either. The row stays in the database
     as the audit trail — it is just not something the admin has to scroll past. */
  const list = reports.filter((r) => r.status === "open");

  const resolve = async (id: string, comment: string) => {
    const text = comment.trim();
    if (!text) {
      alert("Write a comment before sending your review.");
      return;
    }
    if (!confirm('Send this review to the marketer? They will be notified as "Report reviewed", and the report closes.')) return;
    try {
      await api.admin.resolveReport(id, text);
      await loadReports();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const notifyBusiness = async (businessId: string, comment: string) => {
    const text = comment.trim();
    if (!text) {
      alert("Write a note before sending it to the business.");
      return;
    }
    try {
      await api.admin.sendUserNotification(businessId, "A report about your product", text, null);
      alert("Note sent to the business.");
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  let body: React.ReactNode;
  if (!reports.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">No open reports.</div>;
  } else {
    body = list.map((r) => (
      <ReportCard
        key={r.id}
        r={r}
        onOpenProduct={onOpenProduct}
        onResolve={resolve}
        onNotifyBusiness={notifyBusiness}
      />
    ));
  }

  return (
    <>
      <PageHeader title="Reports" onBack={onBack} count={list.length} />
      <div>{body}</div>
    </>
  );
}
