# Split into /en and /ar route trees

## Goal
Eliminate the runtime `dir`/content flip jitter by serving each language as its own fully-rendered route tree. English lives under `/en/*`, Arabic under `/ar/*`. Each tree is rendered with the correct `dir` and `lang` from the very first paint — no live in-place swap.

## Assumptions (flag if wrong)
- Route file layout stays TanStack file-based; we use two pathless layout routes (`_en` and `_ar`) that set `dir`/`lang` on `<html>` via a small effect at layout mount, then render `<Outlet />`. Every existing route file moves under one of these layouts, duplicated as thin wrappers that share the same underlying component/logic module.
- Translation strings stay in `src/i18n/dictionary.ts` — no duplication of copy. The `useLanguage()` hook is reworked to read the language from the current route (`/en/*` → `en`, `/ar/*` → `ar`) instead of localStorage state.
- The language toggle becomes a `<Link>` that swaps the `/en` ↔ `/ar` prefix on the current pathname (preserving the rest of the path + search params). Same-page swap → React remounts the sibling tree, so scroll/tab state within a client-managed dashboard (the big HTML/JS `marketer.script.js` / `business.script.js` / `admin.script.js` shells) is preserved only at "which dashboard tab" granularity via existing localStorage keys those scripts already use. Deep in-page scroll position is best-effort, not guaranteed.
- First-visit detection at `/` reads `navigator.language` (existing logic in `LanguageContext`) and `redirect()`s to `/en` or `/ar`. `/dashboard`, `/marketer/signin`, etc. at the old top-level paths also redirect to the language-prefixed equivalents (using the stored/detected language) so old bookmarks + Supabase auth callback URLs keep working.
- Public product share link: `/p/$id` → redirect to `/en/p/$id` or `/ar/p/$id`. We keep `/p/$id` alive as a redirect so already-shared links don't break.
- Auth (`AuthContext`, Supabase middleware, `_authenticated` gating) is unchanged in behavior — the gate simply moves inside each language tree.

## Stages

### Stage 1 — Routing skeleton
1. Add `src/routes/_en.tsx` and `src/routes/_ar.tsx` pathless layout routes. Each:
   - Sets `document.documentElement.lang` + `dir` in a `useLayoutEffect` on mount (one-time per tree; no toggling once mounted).
   - Provides the language to context via a `<LanguageProvider value="en"|"ar">` wrapper.
   - Renders `<Outlet />`.
2. Rework `src/i18n/LanguageContext.tsx`:
   - Remove the state/localStorage toggle.
   - Language is passed in via provider prop (from the layout route).
   - The toggle button becomes a `<Link>` computed as `pathname.replace(/^\/(en|ar)/, otherLang)` with search params preserved.
3. Add `src/routes/index.tsx` (top-level `/`) that detects language and `throw redirect({ to: '/en' | '/ar' })` in `beforeLoad`.

### Stage 2 — Move every existing route under both trees
For each current route file, create two thin wrappers under `_en.*` and `_ar.*` that both import and render the same underlying component. Extract the current component bodies into `src/pages/*` modules so the two route files stay one-liners.

Routes to duplicate:
- `/` landing → `/en/` and `/ar/` (files: `_en.index.tsx`, `_ar.index.tsx`)
- `/dashboard` → `_en.dashboard.tsx`, `_ar.dashboard.tsx`
- `/marketer/signin`, `/marketer/register`
- `/business/signin`, `/business/register`
- `/p/$id`
- API/webhook routes under `/api/public/*` and `/lovable/*` are NOT language-scoped — they stay at their existing top-level paths.

### Stage 3 — Back-compat redirects
Add small redirect-only route files at the OLD top-level paths (`/dashboard`, `/marketer/signin`, `/business/signin`, `/marketer/register`, `/business/register`, `/p/$id`) that read stored/detected language and `redirect()` to the equivalent `/en/...` or `/ar/...`. This keeps Supabase auth-callback redirects, bookmarks, and existing share links working.

### Stage 4 — Language-aware internal navigation
- Sweep every `<Link to="/...">`, `navigate({ to: '/...' })`, `redirect({ to: '/...' })` in `src/` (React code + auth flows + the auth-gate redirect target).
- Rewrite each to prepend the current language prefix. Add a small helper `useLangPath(path)` / `langHref(lang, path)` and use it everywhere.
- The HTML/JS dashboard shells (`marketer.script.js` etc.) already live inside a single dashboard route — their internal tabs stay as-is. Any hard-coded `location.href = '/...'` inside those scripts gets the prefix too.

### Stage 5 — Language toggle preserves context
Toggle becomes:
```tsx
<Link to={pathname.replace(/^\/(en|ar)/, `/${other}`)} search={(s) => s} replace />
```
Because the sibling subtree is a fresh mount, we rely on:
- Route params (`/p/$id`, dashboard route) naturally preserved via the same path suffix.
- Query params preserved via `search={(s) => s}`.
- Dashboard-internal tab state already persisted by the existing shell scripts in `localStorage` — no change.
- Scroll: best-effort via `sessionStorage` handoff keyed on path suffix; documented as best-effort.

### Stage 6 — Verify
- Type/build check passes.
- Manually load `/`, `/en`, `/ar`, `/en/dashboard`, `/ar/dashboard`, `/en/marketer/signin`, `/ar/business/register`, `/en/p/<id>` in the preview via Playwright; screenshot each to confirm no flip, correct `dir`, correct copy.
- Confirm the old paths redirect correctly.
- Confirm Google OAuth still lands the user on a `/en|ar/dashboard` route.

## Technical notes
- TanStack pathless layout: filename `_en.tsx` = route id `/_en`, URL prefix `/en` requires the child file to be named `_en.index.tsx` (for `/en`) or `_en.dashboard.tsx` (for `/en/dashboard`). The `_en` segment is stripped from the URL only if it starts with `_` AND we want a pathless layout — but we DO want `/en` in the URL. So we use non-pathless folder routes: `src/routes/en.tsx` (layout for `/en`) with children `en.index.tsx`, `en.dashboard.tsx`, etc. Same for `ar`. This is the correct TanStack pattern for language-prefixed trees.
- Route-tree file (`src/routeTree.gen.ts`) regenerates automatically — do not hand-edit.
- No changes to Supabase schema, RLS, RPCs, edge/webhook routes, or business logic.

## Out of scope
- Server-side language negotiation via `Accept-Language` header (client-side detection is sufficient and matches existing behavior).
- SEO `hreflang` alternates (can add later if requested).
- Translating any new copy — only the routing/rendering layer changes.
