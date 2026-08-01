import { useState } from "react";

import { CountryCodePicker, CountryPicker } from "@/components/auth/CountryCodePicker";
import { supabase } from "@/integrations/supabase/client";
import { readImpersonation } from "@/lib/impersonation";

/* The one place a sign-in email and a phone number can be changed.
 *
 * It deliberately has no home of its own in the admin panel. An admin opens
 * the person's account the same way they would to look at anything else, goes
 * to their profile, and the box is there — so the change happens while looking
 * at the account it belongs to, not from a list of names.
 *
 * It stays shut until an admin types the unlock code. The browser never learns
 * the code and never learns whether the environment has one set: it posts what
 * was typed and the server answers yes or no. Everything else — is there a
 * session, is it an admin's, is the old Google account cut off — happens
 * there too, so nothing here is load bearing for security. This component only
 * decides what to draw. */

type Step = "idle" | "code" | "edit";
type Reply = { ok?: boolean; message?: string; error?: string; email?: string; phone?: string };

async function post(body: { code: string; userId?: string; email?: string; phone?: string; cc?: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  const res = await fetch("/api/admin/account-access", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  let payload: Reply = {};
  try {
    payload = await res.json();
  } catch {
    /* a proxy or a crash can answer with something that is not JSON */
  }
  if (!res.ok || !payload.ok) throw new Error(payload.message || "That did not work. Try again.");
  return payload;
}

/** "+2180912345678" → "0912345678", so the box shows what they would type. */
const localDigits = (phone?: string | null) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d.startsWith("218") ? d.slice(3) : d;
};

export function AdminEmailEditor({
  current, currentPhone, onChanged, onPhoneChanged,
}: {
  current?: string | null;
  currentPhone?: string | null;
  onChanged?: (email: string) => void;
  onPhoneChanged?: (phone: string) => void;
}) {
  const imp = readImpersonation();
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  // Somebody looking at their own dashboard never sees any of this.
  if (!imp) return null;

  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const reset = () => {
    setStep("idle"); setCode(""); setEmail(""); setPhone(""); setErr(""); setBusy(false);
  };

  const unlock = async () => {
    setBusy(true); setErr("");
    try {
      await post({ code });
      setEmail(current || "");
      setPhone(localDigits(currentPhone));
      setStep("edit");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  /* Only what actually moved is sent. Submitting an unchanged email would
     still cut off every device, which is not what an admin fixing a typo in a
     phone number is asking for. */
  const emailMoved = email.trim().toLowerCase() !== String(current || "").trim().toLowerCase();
  const phoneMoved = phone.replace(/\D/g, "") !== localDigits(currentPhone);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await post({
        code,
        userId: imp.userId,
        ...(emailMoved ? { email } : {}),
        ...(phoneMoved ? { phone, cc: "+218" } : {}),
      });
      const bits: string[] = [];
      if (r.email) { onChanged?.(r.email); bits.push(r.email); }
      if (r.phone) { onPhoneChanged?.(r.phone); bits.push(r.phone); }
      setDone(bits.join(" · "));
      reset();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="aee" data-no-i18n>
      {step === "idle" && (
        <button type="button" className="aee-open" onClick={() => setStep("code")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{t("Change sign-in details", "تغيير بيانات الدخول")}</span>
        </button>
      )}

      {step === "code" && (
        <div className="aee-panel">
          <div className="aee-hint">{t("Enter the admin code to unlock.", "أدخل رمز الإدارة لفتح الحقول.")}</div>
          <div className="aee-row">
            <input
              type="password"
              className="aee-inp"
              value={code}
              autoComplete="off"
              placeholder={t("Admin code", "رمز الإدارة")}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && code && !busy) void unlock(); }}
            />
            <button type="button" className="aee-btn" disabled={!code || busy} onClick={() => void unlock()}>
              {busy ? t("Checking…", "جارٍ التحقق…") : t("Unlock", "فتح")}
            </button>
          </div>
          <button type="button" className="aee-cancel" onClick={reset}>{t("Cancel", "إلغاء")}</button>
          {!!err && <div className="aee-err">{err}</div>}
        </div>
      )}

      {step === "edit" && (
        <div className="aee-panel">
          <label className="aee-lbl">{t("Sign-in email", "بريد تسجيل الدخول")}</label>
          <input
            type="email"
            className="aee-inp"
            dir="ltr"
            value={email}
            autoComplete="off"
            placeholder="name@gmail.com"
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="aee-lbl">{t("Phone number", "رقم الهاتف")}</label>
          <div className="aee-row">
            <CountryCodePicker className="aee-cc" width={78} />
            <input
              type="tel"
              inputMode="numeric"
              className="aee-inp"
              dir="ltr"
              value={phone}
              autoComplete="off"
              placeholder="091xxxxxxx"
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>

          {/* The third thing somebody can ask to have changed, so it belongs
              here with the other two. Libya is the only country the platform
              runs in, so today this confirms rather than switches — but the
              request dialog offers it, and a box that cannot answer one of the
              three things it is asked is a box with a hole in it. */}
          <label className="aee-lbl">{t("Country", "الدولة")}</label>
          <CountryPicker className="aee-cc aee-country" />

          {/* Said plainly, because it is the part that surprises people. */}
          {emailMoved && (
            <div className="aee-warn">
              {t(
                "Changing the email signs every device out and unlinks the old Google account, so it can no longer open this account. They sign in with the new one from here on — make sure they can open it.",
                "تغيير البريد يسجّل الخروج من كل الأجهزة ويفصل حساب جوجل القديم، فما عادش يقدر يفتح الحساب. حيدخل بالجديد من الآن — تأكد إنه يقدر يفتحه.",
              )}
            </div>
          )}

          <div className="aee-row">
            <button
              type="button"
              className="aee-btn"
              disabled={busy || (!emailMoved && !phoneMoved)}
              onClick={() => void save()}
            >
              {busy ? t("Saving…", "جارٍ الحفظ…") : t("Save changes", "حفظ التغييرات")}
            </button>
          </div>
          <button type="button" className="aee-cancel" onClick={reset}>{t("Cancel", "إلغاء")}</button>
          {!!err && <div className="aee-err">{err}</div>}
        </div>
      )}

      {!!done && step === "idle" && (
        <div className="aee-ok">{t("Updated: ", "تم التحديث: ")}<b dir="ltr">{done}</b></div>
      )}
    </div>
  );
}
