## Goal

Returning to the tab on mobile should be a no-op: no refetch, no loading flash, no page jump, no lost typing.

## What I found

- `src/router.tsx` creates the QueryClient with only `staleTime`/`gcTime` — `refetchOnWindowFocus` is left at its default (`true`), so every tab return can refetch and flip components into loading states.
- All three dashboard scripts (`marketer.script.js` ~1044-1045, `business.script.js` ~1198-1199, `admin.script.js` ~2081-2082) run the draft `restore()` on `pageshow` **and** on `visibilitychange` → `visible`. On tab return this re-writes input values (firing synthetic `input` events) and, combined with the page/scroll restore block, is the most likely cause of "new order page redirects away" and jitter.
- `src/auth/AuthContext.tsx` (~line 254) already silences non-identity auth events, but `SIGNED_IN` is in `IDENTITY_EVENTS`. Supabase's GoTrue client re-emits `SIGNED_IN` on visibility recovery, so a tab return can still flip `loading` to true → the Dashboard renders the "Loading…" screen and remounts `LateenShell`. This is a strong candidate for the full re-render, but I have not yet confirmed it live; I'll verify the emitted event sequence before/while changing it.

## Changes

1. **Disable focus refetching globally** — in `src/router.tsx`, add `refetchOnWindowFocus: false` (plus `refetchOnReconnect: false`) to the QueryClient default query options.

2. **Make restore idempotent instead of focus-driven** — in all three dashboard scripts:
   - Remove the `visibilitychange → visible` restore listener; keep `pageshow` restore but only when the page was actually restored from bfcache/fresh load (`event.persisted` or first run), so a simple tab switch never re-applies drafts.
   - Keep the existing save-on-input and the `pagehide`/`hidden` scroll flush untouched (nothing is lost — state is already in localStorage and is restored on real reloads).
   - Guard restore so it never touches a field the user is currently focused in, and never re-navigates via `goTo` after initial mount (the page-restore call stays a once-per-load action).

3. **Keep identity transitions from firing on tab return** — in `AuthContext`, treat `SIGNED_IN` as silent when the session's user id is unchanged from the current one, so only a genuine user change shows the loading screen. `SIGNED_OUT`/`USER_UPDATED` keep current behaviour.

4. **Search bar persistence** — the generic draft layer already saves every non-excluded `input` by id, including the dashboard search bars, so search text survives a real reload. After the changes above I'll verify search text is preserved on tab switch and reload in marketer, business and admin dashboards.

## Verification

Drive the running app headlessly: type into the new-order form and a search bar, background the tab, return, and confirm the values, current page, and scroll position are unchanged with no loading screen in between.

## Out of scope

No changes to the order/payout draft systems, no data-model or backend changes, no UI redesign.
