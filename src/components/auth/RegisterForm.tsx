import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { GoogleButton } from "./GoogleButton";
import { Field, Divider } from "./SignInForm";
import { useAuth } from "@/auth/AuthContext";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { btn: "bg-marketer text-white hover:opacity-90", link: "text-marketer-foreground" }
    : { btn: "bg-business text-[#0d2a20] hover:opacity-90", link: "text-business" };

export function RegisterForm({ role }: { role: Role }) {
  const s = styles(role);
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

  const addRoleAndGo = async () => {
    const { error: rpcErr } = await supabase.rpc("add_self_role", {
      _role: role,
      _business_name: role === "business" ? businessName : undefined,
    });
    if (rpcErr) throw rpcErr;
    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    await refreshRole();
    nav({ to: "/dashboard" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
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

    // If user already exists, try signing in and add this role to the same account.
    const alreadyRegistered = signUpErr && /already|registered|exists/i.test(signUpErr.message);
    if (alreadyRegistered) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr || !signInData.session?.user) {
        setBusy(false);
        setError("An account already exists with this email. Enter the correct password to add a " + role + " account to it.");
        return;
      }
      // Check existing roles
      const uid = signInData.session.user.id;
      const { data: rolesRows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const roles = (rolesRows ?? []).map((r) => r.role as string);
      if (roles.includes(role)) {
        setBusy(false);
        setError(`You already have a ${role} account. Please sign in instead.`);
        return;
      }
      try {
        const { error: rpcErr } = await supabase.rpc("add_self_role", {
          _role: role,
          _business_name: role === "business" ? businessName : undefined,
        });
        if (rpcErr) throw rpcErr;
        try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
        // Send a confirmation email for the newly added role, then sign out
        // so the user must confirm via email before accessing it.
        await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        await supabase.auth.signOut();
        setBusy(false);
        setError(`We've sent a confirmation email to ${email}. Please confirm it to activate your ${role} account.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add role");
        setBusy(false);
      }
      return;
    }

    if (signUpErr) { setError(signUpErr.message); setBusy(false); return; }

    // New signup — handle_new_user trigger created the chosen role already.
    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    setBusy(false);
    if (signUpData.session) {
      await refreshRole();
      nav({ to: "/dashboard" });
    } else {
      setError(`Check your email (${email}) to confirm your account, then sign in.`);
    }
  };

  const signUpGoogle = async () => {
    setError(null);
    try { sessionStorage.setItem("intended_role", role); } catch { /* ignore */ }
    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (result.redirected) return;
    if (result.error) { setError(result.error.message); return; }
    const session = (await supabase.auth.getSession()).data.session;
    if (session?.user) {
      try { await addRoleAndGo(); }
      catch (err) { setError(err instanceof Error ? err.message : "Sign up failed"); }
    }
  };


  const subtitle = role === "marketer"
    ? "Free to join — earn on every sale you drive"
    : "List your products and let marketers grow your sales";


  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-medium text-text-1">Create account</h1>
        <p className="mt-1 text-sm text-text-2">{subtitle}</p>
      </div>
      <Field label="Full name">
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Morgan" className="auth-input" />
      </Field>
      {role === "business" && (
        <Field label="Business name">
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Sunrise Kicks Ltd." className="auth-input" />
        </Field>
      )}
      <Field label="Email">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth-input" />
      </Field>
      <Field label="Password">
        <div className="relative">
          <input type={showPw ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="auth-input pe-16" />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-text-2">{showPw ? "Hide" : "Show"}</button>
        </div>
      </Field>
      <Field label="Phone number">
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 000000" className="auth-input" />
      </Field>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className={`h-11 w-full rounded-xl text-sm font-medium transition disabled:opacity-60 ${s.btn}`}>
        {busy ? "Creating…" : "Create account"}
      </button>
      <Divider />
      <GoogleButton onClick={signUpGoogle}>Continue with Google</GoogleButton>
      <p className="text-center text-xs text-text-2">
        Already have an account?{" "}
        <Link to={role === "marketer" ? "/marketer/signin" : "/business/signin"} className={`font-medium ${s.link}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
