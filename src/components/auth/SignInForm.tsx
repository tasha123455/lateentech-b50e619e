import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "./GoogleButton";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n/LanguageContext";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { btn: "bg-marketer text-white hover:opacity-90", link: "text-marketer-foreground" }
    : { btn: "bg-business text-[#0d2a20] hover:opacity-90", link: "text-business" };

export function SignInForm({ role }: { role: Role }) {
  const s = styles(role);
  const t = useT();
  const nav = useNavigate();
  const { refreshRole } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    await refreshRole();
    nav({ to: "/dashboard" });
  };

  const subtitle = role === "marketer" ? t("Sign in to your marketer account") : t("Sign in to your business account");

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-text-1">{t("Welcome back")}</h1>
        <p className="mt-1 text-sm text-text-2">{subtitle}</p>
      </div>
      <Field label={t("Email")}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("you@example.com")} className="auth-input" />
      </Field>
      <Field label={t("Password")}>
        <div className="relative">
          <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input pe-16" />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-text-2">{showPw ? t("Hide") : t("Show")}</button>
        </div>
      </Field>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className={`h-11 w-full rounded-xl text-sm font-medium transition disabled:opacity-60 ${s.btn}`}>
        {busy ? t("Signing in…") : t("Sign in")}
      </button>
      <Divider />
      <GoogleButton onClick={() => alert(t("Google sign-in is not available yet."))} />
      <p className="text-center text-xs text-text-2">
        {t("No account?")}{" "}
        <Link to={role === "marketer" ? "/marketer/register" : "/business/register"} className={`font-medium ${s.link}`}>
          {t("Create one")}
        </Link>
      </p>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-text-2">{label}</span>
      {children}
    </label>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-wider text-text-3">{useT()("or")}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
