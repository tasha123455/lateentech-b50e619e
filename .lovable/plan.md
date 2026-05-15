## Plan: complete translation + RTL deep-clean

### 1. Make the translation engine deterministic and local-first
- Keep English as the canonical key and Arabic in the local `T` dictionary.
- Add a small helper API around `T` for embedded dashboard scripts so dynamic HTML can use `window.__t(...)` consistently.
- Remove any reliance on async translation for Arabic; Arabic must resolve instantly from local memory.
- Ensure language changes update `lang`, `dir`, cached globals, attributes, text nodes, and dynamic dashboard content in one synchronous pass.

### 2. Exhaustively extract remaining UI copy
- Audit all active pages, auth forms, route boundaries, language picker/switcher, dashboard templates, and dashboard scripts.
- Add missing Arabic entries for hardcoded copy found in:
  - `src/routes/__root.tsx`, `src/routes/dashboard.tsx`, `src/routes/language.tsx`, auth routes.
  - `src/components/auth/*` placeholders, alerts, Google button text.
  - Embedded Lateen HTML files: business, marketer, admin.
  - Embedded Lateen scripts: dynamically injected order cards, product cards, filters, confirmations, errors, admin rows, payout/payment states.
  - Legacy dashboard components and mock data arrays, even if not the current primary dashboard, to satisfy full-codebase coverage.
- Preserve brand names, product codes, currency codes, phone numbers, IDs, and generated order/product references where translation would be wrong.

### 3. Localize data arrays and constants
- Update arrays/constants that drive UI text so labels pass through translation at render-time.
- For React components, use `useT()` for labels, placeholders, button copy, aria-labels, titles, empty states, errors, and route fallback text.
- For embedded scripts, replace text-producing literals in templates with `__t('...')` or a script-local alias, including:
  - Status labels and step names.
  - Chart tooltips/month/day labels where visible.
  - Product/order cards, filter chips, forms, alerts, confirms, prompts, receipts, payout states, admin actions.
  - Empty states like “No products found”, “No orders found”, “Loading…”.

### 4. Improve Arabic copy quality
- Rewrite weak/literal Arabic entries into polished Modern Standard Arabic suitable for a premium business/marketing interface.
- Use concise UI phrasing, natural business terminology, and consistent terms:
  - marketer = المسوّق
  - business/company owner = صاحب الشركة / الشركة
  - payout = السحب
  - commitment fee = رسوم التأكيد
  - delivery/shipping distinction where needed.

### 5. Native RTL-first layout stabilization
- Add global RTL rules using logical properties and `[dir="rtl"]` selectors instead of one-off left/right overrides.
- Fix hardcoded `text-left`, `text-right`, `ml-auto`, `mr-*`, `left-*`, `right-*`, border-left/right, and absolute positioning in active React UI where they affect Arabic.
- Add scoped RTL rules for embedded business/marketer/admin dashboards:
  - Drawer opens from the correct logical side.
  - Back/chevron/status alignment stays stable.
  - Search icons, currency prefixes, action buttons, order cards, product cards, and bottom nav do not shift or clip.
  - Long Arabic labels wrap or truncate intentionally instead of breaking containers.

### 6. Premium Arabic typography
- Add an Arabic-aware font stack with professional Arabic fallbacks such as `Tajawal`, `IBM Plex Sans Arabic`, `Noto Sans Arabic`, and system Arabic fonts.
- Apply slightly improved Arabic line-height and font-size rhythm under `[lang="ar"]` / `[dir="rtl"]` so Arabic does not look cramped or misaligned.
- Keep numeric/currency data legible and stable with `dir="ltr"` where needed for money, IDs, codes, and phone numbers.

### 7. Prevent flicker and layout snapping
- Keep the pre-paint language script in the root shell so `html lang/dir` is correct before render.
- Apply translations before paint in `LateenShell` and on language events.
- Ensure dynamically injected scripts re-render/translate immediately after changing language, not after a delayed async pass.
- Avoid translating the same already-translated node repeatedly by preserving original source text correctly.

### 8. Add QA guardrails
- Add or run a local audit script that scans project files for visible English UI literals not present in `T` and reports remaining misses.
- Validate Arabic and English toggling in the dashboard after implementation.
- Check for common UI risks: clipped labels, broken search/input alignment, drawer side, bottom nav labels, order/product card images, placeholders, aria-label/title attributes, and dynamic confirmations/errors.

### Technical notes
- Do not edit generated files such as `src/routeTree.gen.ts` or backend integration generated files.
- The published/live sync issue is separate from code correctness; once these changes are implemented, the current preview will still need to be published again to update the standalone URL.