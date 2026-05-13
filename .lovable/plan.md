# Multilingual Lateen — language picker + full app translation

## What you'll see

1. **First visit** → app routes to a new `/language` page. A clean grid of ~50 languages with native names (English, Español, العربية, 中文, हिन्दी…) plus a search box. Pick one → continues to the landing page.
2. **Every screen after** has a small globe button (top-right) that reopens the picker. Choice is remembered in `localStorage`.
3. **Whole UI updates instantly** — landing copy, sign-in / register forms, both dashboards (Business + Marketer): nav, headers, balance card, stats, chart labels, products, orders, menu, notifications, all form labels and buttons.
4. **Right-to-left** (Arabic, Hebrew, Persian, Urdu) flips layout direction automatically (`<html dir="rtl">` + mirrored UI).

## Languages (50)

English, Spanish, French, German, Italian, Portuguese, Brazilian Portuguese, Dutch, Swedish, Danish, Norwegian, Finnish, Polish, Czech, Slovak, Hungarian, Romanian, Greek, Turkish, Russian, Ukrainian, Bulgarian, Serbian, Croatian, Arabic (RTL), Hebrew (RTL), Persian (RTL), Urdu (RTL), Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Chinese (Simplified), Chinese (Traditional), Japanese, Korean, Vietnamese, Thai, Indonesian, Malay, Filipino, Swahili, Amharic, Yoruba, Hausa, Zulu, Afrikaans.

## Technical approach

### 1. i18n core (`src/i18n/`)
- `locales.ts` — 50 `{code, name, native, rtl}` (already exists).
- `dicts/<code>.ts` — one file per language exporting `Record<string, string>`. Hand-curated translations of ~140 UI keys.
- `LanguageContext.tsx` — `<LanguageProvider>` reads `localStorage.lateen_lang`, sets `<html lang dir>`, exposes `useT()` + `setLang()`. Also writes `window.__T` and `window.__lang` so embedded dashboard scripts can use it. Falls back to English for missing keys.

### 2. Language picker route
- `src/routes/language.tsx` — searchable grid of language cards (native + English name).
- `src/routes/index.tsx` redirects to `/language` if no language is set.

### 3. Persistent switcher
- `<LanguageSwitcher>` — small globe icon → compact dropdown. Mounted on landing header, `AuthCard`, and dashboard topbars.

### 4. React surfaces
- Refactor strings in `routes/index.tsx`, `auth/AuthCard.tsx`, `auth/SignInForm.tsx`, `auth/RegisterForm.tsx`, `auth/GoogleButton.tsx` to `t('key')`.

### 5. Embedded dashboard HTML/JS
The dashboards are raw HTML strings + JS injected via `dangerouslySetInnerHTML`. To translate without a rewrite:
- Add `data-i18n="key"` attributes on static text nodes in `business.body.html` and `marketer.body.html`.
- In `LateenShell`, after mount and on language change: walk `[data-i18n]` and replace `textContent`; also handle `[data-i18n-placeholder]`.
- `business.script.js` / `marketer.script.js` read dynamic strings ("Active", "Paused", "Add product"…) from `window.__T`.
- Globe button in dashboard topbar calls a bridge function to open the picker.

### 6. RTL support
- `LanguageProvider` sets `document.documentElement.dir`.
- `[dir="rtl"]` overrides in `src/styles.css` + lateen stylesheets to mirror flex/margin direction (bottom nav, drawer side, chart cards).

## Out of scope
- User-entered content (product titles, order notes) stays as the merchant typed it.
- Country/currency names stay in English (international standard).
- No backend / DB / auth changes. No machine-translation API — dictionary is bundled.

## Verification
1. Fresh load → `/language`. Pick *العربية* → flips to RTL, landing in Arabic.
2. Sign in as business → dashboard nav, balance, stats, "Add product" sheet, currency picker all in Arabic, mirrored.
3. Click globe in dashboard → switch to *日本語* → entire dashboard switches without reload.
4. Switch back to *English* → reverts cleanly. Reload → choice remembered.
