import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { GoogleButton } from "./GoogleButton";
import { useAuth } from "@/auth/AuthContext";

type Role = "marketer" | "business";

const styles = (role: Role) =>
  role === "marketer"
    ? { link: "text-marketer-foreground" }
    : { link: "text-business" };

export function SignInForm({ role }: { role: Role }) {
  const s = styles(role);
  const nav = useNavigate();
  const { loadRoleForUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const otherRole: Role = role === "marketer" ? "business" : "marketer";

  const verifyRole = async (userId: string) => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) throw error;
    const roles = (data ?? []).map((r) => r.role as string);
    if (roles.includes("admin")) return "admin" as const;
    if (roles.includes(role)) return role;
    if (roles.includes(otherRole)) {
      await supabase.auth.signOut();
      throw new Error(`This account is registered as a ${otherRole}. Please use the ${otherRole} sign-in page, or create a separate ${role} account.`);
    }
    await supabase.auth.signOut();
    throw new Error(`No ${role} account found for this user. Please register first.`);
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
        const picked = await verifyRole(session.user.id);
        try { localStorage.setItem("active_role", picked === "admin" ? role : picked); } catch { /* ignore */ }
        await loadRoleForUser(session.user.id);
        nav({ to: "/dashboard" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      }
    }
  };

  const subtitle = role === "marketer" ? "Sign in to your marketer account" : "Sign in to your business account";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-text-2">{subtitle}</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <GoogleButton onClick={signInGoogle}>Sign in with Google</GoogleButton>
      <p className="text-center text-xs text-text-2">
        No account?{" "}
        <Link to={role === "marketer" ? "/marketer/register" : "/business/register"} className={`font-medium ${s.link}`}>
          Create one
        </Link>
      </p>
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-text-2">
        {label}{required && <span className="ms-1 text-destructive">*</span>}
      </span>
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
