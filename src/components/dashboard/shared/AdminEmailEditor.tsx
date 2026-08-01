import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { readImpersonation } from "@/lib/impersonation";

/* The one place a sign-in email can be changed.
 *
 * It deliberately has no home of its own in the admin panel. An admin opens
 * the person's account the same way they would to look at anything else, goes
 * to their profile, and the box is there — so the change happens while looking
 * at the account it belongs to, not from a list of names.
 *
 * It stays shut until an admin types the unlock code. The browser never learns
 * the code and never learns whether the environment has one set: it posts what
 * was typed and the server answers yes or no. Everything else — is there a
 * session, is it an admin's — is checked there too, so nothing here is load
 * bearing for security. This component only decides what to draw. */

type Step = "idle" | "code" | "edit";

async function post(body: { code: string; userId?: string; email?: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  const res = await fetch("/api/admin/account-email", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  let payload: { ok?: boolean; message?: string; error?: string; email?: string } = {};
  try {
    payload = await res.json();
  } catch {
    /* a proxy or a crash can answer with something that is not JSON */
  }
  if (!res.ok || !payload.ok) throw new Error(payload.message || "That did not work. Try again.");
  return payload;
}

export function AdminEmailEditor({ current, onChanged }: { current?: string | null; onChanged?: (email: string) => void }) {
  const imp = readImpersonation();
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  // Somebody looking at their own dashboard never sees any of this.
  if (!imp) return null;

  const ar = typeof document !== "undefined" && document.documentElement.lang === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const reset = () => {
    setStep("idle"); setCode(""); setEmail(""); setErr(""); setBusy(false);
  };

  const unlock = async () => {
    setBusy(true); setErr("");
    try {
      await post({ code });
      setEmail(current || "");
      setStep("edit");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await post({ code, userId: imp.userId, email });
      setDone(r.email || email);
      onChanged?.(r.email || email);
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
          <span>{t("Change sign-in email", "تغيير بريد تسجيل الدخول")}</span>
        </button>
      )}

      {step === "code" && (
        <div className="aee-panel">
          <div className="aee-hint">{t("Enter the admin code to unlock.", "أدخل رمز الإدارة لفتح الحقل.")}</div>
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
          {/* Said plainly, because it is the part that surprises people: the
              address is what Google matches on when they sign in, so it has to
              be an account they can actually open. */}
          <div className="aee-hint">
            {t(
              "They will sign in with this Google account from now on. Make sure they can open it.",
              "حيسجّل دخوله بحساب جوجل هذا من الآن. تأكد إنه يقدر يفتحه.",
            )}
          </div>
          <div className="aee-row">
            <input
              type="email"
              className="aee-inp"
              dir="ltr"
              value={email}
              autoComplete="off"
              placeholder="name@gmail.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email && !busy) void save(); }}
            />
            <button type="button" className="aee-btn" disabled={!email || busy} onClick={() => void save()}>
              {busy ? t("Saving…", "جارٍ الحفظ…") : t("Save", "حفظ")}
            </button>
          </div>
          <button type="button" className="aee-cancel" onClick={reset}>{t("Cancel", "إلغاء")}</button>
          {!!err && <div className="aee-err">{err}</div>}
        </div>
      )}

      {!!done && step === "idle" && (
        <div className="aee-ok">{t("Sign-in email is now ", "بريد الدخول صار ")}<b dir="ltr">{done}</b></div>
      )}
    </div>
  );
}
