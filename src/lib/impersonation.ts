/** An admin viewing somebody else's dashboard for support.
 *
 *  Set by "Go to Account" on the admin's Users page and read back by the
 *  dashboard shell — and by the few places inside those dashboards that need
 *  to know they are being looked at by an admin rather than by their owner. */
export type Impersonation = {
  userId: string;
  role: "marketer" | "business";
  name: string;
  productId?: string;
};

export const IMPERSONATION_KEY = "lateen_impersonate";

/** The account being viewed, or null when this is somebody's own dashboard. */
export function readImpersonation(): Impersonation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.userId === "string" && (v.role === "marketer" || v.role === "business")) return v;
    return null;
  } catch {
    return null;
  }
}
