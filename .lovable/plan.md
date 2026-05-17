# Fix: Arabic toggle leaves many strings in English

## Root cause

`translateDOM` in `src/i18n/LanguageContext.tsx` is currently a no-op:

```ts
export function translateDOM(root, code) { return; }
```

The wrapping/retranslate plumbing in `LateenShell` already calls it after every render and on language change — but because the function does nothing, all HTML/JS-injected English text (Browse products, Orders, Wallet, weekday labels, "Save", "Continue with Google", etc.) stays in English. Static React strings using `t()` work, but everything injected via `dangerouslySetInnerHTML` or the embedded scripts (business/marketer/admin) is untouched.

## Plan

### 1. Implement a real `translateDOM`

In `src/i18n/LanguageContext.tsx`, replace the stub with a DOM walker that:

- Bails immediately when `code === "en"` (no-op fast path).
- Uses a `TreeWalker(NodeFilter.SHOW_TEXT)` to visit every text node under `root`.
- For each text node, trims the value; if the trimmed string exists as a key in `T` and has an `ar` value, replace just the trimmed portion (preserve surrounding whitespace) with the translation.
- Also translates these attributes when present on element nodes: `placeholder`, `title`, `aria-label`, `alt`, `value` (only on `<input type="button|submit">` / `<button>`).
- Skips `<script>`, `<style>`, `<noscript>`, and any element with `data-no-i18n` or `contenteditable="true"`.
- Caches the original English string on the node in a WeakMap (`__i18nOriginal`) the first time it sees it, so subsequent re-translations re-lookup from the original — this lets toggling EN ↔ AR work cleanly even if a previous AR pass already replaced the text node's content.
- Numbers, currency symbols (`£`), and mixed strings with digits stay intact unless the whole trimmed string is itself a dictionary key (e.g. weekday/month labels are pure words; values like "£1,250.00" are skipped).

### 2. Massively expand `src/i18n/translations.ts`

Audit the three embedded dashboards and add every English string to the dictionary. Concrete sweeps:

- **business.body.html** + **business.script.js** — page titles ("Products", "Orders", "Analytics", "Wallet"), buttons ("Save", "Cancel", "Add product", "Edit", "Delete", "Withdraw"), filter chips ("All", "Active", "Pending", "Completed", "Refunded"), order statuses ("Paid", "Shipped", "Delivered", "Cancelled"), table headers ("Order", "Customer", "Date", "Total", "Status"), empty states, mock product names and categories.
- **marketer.body.html** + **marketer.script.js** — nav ("Browse", "Saved", "Orders", "Wallet", "Profile"), product card labels ("Commission", "Price", "Stock", "Save link", "Copy"), wallet card ("Available balance", "Pending", "This month", "Withdraw"), filter/sort labels, mock product/category strings.
- **admin.body.html** + **admin.script.js** — verification labels, payout statuses, user/employee table headers, metric labels.
- **Date/time labels** — full + short weekday names (`Sunday`…`Saturday`, `Sun`…`Sat`), month names (`January`…`December`, `Jan`…`Dec`), and the words `Day`, `Week`, `Month`, `Year`, `Today`, `Yesterday`.
- **Auth surface** — `Continue with Google`, `Sign in with Google`, `or`.
- **Common UI verbs** — `Save`, `Cancel`, `Close`, `Confirm`, `Delete`, `Edit`, `Apply`, `Reset`, `Search`, `Filter`, `Sort`, `View all`, `See more`, `Loading…`, `No results`.

Each gets an `ar` MSA translation. (Approximate count: ~250 new keys.)

### 3. Chart axis & tooltip labels

`Chart.js` axis tick callbacks render strings the DOM walker cannot reach (canvas). In each `script.js`, route the tick/tooltip label functions through `window.__t = (k) => (window.__T?.[k]?.[window.__lang] ?? k)`. Expose `__T` and `__lang` from `LanguageContext` (already partially done for `__lang`; add `__T = T` on mount). Re-render charts on language change via the existing `__retranslate` bridge: in the wrapped renderers, if a chart instance exists, call `chart.update()` after the language flips so weekday/month tick labels re-evaluate.

### 4. Verification

After implementation, manually flip EN ↔ AR on `/dashboard` for each role (business, marketer, admin) and check:
- Nav, headers, buttons, table headers, status pills.
- Browse/Products/Orders/Wallet cards (data preserved, labels translated).
- Chart axis labels (weekdays/months) flip.
- Auth pages ("Continue with Google" reads in Arabic).
- No layout shift, no data wipe, RTL mirroring intact (already handled by `useLayoutEffect` + logical Tailwind classes).

## Files to edit

- `src/i18n/LanguageContext.tsx` — implement `translateDOM`, expose `__T` and `__lang`.
- `src/i18n/translations.ts` — add ~250 new EN→AR entries.
- `src/components/dashboard/lateen/business.script.js`
- `src/components/dashboard/lateen/marketer.script.js`
- `src/components/dashboard/lateen/admin.script.js` — route chart tick/tooltip strings through `window.__t`, trigger `chart.update()` on retranslate.
- `src/components/auth/SignInForm.tsx` / `RegisterForm.tsx` — wrap any remaining literal strings (e.g. Google button label override) in `t()`.

No visual design, layout, colors, padding, or component shapes change. Only string delivery + a real DOM walker.
