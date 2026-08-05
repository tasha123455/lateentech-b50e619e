import { ADMIN_WHATSAPP_DISPLAY } from "../lib/constants";
import { LIBYA } from "@/lib/markets/libya";
import { useScrollLock } from "@/lib/useScrollLock";
import { codPaysParts, daysPhrase, isAr } from "../lib/format";
import { Money } from "../ui/Money";

/** What the customer still pays on delivery, once fees are taken out. */
export type CodInfo = { pays: number; sym: string; code: string; delivery: number; shipping: number } | null;

const DiIcon = ({ stroke, children }: { stroke: string; children: React.ReactNode }) => (
  <svg className="di-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export function DepositInfoOverlay({ open, onClose, cod }: { open: boolean; onClose: () => void; cod: CodInfo }) {
  // Holds the page still behind the sheet.
  useScrollLock(open);
  const parts = cod ? codPaysParts(cod.delivery > 0, cod.shipping > 0) : null;
  const ar = isAr();
  /* The same number the server enforces, so the promise on this card and the
     rule in the database cannot drift apart. */
  const days = LIBYA.money.refundWindowDays;

  return (
    <div className={"overlay" + (open ? " open" : "")} style={{ zIndex: 1250, position: "fixed", inset: 0 }}>
      <div className="overlay-bg" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="sheet-title" style={{ marginBottom: 0 }} data-i18n="!Important">!Important</div>
        </div>
        <div className="sheet-sub" data-i18n="About the upfront deposit">About the upfront deposit</div>

        <div className="deposit-info-body">
          <div className="di-row">
            <DiIcon stroke="#2dbd8f">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </DiIcon>
            <span data-i18n="The fee is deducted from the product price, and is not an additional charge.">
              The fee is deducted from the product price, and is not an additional charge.
            </span>
          </div>

          {cod && parts && (
            <div className="di-row" style={{ display: "flex" }}>
              <DiIcon stroke="#2dbd8f">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </DiIcon>
              <span data-no-i18n>
                <span>{parts.label}</span>{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  <Money n={cod.pays} sym={cod.sym} code={cod.code} />
                </strong>
                <span>{parts.suffix}</span>
              </span>
            </div>
          )}

          <div className="di-row">
            <DiIcon stroke="#a89ee8">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </DiIcon>
            <span data-i18n="Your order will not be sent to the business owner until you upload proof of the upfront payment.">
              Your order will not be sent to the business owner until you upload proof of the upfront payment.
            </span>
          </div>

          <div className="di-row">
            <DiIcon stroke="#2dbd8f">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 12 15 16 10" />
            </DiIcon>
            <span data-i18n="Once your payment is reviewed and approved, the amount will appear in your Wallet as secured funds.">
              Once your payment is reviewed and approved, the amount will appear in your Wallet as secured funds.
            </span>
          </div>

          <div
            className="di-row"
            style={{ background: "rgba(224,112,112,0.14)", border: "1px solid rgba(224,112,112,0.5)", borderRadius: 10, padding: 12, marginBottom: 10 }}
          >
            <DiIcon stroke="#e07070">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </DiIcon>
            {/* Written out in both languages rather than left to the
                dictionary. The day count comes from the market rule, so the
                sentence is built at render time and could never match a fixed
                dictionary key — and a policy notice that silently disagrees
                with what the server enforces is worse than no notice. */}
            <span style={{ color: "#f5b0b0", fontWeight: 500 }} data-no-i18n>
              {ar ? (
                <>
                  النظام هذا يحفظ حقوق والتزامات المسوق وصاحب النشاط. العربون غير قابل للاسترجاع
                  إطلاقاً في أي حال من الأحوال، والعمولة تبقى للمسوق، إلاّ في حالتين بس يصير
                  استرجاع: ما وصل شي إطلاقاً، أو وصل منتج مختلف عن المطلوب. في هالحالتين تواصل مع
                  الإدارة{" "}
                  <bdi dir="ltr">{ADMIN_WHATSAPP_DISPLAY}</bdi>.{" "}
                  بعد التحقق يرجع العربون ويحظر صاحب النشاط نهائياً. بعد مرور {daysPhrase(days, true)} على
                  التسليم لا يوجد استرجاع، والمسؤولية تبقى على صاحب النشاط، وإجراء الإدارة يقتصر على
                  إخفاء أو حظر الحساب فقط.
                </>
              ) : (
                <>
                  This system protects the rights and responsibilities of both marketers and business
                  owners. The upfront fee is never refundable under any circumstances, and the
                  commission stays with the marketer — except in two cases: nothing was delivered at
                  all, or a different product was delivered. In those two cases contact the admin:{" "}
                  <bdi dir="ltr">{ADMIN_WHATSAPP_DISPLAY}</bdi>.{" "}
                  After verification the upfront fee is refunded and the business owner is permanently
                  banned. More than {daysPhrase(days, false)} after delivery there is no refund, the
                  responsibility stays with the business owner, and the admin may only hide or ban
                  the account.
                </>
              )}
            </span>
          </div>

          <div className="di-row">
            <DiIcon stroke="#e07070">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </DiIcon>
            <span data-i18n="Payments made outside the platform are not protected, and the platform accepts no responsibility for any fraud for off-platform transactions.">
              Payments made outside the platform are not protected, and the platform accepts no responsibility for any fraud for
              off-platform transactions.
            </span>
          </div>

          <div className="di-row">
            <DiIcon stroke="#a89ee8">
              <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </DiIcon>
            <span data-i18n="The amount shown is calculated per unit. If you increase the quantity, the required upfront payment increases accordingly.">
              The amount shown is calculated per unit. If you increase the quantity, the required upfront payment increases
              accordingly.
            </span>
          </div>

          <div className="di-row">
            <DiIcon stroke="#a89ee8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </DiIcon>
            <span data-i18n="After completing the payment, upload your payment receipt to continue.">
              After completing the payment, upload your payment receipt to continue.
            </span>
          </div>
        </div>

        <button className="cancel-btn" onClick={onClose} data-i18n="Close">Close</button>
      </div>
    </div>
  );
}
