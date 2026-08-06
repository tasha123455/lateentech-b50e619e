/** Whether this browser is holding a signed-in session, answered immediately.
 *
 *  Asking Supabase costs a round trip, and a screen that waits for the answer
 *  before drawing anything shows a loading state to everybody — including the
 *  signed-out visitor who was never going to need it. supabase-js keeps the
 *  session in localStorage under a key named after the project, so the question
 *  "might somebody be signed in here?" can be answered before the first paint.
 *
 *  This is a hint and nothing more. It says a token was left here, not that it
 *  is still valid, and it must never stand in for the real check — it decides
 *  which of two screens to draw first, never who anybody is.
 *
 *  Always false on the server, which has no localStorage and no visitor. */
export function hasStoredSession(): boolean {
  try {
    if (typeof window === "undefined") return false;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = window.localStorage.getItem(key);
        if (raw && raw !== "null" && raw.length > 2) return true;
      }
    }
  } catch { /* private mode, or storage turned off — treat as signed out */ }
  return false;
}
