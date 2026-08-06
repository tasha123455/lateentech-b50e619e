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

/** Whether this page is the far side of a sign-in that is still finishing.
 *
 *  Google sends people back to the site's root, which is the front page — so
 *  everybody who signs in arrives, for a second or two, at the screen that asks
 *  who they are. They have just answered that. Showing it to them again while
 *  the session is worked out is the flicker between tapping "Sign in with
 *  Google" and arriving at a dashboard.
 *
 *  Three things say a sign-in is in flight, and any of them is enough:
 *  the handoff Google puts in the address, and the two notes the sign-in and
 *  registration forms leave behind before handing over. Both notes are cleared
 *  once the account has been settled, so neither outlives the trip.
 *  `intended_role` is deliberately not among them: nothing ever clears it, so
 *  it would report a sign-in in progress for the rest of the visit.
 *
 *  Always false on the server. */
export function isFinishingSignIn(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const { search, hash } = window.location;
    if (/[?&]code=/.test(search) || /access_token=|error_description=/.test(hash)) return true;
    return !!(sessionStorage.getItem("signin_intent") || sessionStorage.getItem("pending_signup"));
  } catch {
    return false;
  }
}
