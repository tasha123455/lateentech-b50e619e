## Goal

Lock the app to English + Arabic only, eliminate the bug where toggling languages wipes dashboard data (balance, name, analytics, products, orders), and ensure every visible string — including mock data arrays inside the embedded dashboards — translates cleanly while preserving the exact Lateen visual design.

## 1. Restrict languages to EN + AR

- `src/i18n/locales.ts` — reduce `LOCALES` to just `en` and `ar`. `RTL_CODES` automatically narrows.
- `src/i18n/translations.ts` — keep only the `ar` value on every entry; strip `es/fr/de/...` keys (smaller dictionary, no behavior change since lookup falls back to English anyway).
- `src/i18n/LanguagePicker.tsx` — replace the search-grid picker with a simple two-button EN / العربية toggle (still themed with existing tokens).
- `src/i18n/LanguageSwitcher.tsx` — keep the globe button, but on click toggle directly between `en` and `ar` instead of opening the modal (no picker needed for 2 locales). Modal path removed.
- `src/routes/language.tsx` — simplify to the same EN/AR toggle.

## 2. Kill the data-wipe bug on language toggle

The real cause is structural: every time `lang` changes, `LanguageProvider` re-renders its entire subtree. `AuthProvider` lives inside it, so a new `signOut` identity is produced, and the embedded dashboard scripts (`business/marketer/admin.script.js`) are torn down and re-injected with `document.body.appendChild(script)` — wiping their in-memory state (balance, name, analytics, product list, orders).

Fixes:

- **Provider order** (`src/routes/__root.tsx`): mount `AuthProvider` *outside* `LanguageProvider` so a language toggle never re-renders auth state.
- **Stable callbacks** (`src/auth/AuthContext.tsx`): wrap `signOut` / `refreshRole` in `useCallback` and memoize the context `value` so consumers don't see new references on unrelated re-renders.
- **LateenShell** (`src/components/dashboard/lateen/LateenShell.tsx`):
  - Keep the existing `signOutRef` pattern.
  - Guard the script-injection effect with an idempotency check: if the script for this `role` + `userId` is already mounted, do not re-inject.
  - The lang `useLayoutEffect` continues to call `translateDOM(containerRef.current, lang)` only — no DOM rebuild, no API refetch.
- **No reload, no router invalidate** anywhere in the language change path. `setLang` only updates state + writes `localStorage` + flips `documentElement.dir` via `useLayoutEffect` (already in place; verify).

## 3. Translate dynamic mock data and dashboard arrays

The embedded dashboards render product names, order statuses, metric labels, currency names, and notification text from JS arrays inside `business.script.js`, `marketer.script.js`, and `admin.script.js`. `translateDOM` already walks the rendered DOM, so the fix is to make those strings translatable rather than rewriting the render layer:

- Audit each `*.script.js` for literal English strings used in rendered HTML: product names, order statuses (`Pending`, `Paid`, `Shipped`, `Cancelled`), metric labels (`Revenue`, `Pieces`, `Success`, `Failed`), period labels (`Day`, `Month`, `Year`), notification copy, currency display names, empty-state text.
- Add every one of those strings as a key in `src/i18n/translations.ts` with its Arabic value.
- After the dashboard script repaints a section (`renderProducts`, `applyFilters`, `updateSummary`, `renderPhotoGrid`, notification render, etc.), trigger a re-translate. Two options; we'll use (a):
  - (a) Patch each render function tail to call `window.__retranslate?.()`, and expose `__retranslate = () => translateDOM(containerRef.current, currentLang)` from `LateenShell`. This is one-line per render function.
  - (b) A scoped `MutationObserver` on the container. Rejected — user explicitly wants no observer-based translation.
- Chart axis tick labels (`Mon…Sun`, `Jan…Dec`) and tooltip suffixes (`pcs`) are produced inside Chart.js callbacks; route those through the same dictionary by reading `window.__lang` at draw time and translating before returning.

## 4. Audit remaining hardcoded strings in React components

Sweep these files for raw English and wrap in `t()`:

- `src/components/dashboard/*` — `DashboardShell`, `Topbar`, `BottomNav`, `MenuDrawer`, `BalanceCard`, `NotificationsPage`, `RevenueChart`, `StatsRow`, `ProductList` (label default `"Products"`, `"sold"`).
- `src/components/dashboard/business/BusinessDashboard.tsx`, `src/components/dashboard/marketer/MarketerDashboard.tsx`.
- `src/components/auth/*` — labels, placeholders, button text, helper copy.
- `src/routes/index.tsx`, `src/routes/dashboard.tsx`, `src/routes/{business,marketer}.{signin,register}.tsx`.
- Mock-data labels in `src/lib/mock-data.ts` that surface in the UI (stat labels like `"Sales today"`, `"Orders"`, `"Conversion"`, notification titles/bodies) — add to dictionary; components already pass them through, so wrapping at the render site with `t(stat.label)` is enough.

Every new English string discovered is added to `src/i18n/translations.ts` with a professional MSA Arabic translation.

## 5. RTL via Tailwind logical properties (no visual changes)

Sweep components for directional Tailwind classes and convert:

- `text-left` → `text-start`, `text-right` → `text-end`
- `ml-*` → `ms-*`, `mr-*` → `me-*`
- `pl-*` → `ps-*`, `pr-*` → `pe-*`
- `left-*` → `start-*`, `right-*` → `end-*`
- `rounded-l-*` → `rounded-s-*`, `rounded-r-*` → `rounded-e-*`
- `border-l*` → `border-s*`, `border-r*` → `border-e*`

No color, spacing scale, radius, shadow, or typography changes. The embedded dashboards use their own CSS (`lateen-*.css`) — only flip directional properties there (`left`/`right`, `margin-left`/`right`, `padding-left`/`right`, `text-align`) using `[dir="rtl"]` selectors where logical properties aren't already used. Layout, colors, components stay identical.

## 6. Synchronous RTL flip

Already present in `LanguageContext.tsx` (`useLayoutEffect` sets `document.documentElement.dir` and `lang` before paint). Verify it stays synchronous and runs before the `translateDOM` call in `LateenShell`'s own `useLayoutEffect` (React guarantees parent layout effects before children — good).

## Out of scope

- No new dependencies.
- No changes to Supabase schema, auth flows, routing, or styling tokens.
- No edits to `src/integrations/supabase/*` or `src/routeTree.gen.ts`.

## Files touched

- `src/i18n/locales.ts`
- `src/i18n/translations.ts` (trim to AR, add missing keys)
- `src/i18n/LanguageContext.tsx` (verify, no logic change beyond memoization)
- `src/i18n/LanguagePicker.tsx`, `src/i18n/LanguageSwitcher.tsx`, `src/routes/language.tsx`
- `src/routes/__root.tsx` (swap provider order)
- `src/auth/AuthContext.tsx` (useCallback + useMemo)
- `src/components/dashboard/lateen/LateenShell.tsx` (idempotent script injection + `__retranslate` bridge)
- `src/components/dashboard/lateen/{business,marketer,admin}.script.js` (call `__retranslate` after each render; translate chart labels)
- `src/components/dashboard/lateen/{business,marketer,admin}.body.html` (logical-property sweep where needed)
- `src/styles/lateen-{business,marketer,admin}.css` (add `[dir="rtl"]` overrides only where logical props can't reach)
- `src/components/dashboard/*` and `src/components/auth/*` (t-wrap + logical-property sweep)
- Route files under `src/routes/` for any loose strings

Estimated change is mechanical and large in line count but small in risk — no behavior changes beyond what is listed.
