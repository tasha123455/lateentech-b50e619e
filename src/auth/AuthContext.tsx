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
    const picked: Role | null = roles.includes("admin")
      ? "admin"
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
      signOut,
      refreshRole,
    }),
    [session, role, loading, signOut, refreshRole],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
