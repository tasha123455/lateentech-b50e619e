import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "marketer" | "business" | "admin";

type AuthState = {
  user: User | null;
  session: Session | null;
  role: Role | null;
  loading: boolean;
  loadRoleForUser: (userId: string) => Promise<Role | null>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw error;
    const roles = (data ?? []).map((r) => r.role as Role);
    let preferred: Role | null = null;
    try {
      const stored = localStorage.getItem("active_role") as Role | null;
      if (stored && roles.includes(stored)) preferred = stored;
    } catch { /* ignore */ }
    const picked: Role | null = roles.includes("admin")
      ? "admin"
      : preferred
        ? preferred
        : roles.includes("business")
          ? "business"
          : roles.includes("marketer")
            ? "marketer"
            : null;
    setRole(picked);
    return picked;
  }, []);


  useEffect(() => {
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      setLoading(true);
      setSession(nextSession);
      if (!nextSession?.user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // Consume any pending post-OAuth signup payload (Google sign-up flow).
        try {
          const raw = sessionStorage.getItem("pending_signup");
          if (raw && nextSession.user) {
            const p = JSON.parse(raw) as {
              role: "marketer" | "business";
              full_name?: string;
              phone?: string;
              country?: string;
              business_name?: string;
            };
            sessionStorage.removeItem("pending_signup");
            await supabase.rpc("add_self_role", {
              _role: p.role,
              _business_name: p.role === "business" ? p.business_name : undefined,
            });
            const patch: { full_name?: string; phone?: string; country?: string; business_name?: string } = {};
            if (p.full_name) patch.full_name = p.full_name;
            if (p.phone) patch.phone = p.phone;
            if (p.country) patch.country = p.country;
            if (p.role === "business" && p.business_name) patch.business_name = p.business_name;
            if (Object.keys(patch).length) {
              await supabase.from("profiles").update(patch).eq("id", nextSession.user.id);
            }

            try { localStorage.setItem("active_role", p.role); } catch { /* ignore */ }
          }
        } catch (e) { console.warn("[auth] pending_signup apply failed", e); }
        await loadRole(nextSession.user.id);
      } catch (error) {
        console.error("[auth] failed to load role", error);
        if (active) setRole(null);
      } finally {
        if (active) setLoading(false);
      }

    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setTimeout(() => { void applySession(s); }, 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadRole]);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem("active_role"); } catch { /* ignore */ }
    await supabase.auth.signOut();
  }, []);


  const refreshRole = useCallback(async () => {
    if (session?.user) await loadRole(session.user.id);
  }, [session, loadRole]);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      role,
      loading,
      loadRoleForUser: loadRole,
      signOut,
      refreshRole,
    }),
    [session, role, loading, loadRole, signOut, refreshRole],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
