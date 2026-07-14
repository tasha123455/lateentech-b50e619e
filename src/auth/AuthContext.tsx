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

    const applySession = async (nextSession: Session | null, opts?: { silent?: boolean }) => {
      if (!active) return;
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);
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

            // Existing-account guard: if this Google account already has a
            // role (it registered before), don't silently sign it in with
            // the new form's name/phone — send it to sign in instead. If the
            // existing role is DIFFERENT from the one being registered (e.g.
            // a marketer account trying to register as a business), show the
            // specific cross-role message instead of the generic one, and
            // send them back to the register page rather than a sign-in page
            // for a role that isn't theirs.
            const { data: existingRolesRow } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", nextSession.user.id);
            const existingRoles = (existingRolesRow ?? []).map((r) => r.role as string);
            const alreadyHasAccount = existingRoles.length > 0;
            if (alreadyHasAccount) {
              const hasThisRole = existingRoles.includes(p.role) || existingRoles.includes("admin");
              try { localStorage.removeItem("active_role"); } catch { /* ignore */ }
              await supabase.auth.signOut();
              if (!hasThisRole) {
                const actualRole = existingRoles.includes("business") ? "business" : "marketer";
                sessionStorage.setItem(
                  "signin_error",
                  `This account is registered as a ${actualRole}. Please use the ${actualRole} sign-in page, or create a separate ${p.role} account.`,
                );
                if (typeof window !== "undefined") {
                  window.location.replace(p.role === "business" ? "/business/register" : "/marketer/register");
                }
                return;
              }
              sessionStorage.setItem(
                "signin_error",
                "An account with this email already exists. Please sign in instead.",
              );
              if (typeof window !== "undefined") {
                const target = p.role === "business" ? "/business/signin" : "/marketer/signin";
                window.location.replace(target);
              }
              return;
            }

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
        // Sign-in flow guard: if the user came from a sign-in page AND has
        // no roles yet (never completed sign-up), delete the account and
        // bounce back. Uses role presence rather than account age so an
        // existing user can sign in immediately after signing up.
        try {
          const intent = sessionStorage.getItem("signin_intent");
          const pending = sessionStorage.getItem("pending_signup");
          if (intent && !pending) {
            const { data: rolesRow } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", nextSession.user.id);
            const roles = (rolesRow ?? []).map((r) => r.role as string);
            const hasAnyRole = roles.length > 0;
            if (!hasAnyRole) {
              sessionStorage.removeItem("signin_intent");
              sessionStorage.setItem(
                "signin_error",
                "No existing account for this Google email. Please sign up first.",
              );
              try { await supabase.rpc("delete_self_if_just_created"); } catch (e) { console.warn("[auth] delete_self failed", e); }
              await supabase.auth.signOut();
              if (typeof window !== "undefined") {
                const target = intent === "business" ? "/business/register" : "/marketer/register";
                window.location.replace(target);
              }
              return;
            }
            // Role-match guard: if this account exists but doesn't have the
            // role picked on the sign-in page (e.g. a marketer account
            // trying to sign in on the business page), don't fall back to
            // whatever role it does have — warn instead.
            if (!roles.includes("admin") && !roles.includes(intent)) {
              sessionStorage.removeItem("signin_intent");
              const actualRole = roles.includes("business") ? "business" : "marketer";
              sessionStorage.setItem(
                "signin_error",
                `This account is registered as a ${actualRole}. Please use the ${actualRole} sign-in page, or create a separate ${intent} account.`,
              );
              try { localStorage.removeItem("active_role"); } catch { /* ignore */ }
              await supabase.auth.signOut();
              if (typeof window !== "undefined") {
                const target = intent === "business" ? "/business/signin" : "/marketer/signin";
                window.location.replace(target);
              }
              return;
            }
            sessionStorage.removeItem("signin_intent");
          }
        } catch { /* ignore */ }
        const picked = await loadRole(nextSession.user.id);
        if (picked && picked !== "admin") {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("banned_at")
              .eq("id", nextSession.user.id)
              .maybeSingle();
            if (prof?.banned_at) {
              setRole(null);
              try { localStorage.removeItem("active_role"); } catch { /* ignore */ }
              await supabase.auth.signOut();
              if (typeof window !== "undefined") window.location.replace("/");
              return;
            }
          } catch { /* ignore */ }
        }

      } catch (error) {
        console.error("[auth] failed to load role", error);
        if (active) setRole(null);
      } finally {
        if (active) setLoading(false);
      }

    };

    // Only surface the "Loading…" screen for genuine identity transitions
    // and the initial getSession(). Background refreshes (TOKEN_REFRESHED,
    // INITIAL_SESSION firing on tab return) must NOT flip loading back to
    // true — that was the "loading screen on return" bug.
    const IDENTITY_EVENTS = new Set(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"]);
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      const silent = !IDENTITY_EVENTS.has(event);
      setTimeout(() => { void applySession(s, { silent }); }, 0);
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
