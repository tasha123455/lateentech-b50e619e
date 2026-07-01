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

type OtpMode = "signup" | "email";

export function RegisterForm({ role }: { role: Role }) {
  const s = styles(role);
  const nav = useNavigate();
  const { refreshRole } = useAuth();
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("LY");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // OTP step state
  const [otpStep, setOtpStep] = useState(false);
  const [otpMode, setOtpMode] = useState<OtpMode>("signup");
  const [otp, setOtp] = useState("");

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
    setBusy(true); setError(null); setInfo(null);
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

    const alreadyRegistered = signUpErr && /already|registered|exists/i.test(signUpErr.message);
    if (alreadyRegistered) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr || !signInData.session?.user) {
        setBusy(false);
        setError("An account already exists with this email. Enter the correct password to add a " + role + " account to it.");
        return;
      }
      const uid = signInData.session.user.id;
      const { data: rolesRows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const roles = (rolesRows ?? []).map((r) => r.role as string);
      if (roles.includes(role)) {
        setBusy(false);
        setError(`You already have a ${role} account. Please sign in instead.`);
        return;
      }
      // Send an OTP email to verify before adding the role
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      await supabase.auth.signOut();
      setBusy(false);
      if (otpErr) { setError(otpErr.message); return; }
      setOtpMode("email");
      setOtpStep(true);
      setInfo(`We sent a 6-digit code to ${email}. Enter it below to activate your ${role} account.`);
      return;
    }

    if (signUpErr) { setError(signUpErr.message); setBusy(false); return; }

    try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
    setBusy(false);
    if (signUpData.session) {
      await refreshRole();
      nav({ to: "/dashboard" });
    } else {
      setOtpMode("signup");
      setOtpStep(true);
      setInfo(`We sent a 6-digit code to ${email}. Enter it below to verify your account.`);
    }
  };

  const verifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error: verErr } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: otpMode,
    });
    if (verErr || !data.session) {
      setBusy(false);
      setError(verErr?.message ?? "Invalid or expired code");
      return;
    }
    try {
      if (otpMode === "email") {
        // Adding a new role to an existing account
        await addRoleAndGo();
      } else {
        try { localStorage.setItem("active_role", role); } catch { /* ignore */ }
        await refreshRole();
        nav({ to: "/dashboard" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    setError(null); setInfo(null); setBusy(true);
    const { error: rErr } = otpMode === "signup"
      ? await supabase.auth.resend({ type: "signup", email })
      : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    setInfo(`A new code was sent to ${email}.`);
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

  if (otpStep) {
    return (
      <form onSubmit={verifyOtp} className="space-y-4">
        <div>
          <h1 className="text-xl font-medium text-text-1">Verify your email</h1>
          <p className="mt-1 text-sm text-text-2">Enter the 6-digit code we sent to {email}.</p>
        </div>
        <Field label="Verification code">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="auth-input tracking-[0.5em] text-center text-lg"
          />
        </Field>
        {info && <p className="text-xs text-text-2">{info}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button type="submit" disabled={busy || otp.length !== 6} className={`h-11 w-full rounded-xl text-sm font-medium transition disabled:opacity-60 ${s.btn}`}>
          {busy ? "Verifying…" : "Verify & continue"}
        </button>
        <div className="flex items-center justify-between text-xs text-text-2">
          <button type="button" onClick={resendOtp} disabled={busy} className={`font-medium ${s.link}`}>
            Resend code
          </button>
          <button type="button" onClick={() => { setOtpStep(false); setOtp(""); setError(null); setInfo(null); }} className="underline">
            Use a different email
          </button>
        </div>
      </form>
    );
  }

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
