# Multilingual Lateen — simplified

## Languages (10 essentials)

English, Spanish, French, German, Portuguese (Brazil), Arabic (RTL), Hindi, Chinese (Simplified), Japanese, Russian.

These cover the largest user bases globally and include one RTL script (Arabic) so the layout-flipping is in place from day one. More languages can be added later by dropping a new dictionary file in.

## What you'll see

1. **First visit** → app routes to `/language`. Clean grid of 10 language cards (native name + English name). Pick one → continues to the landing page.
2. **Persistent globe button** in the corner of every screen (landing, sign-in/register, both dashboards) reopens the picker.
3. **Whole UI translates instantly** — landing copy, auth forms, dashboard nav/headers/buttons/labels in both Business and Marketer views.
4. **Arabic** flips layout to RTL automatically.

## Technical approach

### i18n core (`src/i18n/`)
- `locales.ts` — the 10-locale list with `{code, name, native, rtl}`.
- `dict.ts` — single file, English-keyed dictionary with one entry per language. ~90 phrases covering all visible UI chrome. Missing keys fall back to English so nothing ever shows blank.
- `LanguageContext.tsx` — provider reads `localStorage.lateen_lang`, sets `<html lang dir>`, exposes `useT()` hook + `setLang()`. Also writes `window.__T` and `window.__lang` so the embedded dashboard scripts can use them.

### Language picker route
- `src/routes/language.tsx` — grid of 10 language cards.
- `src/routes/index.tsx` redirects to `/language` if no language is set yet.

### React surfaces
Refactor strings in `routes/index.tsx`, `auth/AuthCard.tsx`, `auth/SignInForm.tsx`, `auth/RegisterForm.tsx`, `auth/GoogleButton.tsx` to use `t("English phrase")`.

### Embedded dashboard HTML/JS
Dashboards are raw HTML strings injected via `dangerouslySetInnerHTML`. Rather than mark up every string with `data-i18n`, `LateenShell` runs a one-pass text-walker after mount and after every language change: it walks all text nodes and `placeholder`/`title`/`aria-label` attributes, looks each one up in the active dictionary, and replaces if found. For dynamically rendered strings in `business.script.js` / `marketer.script.js`, expose a global `tr(key)` helper that reads from `window.__T`. Re-run the walker after dynamic re-renders.

### Persistent globe switcher
Small `<LanguageSwitcher>` React component (globe icon → compact dropdown). Mounted on landing page, `AuthCard`, and into the dashboard topbars via a fixed-position floating button anchored to the dashboard container.

### RTL support
`LanguageProvider` sets `document.documentElement.dir`. Add `[dir="rtl"]` overrides in `src/styles.css` and the two lateen stylesheets to mirror flex direction, drawer slide-in side, and bottom-nav alignment.

## Out of scope
- Currency names, country names, person names, addresses stay in English (international convention; codes like USD, GBP are universal anyway).
- User-entered content (product titles, order notes) stays as the merchant typed it.
- No backend / DB / auth changes.

## Verification
1. Fresh load → lands on `/language`. Pick *العربية* → app flips to RTL, landing reads in Arabic.
2. Sign in as business → dashboard nav, balance card, stats and "Add product" sheet labels show Arabic, layout mirrored.
3. Click globe → switch to *日本語* → entire UI updates without reload. Switch back to English → reverts cleanly. Reload → choice remembered.
