import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "./GoogleButton";
import { Field, Divider } from "./SignInForm";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n/LanguageContext";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { btn: "bg-marketer text-white hover:opacity-90", link: "text-marketer-foreground" }
    : { btn: "bg-business text-[#0d2a20] hover:opacity-90", link: "text-business" };

export function RegisterForm({ role }: { role: Role }) {
  const s = styles(role);
  const t = useT();
  const nav = useNavigate();
  const { refreshRole } = useAuth();
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          role,
          full_name: fullName,
          phone,
          ...(role === "business" ? { business_name: businessName } : {}),
        },
      },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await refreshRole();
    nav({ to: "/dashboard" });
  };

  const subtitle = role === "marketer"
    ? t("Free to join — earn on every sale you drive")
    : t("List your products and let marketers grow your sales");

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-text-1">{t("Create account")}</h1>
        <p className="mt-1 text-sm text-text-2">{subtitle}</p>
      </div>
      <Field label={t("Full name")}>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Morgan" className="auth-input" />
      </Field>
      {role === "business" && (
        <Field label={t("Business name")}>
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Sunrise Kicks Ltd." className="auth-input" />
        </Field>
      )}
      <Field label={t("Email")}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth-input" />
      </Field>
      <Field label={t("Password")}>
        <div className="relative">
          <input type={showPw ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input pr-16" />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-2">{showPw ? t("Hide") : t("Show")}</button>
        </div>
      </Field>
      <Field label={t("Phone number")}>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 000000" className="auth-input" />
      </Field>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className={`h-11 w-full rounded-xl text-sm font-medium transition disabled:opacity-60 ${s.btn}`}>
        {busy ? t("Creating…") : t("Create account")}
      </button>
      <Divider />
      <GoogleButton>{t("Continue with Google")}</GoogleButton>
      <p className="text-center text-xs text-text-2">
        {t("Already have an account?")}{" "}
        <Link to={role === "marketer" ? "/marketer/signin" : "/business/signin"} className={`font-medium ${s.link}`}>
          {t("Sign in")}
        </Link>
      </p>
    </form>
  );
}
