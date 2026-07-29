// Optimistic boot cache.
//
// A phone that discards the tab (locked screen, app switch, low memory) makes
// the browser do a FULL cold reload when the user comes back. Waiting for
// Supabase's async getSession() before rendering anything is what produces the
// "Loading…" screen and the landing-page flash on every return.
//
// Supabase already persists the whole session in localStorage, so we can read
// it synchronously during the very first render and show the signed-in UI
// immediately. The async check still runs right after and corrects anything
// stale.

import type { Session } from "@supabase/supabase-js";

export type Role = "marketer" | "business" | "admin";

const ROLE_KEY = "wasla_boot_role";
const PATH_KEY = "wasla_last_path";

function decode(raw: string): unknown {
  let text = raw;
  if (text.startsWith("base64-")) {
    try { text = atob(text.slice(7)); } catch { return null; }
  }
  try { return JSON.parse(text); } catch { return null; }
}

/** The session Supabase last persisted, read synchronously. */
export function readCachedSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = decode(raw);
      const value = Array.isArray(parsed) ? parsed[0] : parsed;
      const session = value as Session | null;
      if (session && typeof session === "object" && session.user) return session;
    }
  } catch { /* ignore */ }
  return null;
}

export function readCachedRole(): Role | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === "marketer" || v === "business" || v === "admin" ? v : null;
  } catch { return null; }
}

export function writeCachedRole(role: Role | null): void {
  try {
    if (role) localStorage.setItem(ROLE_KEY, role);
    else localStorage.removeItem(ROLE_KEY);
  } catch { /* ignore */ }
}

/** True when we can safely paint signed-in UI before the async check lands. */
export function hasBootSession(): boolean {
  return !!readCachedSession();
}

/** Last in-app page the user was on (language-prefixed pathname + search). */
export function readLastPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(PATH_KEY);
    return v && v.startsWith("/") ? v : null;
  } catch { return null; }
}

export function writeLastPath(path: string): void {
  try { localStorage.setItem(PATH_KEY, path); } catch { /* ignore */ }
}
