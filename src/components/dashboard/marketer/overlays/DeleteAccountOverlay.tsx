import { useCallback, useEffect, useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { t } from "../lib/format";

export type DeletionStatus = { id: string; status: string; scheduled_for?: string } | null;

/** Status is fetched when the profile page opens and cached, so opening the
    modal never shows a loading state. */
export function useDeletionStatus(profileOpen: boolean) {
  const { api } = useMarketerData();
  const [status, setStatus] = useState<DeletionStatus>(null);
  const [wallet, setWallet] = useState<{ balance?: number; pending?: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus((await api.getAccountDeletionStatus()) as DeletionStatus);
    } catch {
      setStatus(null);
    }
    try {
      setWallet((await api.getWallet()) as { balance?: number; pending?: number } | null);
    } catch {
      setWallet(null);
    }
  }, [api]);

  useEffect(() => {
    if (profileOpen) void refresh();
  }, [profileOpen, refresh]);

  return { status, setStatus, wallet, refresh };
}

/** The row shown at the bottom of the profile page. */
export function DeleteAccountSlot({ status, onOpen }: { status: DeletionStatus; onOpen: () => void }) {
  if (status && status.status === "scheduled") {
    const d = new Date(status.scheduled_for as string);
    const dateStr = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    return (
      <div onClick={onOpen} style={{ cursor: "pointer", textAlign: "right", fontSize: 12, lineHeight: 1.5, color: "#e07070" }}>
        {t("Account deletion scheduled for", "حذف الحساب مجدول بتاريخ")} <b data-no-i18n>{dateStr}</b>
      </div>
    );
  }
  if (status && status.status === "wallet_review") {
    return (
      <div onClick={onOpen} style={{ cursor: "pointer", textAlign: "right", fontSize: 12, lineHeight: 1.5, color: "#e07070" }}>
        {t("Deletion request under review", "طلب حذف الحساب قيد المراجعة")}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: "transparent", color: "#e07070", border: "1px solid #e07070", borderRadius: 8,
        padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}
    >
      {t("Delete my account", "حذف الحساب")}
    </button>
  );
}

export function DeleteAccountOverlay({
  open, onClose, status, setStatus, wallet, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  status: DeletionStatus;
  setStatus: (s: DeletionStatus) => void;
  wallet: { balance?: number; pending?: number } | null;
  onChanged: () => void;
}) {
  const { api } = useMarketerData();

  const requestDeletion = async () => {
    if (!confirm(t("Are you sure? This starts the account deletion process.", "هل أنت متأكد؟ سيبدأ هذا عملية حذف الحساب."))) return;
    try {
      setStatus((await api.requestAccountDeletion("marketer")) as DeletionStatus);
      onChanged();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const cancelDeletion = async (id: string) => {
    if (!confirm(t("Cancel your account deletion request?", "هل تريد إلغاء طلب حذف الحساب؟"))) return;
    try {
      await api.cancelAccountDeletion(id);
      setStatus(null);
      onChanged();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  };

  const bal = (wallet && Number(wallet.balance)) || 0;
  const pending = (wallet && Number(wallet.pending)) || 0;
  const hasFunds = bal > 0 || pending > 0;

  let body: React.ReactNode;
  if (status && status.status === "scheduled") {
    const d = new Date(status.scheduled_for as string);
    const dateStr = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    body = (
      <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
        <div style={{ fontSize: 14, color: "var(--color-text-primary)", marginBottom: 8 }}>
          {t("Your account is scheduled for deletion on", "حسابك مجدول للحذف بتاريخ")} <b data-no-i18n>{dateStr}</b>.
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20 }}>
          {t("Changed your mind? You can cancel anytime before that date.", "غيّرت رأيك؟ يمكنك الإلغاء في أي وقت قبل هذا التاريخ.")}
        </div>
        <button
          onClick={() => void cancelDeletion(status.id)}
          style={{
            width: "100%", background: "#8b83e8", color: "#fff", border: "none", borderRadius: 12,
            padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {t("Cancel deletion", "إلغاء الحذف")}
        </button>
      </div>
    );
  } else if (status && status.status === "wallet_review") {
    body = (
      <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
        <div style={{ fontSize: 14, color: "var(--color-text-primary)", marginBottom: 8 }}>
          {t("Your request is with our team", "طلبك قيد المراجعة من فريقنا")}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20 }}>
          {t(
            "You have a wallet balance, so an admin needs to settle it with you before deletion is scheduled. We'll notify you once it's reviewed.",
            "لديك رصيد في محفظتك، لذا يحتاج الأدمن لتسويته معك قبل جدولة الحذف. سنُعلمك فور المراجعة.",
          )}
        </div>
        <button
          onClick={() => void cancelDeletion(status.id)}
          style={{
            width: "100%", background: "transparent", color: "var(--color-text-secondary)",
            border: "1px solid #3a3a3a", borderRadius: 12, padding: 13, fontSize: 13, cursor: "pointer",
          }}
        >
          {t("Cancel request", "إلغاء الطلب")}
        </button>
      </div>
    );
  } else {
    body = (
      <div style={{ padding: "6px 0" }}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 6 }}>
          {t(
            "This will permanently delete your account after a 14-day grace period. You can cancel anytime from your profile info page.",
            "سيؤدي هذا إلى حذف حسابك نهائياً بعد فترة سماح مدتها 14 يوماً. يمكنك الإلغاء في أي وقت قبل ذلك من صفحه معلوماتك الشخصيه.",
          )}
        </div>
        {hasFunds && (
          <div style={{ margin: "14px 0", padding: 12, borderRadius: 10, background: "#2a1a1a", color: "#f0c0c0", fontSize: 12, lineHeight: 1.6 }}>
            {t(
              "You have a wallet balance. Your request will be sent to an admin to settle your balance with you before your account is scheduled for deletion.",
              "لديك رصيد في محفظتك. سيتم إرسال طلبك إلى الأدمن لتسوية رصيدك معك قبل جدولة حذف حسابك.",
            )}
          </div>
        )}
        <button
          onClick={() => void requestDeletion()}
          style={{
            width: "100%", marginTop: 16, background: "#e07070", color: "#fff", border: "none",
            borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {t("Yes, delete my account", "نعم، احذف حسابي")}
        </button>
        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 10, background: "transparent", color: "var(--color-text-secondary)",
            border: "1px solid #3a3a3a", borderRadius: 12, padding: 13, fontSize: 13, cursor: "pointer",
          }}
        >
          {t("Never mind", "تراجع")}
        </button>
      </div>
    );
  }

  return (
    <div className={"menu-overlay" + (open ? " open" : "")}>
      <div className="menu-backdrop" onClick={onClose} />
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0, right: 0, background: "#1e1e1e",
          padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: "#e07070" }}>
            {t("Delete my account", "إحذف حسابك")}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1 }}>{body}</div>
      </div>
    </div>
  );
}
