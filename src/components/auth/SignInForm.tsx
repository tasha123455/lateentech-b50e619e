import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { GoogleButton } from "./GoogleButton";
import { useAuth } from "@/auth/AuthContext";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { btn: "bg-marketer text-white hover:opacity-90", link: "text-marketer-foreground" }
    : { btn: "bg-business text-[#0d2a20] hover:opacity-90", link: "text-business" };

export function SignInForm({ role }: { role: Role }) {
  const s = styles(role);
  const nav = useNavigate();
  const { loadRoleForUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const otherRole: Role = role === "marketer" ? "business" : "marketer";
  const _otherPath = role === "marketer" ? "/business/signin" : "/marketer/signin";
  const _registerPath = role === "marketer" ? "/marketer/register" : "/business/register";
  void _otherPath; void _registerPath;


  const verifyRole = async (userId: string) => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) throw error;
    const roles = (data ?? []).map((r) => r.role as string);
    if (roles.includes("admin")) return "admin" as const;
    if (roles.includes(role)) return role;
    if (roles.includes(otherRole)) {
      // Same account can also work as the other role — add it on the fly.
      const { error: addErr } = await supabase.rpc("add_self_role", { _role: role });
      if (addErr) {
        await supabase.auth.signOut();
        throw new Error(addErr.message);
      }
      return role;
    }
    await supabase.auth.signOut();
    throw new Error(`No account found for this user. Please register first.`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setBusy(false); return; }
    const session = data.session ?? (await supabase.auth.getSession()).data.session;
    if (!session?.user) { setError("Sign in did not complete. Please try again."); setBusy(false); return; }
    try {
      const picked = await verifyRole(session.user.id);
      try { localStorage.setItem("active_role", picked === "admin" ? role : picked); } catch { /* ignore */ }
      await loadRoleForUser(session.user.id);
      nav({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  };

  const signInGoogle = async () => {
    setError(null);
    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    try { sessionStorage.setItem("intended_role", role); } catch { /* ignore */ }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.redirected) return;
    if (result.error) { setError(result.error.message); return; }
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.user) {
      try {
        await verifyRole(session.user.id);
        await loadRoleForUser(session.user.id);
        nav({ to: "/dashboard" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      }
    }
  };


  const subtitle = role === "marketer" ? "Sign in to your marketer account" : "Sign in to your business account";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-text-1">Welcome back</h1>
        <p className="mt-1 text-sm text-text-2">{subtitle}</p>
      </div>
      <Field label="Email">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth-input" />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input pe-16" />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-text-2">{showPw ? "Hide" : "Show"}</button>
        </div>
      </Field>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className={`h-11 w-full rounded-xl text-sm font-medium transition disabled:opacity-60 ${s.btn}`}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <Divider />
      <GoogleButton onClick={signInGoogle}>Continue with Google</GoogleButton>
      <p className="text-center text-xs text-text-2">
        No account?{" "}
        <Link to={role === "marketer" ? "/marketer/register" : "/business/register"} className={`font-medium ${s.link}`}>
          Create one
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
      <span className="text-[10px] uppercase tracking-wider text-text-3">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
