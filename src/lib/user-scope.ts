// Per-user isolation for browser-stored app state.
//
// Several dashboard features cache user data in localStorage/sessionStorage
// (payout draft, avatar, form drafts, page + scroll position). Those keys were
// not scoped to an account, so a second account signing in on the same device
// could see the previous account's data. We now wipe every app-owned key
// whenever the signed-in user changes.

const LAST_UID_KEY = "wasla_last_uid";

// Keys owned by the app that hold user-specific data.
const USER_DATA_PREFIXES = ["lateen_", "wasla_user_"];

// Device-level preferences that must survive account switches / sign-out.
const KEEP_KEYS = new Set(["lateen_lang"]);

function purgeUserData() {
  const wipe = (store: Storage) => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && !KEEP_KEYS.has(k) && USER_DATA_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    } catch {
      /* ignore */
    }
  };
  if (typeof window === "undefined") return;
  wipe(window.localStorage);
  wipe(window.sessionStorage);
}

/** Call whenever a session is applied. Clears cached state left by another account. */
export function enforceUserScope(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    const prev = localStorage.getItem(LAST_UID_KEY);
    if (prev && prev !== (userId ?? "")) purgeUserData();
    if (userId) localStorage.setItem(LAST_UID_KEY, userId);
    else localStorage.removeItem(LAST_UID_KEY);
  } catch {
    /* ignore */
  }
}

/** Call on sign-out so nothing personal survives for the next account. */
export function clearUserScopedState() {
  purgeUserData();
  try {
    localStorage.removeItem(LAST_UID_KEY);
  } catch {
    /* ignore */
  }
}
