import { coverStyle } from "@/lib/coverFocus";
import { useEffect, useMemo, useState } from "react";

import { isAr, normSearch, searchMatcher } from "@/components/dashboard/marketer/lib/format";
import { useAccordion } from "@/lib/useAccordion";

import { useAdminData } from "../AdminDataProvider";
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

/** Everything a report can be found by, normalised once per report so typing
 *  in either language matches: normSearch folds case, Arabic diacritics and
 *  the alef/ya variants that make an Arabic name miss an exact compare. */
function searchText(r: AdminReport): string {
  const reporter = r.reporter || {};
  const business = r.business || {};
  const product = r.product || {};
  return normSearch(
    [
      reporter.full_name, reporter.business_name, reporter.email, reporter.phone,
      business.business_name, business.full_name, business.phone,
      product.name, product.code,
      typeLabel(r.report_type), r.message,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const Chev = ({ open, cls }: { open: boolean; cls: string }) => (
  <svg
    className={cls + (open ? " open" : "")}
    width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Phone, email and the way into the account, folded away. The bell sits on
 *  the same row so it costs no extra height. */
function MoreInfo({
  phone, email, onGoToAccount, bell,
}: {
  phone?: string | null;
  email?: string | null;
  onGoToAccount: () => void;
  bell: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rpt-more-row-wrap">
      <div className="rpt-more">
        <button className="rpt-more-hd" onClick={() => setOpen((v) => !v)}>
          <span>More info</span>
          <Chev open={open} cls="rpt-more-chev" />
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
      {bell}
    </div>
  );
}

function FeedbackBox({
  open, value, onChange, onSend, busy, placeholder, sendLabel,
}: {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  sendLabel: string;
}) {
  if (!open) return null;
  return (
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
  );
}

function ReportCard({
  r, onOpenProduct, onResolve, onNotifyBusiness, open, onToggle,
}: {
  r: AdminReport;
  onOpenProduct: (id: string) => void;
  onResolve: (id: string, comment: string) => Promise<void>;
  onNotifyBusiness: (reportId: string, comment: string) => Promise<void>;
  open: boolean;
  onToggle: () => void;
}) {
  const [openBell, setOpenBell] = useState<"" | "marketer" | "business">("");
  const [mkText, setMkText] = useState("");
  const [bizText, setBizText] = useState("");
  const [busy, setBusy] = useState(false);
  const [bizOpen, setBizOpen] = useState(false);

  const reporter = r.reporter || {};
  const business = r.business || {};
  const product = r.product || {};
  const reporterName = reporter.full_name || reporter.business_name || "Unknown marketer";
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

  /* Which halves are already done. A report stays in the list until both are,
     so the card has to say which one it is still waiting on — otherwise it
     looks like the send failed. */
  const mkDone = !!r.marketer_notified_at;
  const bizDone = !!r.business_notified_at;

  const bellBtn = (which: "marketer" | "business") => {
    const done = which === "marketer" ? mkDone : bizDone;
    if (done) {
      return <span className="rpt-sent" data-no-i18n>{isAr() ? "تم الإرسال ✓" : "Sent ✓"}</span>;
    }
    return (
      <button
        className={"rpt-bell" + (openBell === which ? " on" : "")}
        onClick={(e) => { e.stopPropagation(); setOpenBell((v) => (v === which ? "" : which)); }}
        aria-label="Feedback"
        title="Feedback"
      >
        <Bell />
      </button>
    );
  };

  /* Named plainly rather than as a status word: the admin wants to know what
     is left to do, not what state a row is in. */
  const waitingOn = (() => {
    const left: string[] = [];
    if (!mkDone) left.push(isAr() ? "المسوّق" : "the marketer");
    if (!!r.business_id && !bizDone) left.push(isAr() ? "صاحب النشاط" : "the business");
    if (!left.length) return "";
    return (isAr() ? "في انتظار الإرسال إلى: " : "Still to send to: ") + left.join(isAr() ? " و" : " and");
  })();

  return (
    <div className={"rpt-card" + (open ? " open" : "")}>
      {/* Collapsed, this row is the whole card: who, about what, when. */}
      <button className="rpt-head" onClick={onToggle}>
        <div className="adm-user-av" data-no-i18n>
          {reporter.avatar_signed_url
            ? <img src={reporter.avatar_signed_url} alt="" loading="lazy" decoding="async" />
            : initials(reporterName)}
        </div>
        <div className="rpt-head-mid">
          <div className="rpt-name" data-no-i18n>{reporterName}</div>
          <div className="rpt-head-sub" data-no-i18n>
            {product.name || businessName}
            {product.code ? " · " + product.code : ""}
          </div>
        </div>
        {/* The type is a row inside — on the outside it was a pill of jargon
            next to the one thing you actually scan for, the product. */}
        <span className="rpt-date" data-no-i18n>{whenFull(r.created_at)}</span>
        <Chev open={open} cls="rpt-head-chev" />
      </button>

      {open && (
        <div className="rpt-body">
          {!!waitingOn && (
            <div className="rpt-waiting" data-no-i18n>{waitingOn}</div>
          )}
          <div className="rpt-party-ttl">Marketer</div>
          <MoreInfo
            phone={reporter.phone}
            email={reporter.email}
            onGoToAccount={() => goToAccount(r.reporter_id || "", "marketer", reporterName)}
            bell={bellBtn("marketer")}
          />
          <FeedbackBox
            open={openBell === "marketer" && !mkDone}
            value={mkText}
            onChange={setMkText}
            busy={busy}
            placeholder="Write your review of this report — the marketer will see it as 'Report reviewed'"
            sendLabel="Send review to marketer"
            onSend={() => void send(() => onResolve(r.id, mkText))}
          />

          {/* The type and what was written about it are one thought, so they
              are one box. Split apart, the type read as a stray field above a
              quotation it belonged to. */}
          <div className="rpt-msg rpt-msg-box">
            <div className="rpt-kv rpt-msg-type">
              <span className="rpt-kv-k">Report Type</span>
              <span className="rpt-kv-v">{typeLabel(r.report_type)}</span>
            </div>
            <div data-no-i18n>
              {r.message ? r.message : <span style={{ opacity: 0.6 }}>No comment</span>}
            </div>
          </div>

          {!!r.business_id && (
            <>
              <div className="rpt-divider" />
              {/* Folded away. The report is about a marketer's complaint; who
                  they are complaining about is reference material, so it opens
                  when it is wanted rather than filling the card by default. */}
              <button
                type="button"
                className="rpt-party-ttl rpt-party-toggle"
                aria-expanded={bizOpen}
                onClick={() => setBizOpen((v) => !v)}
              >
                Business
                <span className={"rpt-party-chev" + (bizOpen ? " open" : "")}>▾</span>
              </button>
              {bizOpen && (
              <>
              <div className="rpt-name" data-no-i18n style={{ marginBottom: 8 }}>{businessName}</div>

              <div className="rpt-prod">
                {photo ? (
                  <img
                    className="rpt-mini-thumb"
                    src={photo}
                    alt=""
                    data-no-i18n
                    style={coverStyle(product.cover_focus_x, product.cover_focus_y)}
                  />
                ) : (
                  <div className="rpt-mini-thumb-empty">📦</div>
                )}
                <div className="rpt-prod-rows">
                  <div className="rpt-kv">
                    <span className="rpt-kv-k">Product</span>
                    {product.name
                      ? <span className="rpt-kv-v" data-no-i18n>{product.name}</span>
                      : <span className="rpt-kv-v">Product no longer available</span>}
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
                  dashboard, with its own bell on the same row. */}
              <div className="rpt-more-row-wrap">
                <button
                  className="adm-go-btn rpt-go-btn"
                  onClick={() => goToAccount(r.business_id!, "business", businessName, r.product_id || undefined)}
                >
                  Go to Account
                </button>
                {bellBtn("business")}
              </div>
              <FeedbackBox
                open={openBell === "business" && !bizDone}
                value={bizText}
                onChange={setBizText}
                busy={busy}
                placeholder="Write a note to the business about this report"
                sendLabel="Send note to business"
                onSend={() => void send(async () => {
                  await onNotifyBusiness(r.id, bizText);
                  setBizText("");
                  setOpenBell("");
                })}
              />
              </>
              )}
            </>
          )}

          {!!r.product_id && (
            <button className="rpt-view-prod" onClick={() => onOpenProduct(r.product_id!)}>
              Open product details
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The Reports half of the Requests page. The page itself owns the header and
 *  the tabs, so this is the list and its search. */
export function ReportsTab({
  active, onOpenProduct,
}: {
  active: boolean;
  onOpenProduct: (id: string) => void;
}) {
  const { reports, loadReports, api } = useAdminData();
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [search, setSearch] = useState("");
  const { isOpen, toggle } = useAccordion();

  useEffect(() => {
    if (!active) return;
    void loadReports().then(() => setLoadedOnce(true));
  }, [active, loadReports]);

  /* No history: a reviewed report is finished with and drops off the page, so
     there is nothing to filter between either. The row stays in the database
     as the audit trail — it is just not something the admin has to scroll past. */
  const list = useMemo(() => {
    const open = reports.filter((r) => r.status === "open");
    if (!search.trim()) return open;
    const match = searchMatcher(search);
    return open.filter((r) => match(searchText(r)));
  }, [reports, search]);

  const resolve = async (id: string, comment: string) => {
    const text = comment.trim();
    if (!text) {
      alert("Write a comment before sending your review.");
      return;
    }
    if (!confirm('Send this review to the marketer? They will be notified as "Report reviewed".')) return;
    try {
      await api.admin.resolveReport(id, text);
      await loadReports();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  /* Report-aware rather than a plain message to the shop: the report has to
     record that this half is done, and close once both halves are. */
  const notifyBusiness = async (reportId: string, comment: string) => {
    const text = comment.trim();
    if (!text) {
      alert("Write a note before sending it to the business.");
      return;
    }
    try {
      await api.admin.notifyReportBusiness(reportId, text);
      await loadReports();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  let body: React.ReactNode;
  if (!reports.length && !loadedOnce) {
    body = <div className="adm-empty">Loading…</div>;
  } else if (!list.length) {
    body = <div className="adm-empty">{search ? "No reports match your search." : "No open reports."}</div>;
  } else {
    body = list.map((r) => (
      <ReportCard
        key={r.id}
        r={r}
        onOpenProduct={onOpenProduct}
        onResolve={resolve}
        onNotifyBusiness={notifyBusiness}
        open={isOpen(r.id)}
        onToggle={() => toggle(r.id)}
      />
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
      <div>{body}</div>
    </>
  );
}
