import { useMemo, useRef, useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "./GoogleButton";
import { Field } from "./SignInForm";
import { useAuth } from "@/auth/AuthContext";
import { useLanguage } from "@/i18n/LanguageContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { link: "text-marketer-foreground" }
    : { link: "text-business" };

const PHONE_RE = /^09[1-4]\d{7}$/;

function SoonBadge() {
  return (
    <span
      className="ms-2 inline-block rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
    >
      Soon
    </span>
  );
}

function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

function CountryPicker() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="auth-input flex w-full items-center justify-between text-start"
      >
        <span>🇱🇾 <span>Libya</span></span>
        <span className="text-text-3">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">🇱🇾 <span>Libya</span></div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More countries</span>
            <SoonBadge />
          </div>
        </div>
      )}
    </div>
  );
}

function CountryCodePicker() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="auth-input flex h-11 items-center gap-1 px-2 text-sm"
        style={{ width: 82 }}
      >
        <span>{"\u2068+218\u2069"}</span>
        <span className="text-text-3">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="cursor-default px-3 py-2 text-sm text-text-1 hover:bg-surface-2">{"\u2068+218\u2069"} — <span>Libya</span></div>
          <div className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-sm text-text-3 opacity-70">
            <span>More</span>
            <SoonBadge />
          </div>
        </div>
      )}
    </div>
  );
}

export function RegisterForm({ role }: { role: Role }) {
  const s = styles(role);
  const nav = useNavigate();
  const { refreshRole } = useAuth();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const importantNotesAr =
    role === "marketer"
      ? "تأكد إن جميع البيانات اللي تدخلها صحيحة قبل إنشاء الحساب. بياناتك الشخصية مرتبطة بمحفظتك و فلوسك وما تقدرش تعدلها بعد التسجيل. احتفظ ببيانات تسجيل الدخول في مكان آمن، لأنك حتحتاجها للدخول إلى حسابك."
      : "تأكد إن جميع البيانات اللي تدخلها صحيحة قبل إنشاء الحساب. بياناتك الشخصية مرتبطة بحسابك وما تقدرش تعدلها بعد التسجيل. احتفظ ببيانات تسجيل الدخول في مكان آمن، لأنك حتحتاجها للدخول إلى حسابك.";
  const importantNotesEn =
    role === "marketer"
      ? "Please make sure all the information you enter is accurate before creating your account. Your personal details are linked to your wallet and money and cannot be changed after registration. Keep your login information in a safe place, as you will need it to access your account."
      : "Please make sure all the information you enter is accurate before creating your account. Your personal details are linked to your account and cannot be changed after registration. Keep your login information in a safe place, as you will need it to access your account.";

  const otherRole: Role = role === "marketer" ? "business" : "marketer";
  const crossRoleMsg = () => {
    if (ar) {
      const other_ar_def = otherRole === "business" ? "تاجر" : "المسوّق";
      const other_ar_indef = otherRole === "business" ? "تاجر" : "مسوّق";
      const thisRole_ar = role === "business" ? "تاجر" : "مسوّق";
      return `هذا الحساب مسجل كحساب ${other_ar_indef}. يرجى استخدام صفحة تسجيل الدخول الخاص ب${other_ar_def}، أو إنشاء حساب ${thisRole_ar} منفصل.`;
    }
    return `This account is registered as a ${otherRole}. Please use the ${otherRole} sign-in page, or create a separate ${role} account.`;
  };
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const msg = sessionStorage.getItem("signin_error");
      if (msg) {
        setError(msg);
        sessionStorage.removeItem("signin_error");
      }
    } catch { /* ignore */ }
  }, []);

  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = useMemo(() => {
    if (!fullName.trim()) return false;
    if (role === "business" && !businessName.trim()) return false;
    if (!phoneValid) return false;
    return true;
  }, [fullName, businessName, phone, role, phoneValid]);

  const addRoleAndGo = async () => {
    const { error: rpcErr } = await supabase.rpc("add_self_role", {
      _role: role,
      _business_name: role === "business" ? businessName : undefined,
    });
    if (rpcErr) throw rpcErr;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const patch: { full_name?: string; phone?: string; country?: string; business_name?: string } = {
          full_name: fullName.trim(),
          phone: "+218" + phone,
          country: "LY",
        };
        if (role === "business") patch.business_name = businessName.trim();
        await supabase.from("profiles").update(patch).eq("id", uid);
      }
    } catch { /* ignore */ }
    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    await refreshRole();
    nav({ to: "/dashboard" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true); setError(null);
    try {
      // Stash profile so it can be persisted after OAuth redirect returns.
      sessionStorage.setItem("intended_role", role);
      sessionStorage.setItem(
        "pending_signup",
        JSON.stringify({
          role,
          full_name: fullName.trim(),
          phone: "+218" + phone,
          country: "LY",
          business_name: role === "business" ? businessName.trim() : undefined,
        }),
      );
      localStorage.setItem("active_role", role);
    } catch { /* ignore */ }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (!oauthError) return;
    setError(oauthError.message);
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-text-1">Create account</h1>
      </div>

      <Field label="Full name" required>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Kim Kardashian"
          className="auth-input"
        />
      </Field>

      {role === "business" && (
        <Field label="Business name" required>
          <input
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="auth-input"
          />
        </Field>
      )}

      <Field label="Phone number" required>
        <div className="flex gap-2">
          <CountryCodePicker />
          <input
            type="tel"
            required
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="091xxxxxxx"
            className="auth-input flex-1"
          />
        </div>
        {phone.length === 10 && !phoneValid && (
          <span className="mt-1 block text-[11px] text-destructive">
            Phone must be 10 digits and start with 091, 092, 093, or 094.
          </span>
        )}
      </Field>

      <Field label="Country" required>
        <CountryPicker />
      </Field>

      <Collapsible className="rounded-xl border border-border bg-surface-2">
        <CollapsibleTrigger
          type="button"
          className="flex w-full items-center justify-between px-3 py-2.5 text-start text-xs font-medium text-text-2"
        >
          <span>{ar ? "ملاحظات مهمة" : "Important notes"}</span>
          <span className="text-text-3">▾</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3 text-xs leading-relaxed text-text-3">
          {ar ? importantNotesAr : importantNotesEn}
        </CollapsibleContent>
      </Collapsible>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div
        className={!canSubmit || busy ? "pointer-events-none opacity-60" : ""}
        aria-disabled={!canSubmit || busy}
      >
        <GoogleButton onClick={() => submit(new Event("submit") as unknown as FormEvent)}>
          {busy ? "Creating…" : "Create account"}
        </GoogleButton>
      </div>


      <p className="text-center text-xs text-text-2">
        Have an account?{" "}
        <Link to={role === "marketer" ? "/marketer/signin" : "/business/signin"} className={`font-medium ${s.link}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
