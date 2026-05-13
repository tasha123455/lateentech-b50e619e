# Multilingual Lateen — language picker + full app translation

## What you'll see

1. **First visit** → app routes to a new `/language` page. A clean grid of ~50 languages with native names (e.g. *English, Español, العربية, 中文, हिन्दी*). Pick one → continues to the landing page.
2. **Every screen after** has a small globe button (top-right) that reopens the picker. Choice is remembered in `localStorage`.
3. **Whole UI updates instantly** — landing copy, sign-in / register forms, both dashboards (Business + Marketer): nav, headers, balance card, stats, charts labels, products, orders, menu, notifications, all form labels and buttons.
4. **Right-to-left** (Arabic, Hebrew, Persian, Urdu) flips layout direction automatically (`<html dir="rtl">` + mirrored UI).

## Languages (50)

English, Spanish, French, German, Italian, Portuguese, Brazilian Portuguese, Dutch, Swedish, Danish, Norwegian, Finnish, Polish, Czech, Slovak, Hungarian, Romanian, Greek, Turkish, Russian, Ukrainian, Bulgarian, Serbian, Croatian, Arabic (RTL), Hebrew (RTL), Persian (RTL), Urdu (RTL), Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Chinese (Simplified), Chinese (Traditional), Japanese, Korean, Vietnamese, Thai, Indonesian, Malay, Filipino, Swahili, Amharic, Yoruba, Hausa, Zulu, Afrikaans.

## Technical approach

### 1. i18n core (`src/i18n/`)
- `locales.ts` — list of 50 `{code, name, native, rtl}`.
- `keys.ts` — TypeScript type listing every translatable key (~140 keys covering landing, auth, dashboard chrome, form labels, buttons, status words, nav, menu, notifications, time words like "today/yesterday").
- `dict/<code>.ts` — one file per language, exports `Record<Key, string>`.
- `LanguageContext.tsx` — `<LanguageProvider>` reads `localStorage.lateen_lang`, sets `<html lang dir>`, exposes `useT()` hook + `setLang()`. Also writes `window.__T` (current dict) and `window.__lang` so the embedded dashboard scripts can use it.
- Fallback to English for any missing key.

### 2. Language picker route
- `src/routes/language.tsx` — grid of language cards (native + English name), search input, "Continue" → goes to `/`.
- `src/routes/index.tsx` redirects to `/language` if no language is set yet.

### 3. Persistent switcher
- New `<LanguageSwitcher>` component (small globe icon → opens compact dropdown). Mounted on landing page header, `AuthCard`, and inside dashboard topbars (via a slot in the embedded HTML).

### 4. React surfaces
- Refactor strings in: `routes/index.tsx`, `auth/AuthCard.tsx`, `auth/SignInForm.tsx`, `auth/RegisterForm.tsx`, `auth/GoogleButton.tsx` to `t('key')`.

### 5. Embedded dashboard HTML/JS (Business + Marketer)
The dashboards are raw HTML strings injected via `dangerouslySetInnerHTML` plus a JS file. To translate them without a rewrite:
- Add `data-i18n="key"` attributes on every static text node in `business.body.html` and `marketer.body.html`.
- In `LateenShell`, after mount and on every language change: walk `[data-i18n]` and replace `textContent` from the dictionary; also handle `[data-i18n-placeholder]`.
- Update `business.script.js` and `marketer.script.js` so any dynamically rendered strings (e.g. "Active", "Paused", "Pending", "Add product", currency picker labels) read from `window.__T` instead of being hard-coded.
- Add a small globe button in the dashboard topbar that calls a bridge function exposed by React to open the picker.

### 6. RTL support
- `LanguageProvider` sets `document.documentElement.dir = locale.rtl ? 'rtl' : 'ltr'`.
- Add `[dir="rtl"]` overrides in `src/styles.css` and the two lateen stylesheets to mirror flex/margin direction where needed (bottom nav, drawer slide-in side, chart card alignment).

## Out of scope
- User-entered content (product titles, order notes) stays as the merchant typed it — only UI chrome is translated.
- No backend / DB changes. No auth changes.
- No machine-translation API; the dictionary is bundled.

## Verification
1. Fresh load → lands on `/language`. Pick *العربية* → app flips to RTL, landing reads in Arabic.
2. Sign in as business → dashboard nav, balance card, stats, "Add product" sheet labels and currency picker all in Arabic, layout mirrored.
3. Click globe in dashboard topbar → switch to *日本語* → entire dashboard switches without reload.
4. Switch to *English* → everything reverts cleanly. Reload → choice remembered.

If this looks right I'll build it; the locale dictionaries are the bulk of the work and will be added language-by-language so nothing is left untranslated.
