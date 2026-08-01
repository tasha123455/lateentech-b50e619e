import { useEffect, useState } from "react";

import { useAdminData } from "../AdminDataProvider";
import { PageHeader } from "../ui/PageHeader";
import { dispPhone, initials, money, when } from "../lib/format";
import { goToAccount } from "../users/UserCard";

const typeLabel = (t?: string | null): string => {
  if (t === "product") return "Product";
  if (t === "merchant" || t === "business") return "Merchant";
  if (!t) return "Other";
  return String(t).charAt(0).toUpperCase() + String(t).slice(1);
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
];

export function ReportsPage({
  active, onBack, onOpenProduct,
}: {
  active: boolean;
  onBack: () => void;
  onOpenProduct: (id: string) => void;
}) {
  const { reports, loadReports, api } = useAdminData();
  const [filter, setFilter] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!active) return;
    void loadReports().then(() => setLoadedOnce(true));
  }, [active, loadReports]);

  const resolve = async (id: string) => {
    const comment = (comments[id] || "").trim();
    if (!comment) {
      alert("Write a comment before sending your review.");
      return;
    }
    if (!confirm('Send this review to the marketer? They will be notified as "Report reviewed".')) return;
    try {
      await api.admin.resolveReport(id, comment);
      await loadReports();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const list = filter ? reports.filter((r) => r.status === filter) : reports;

  let body: React.ReactNode;
  if (!reports.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">No reports{filter ? " in this filter" : ""}.</div>;
  } else {
    body = list.map((r) => {
      const reporter = r.reporter || {};
      const business = r.business || {};
      const product = r.product || {};
      const reporterName = reporter.full_name || "Unknown marketer";
      const businessName = business.business_name || business.full_name || "Unknown business";
      const isOpen = r.status === "open";
      const photo = Array.isArray(product.photos) ? product.photos[0] : null;

      return (
        <div className="rpt-card" key={r.id}>
          <div className="rpt-top">
            <span className="rpt-type-pill">{typeLabel(r.report_type)}</span>
            <span className={"rpt-status-pill " + (isOpen ? "rpt-status-open" : "rpt-status-resolved")}>
              {isOpen ? "Open" : "Resolved"}
            </span>
          </div>

          <div className="rpt-reporter-row">
            <div className="adm-user-av" data-no-i18n>{initials(reporterName)}</div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div className="rpt-name" data-no-i18n>{reporterName}</div>
              <div className="rpt-sub">
                <span data-no-i18n>{dispPhone(reporter.phone) || ""}</span>
                {!dispPhone(reporter.phone) && <span>no phone</span>}
                {" · "}<span data-no-i18n>{when(r.created_at)}</span>
              </div>
            </div>
            <button className="adm-go-btn" onClick={() => goToAccount(r.reporter_id || "", "marketer", reporterName)}>
              Go to marketer account
            </button>
          </div>

          <div className="rpt-type-row">
            <span className="rpt-field-label" style={{ marginBottom: 0 }}>Report type</span>
            <span className="rpt-type-pill">{typeLabel(r.report_type)}</span>
          </div>

          <div className="rpt-field-label">Marketer's comment</div>
          <div className="rpt-msg" data-no-i18n>
            {r.message ? r.message : <span style={{ opacity: 0.6 }}>No comment</span>}
          </div>

          {!!r.product_id && (
            <div className="rpt-mini-prod" onClick={() => onOpenProduct(r.product_id!)}>
              {photo ? (
                <img className="rpt-mini-thumb" src={photo} alt="" />
              ) : (
                <div className="rpt-mini-thumb-empty">📦</div>
              )}
              <div className="rpt-mini-info">
                <div className="rpt-name">
                  {product.name ? <span data-no-i18n>{product.name}</span> : "Product no longer available"}
                </div>
                <div className="rpt-sub">
                  {product.price != null ? money(product.price) : ""}
                  {product.code ? <> · <span data-no-i18n>{product.code}</span></> : null}
                </div>
              </div>
            </div>
          )}

          {!!r.business_id && (
            <div className="rpt-biz-row">
              <div style={{ minWidth: 0 }}>
                <div className="rpt-name" data-no-i18n>{businessName}</div>
                <div className="rpt-sub">{dispPhone(business.phone) ? <span data-no-i18n>{dispPhone(business.phone)}</span> : <span>no phone</span>}</div>
              </div>
              <button className="adm-go-btn" onClick={() => goToAccount(r.business_id!, "business", businessName)}>
                Go to business account
              </button>
            </div>
          )}

          {isOpen ? (
            <div className="rpt-comment-box">
              <textarea
                className="rpt-comment-ta"
                placeholder="Write your review of this report — the marketer will see it as 'Report reviewed'"
                value={comments[r.id] || ""}
                onChange={(e) => setComments((prev) => ({ ...prev, [r.id]: e.target.value }))}
              />
              <button className="adm-btn adm-btn-acc" style={{ width: "100%" }} onClick={() => void resolve(r.id)}>
                Send review to marketer
              </button>
            </div>
          ) : (
            <div className="rpt-resolved-note">
              <b>Admin comment:</b> <span data-no-i18n>{r.admin_comment || ""}</span>
              <div style={{ marginTop: 4, opacity: 0.8, fontSize: 11 }}>Reviewed {when(r.resolved_at)}</div>
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <>
      <PageHeader title="Reports" onBack={onBack} count={reports.filter((r) => r.status === "open").length} />
        <div className="adm-filter-row" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={"adm-filter-chip" + (filter === f.key ? " on" : "")}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      <div>{body}</div>
    </>
  );
}
