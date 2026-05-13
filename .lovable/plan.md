## Goal
Replace the 34-entry `CURRENCIES` array in the business Add-product form with the full ISO 4217 active list (~160 currencies), each with `code`, `name`, `symbol`, and `flag` emoji.

## Changes

1. **`src/components/dashboard/lateen/business.script.js`** (line 20)
   - Replace the inline `CURRENCIES` array with the full ISO 4217 set, alphabetized by `code`.
   - Use country flag emoji for single-country currencies; 🌍 / 🌐 for supranational (XAF, XOF, XCD, XDR, etc.).
   - Keep the existing object shape so `selectCurrency`, `renderCurrencyDropdown`, and product seed data keep working unchanged.

2. **Same file, line 32** (`renderCurrencyDropdown`)
   - Bump `slice(0, 50)` → `slice(0, 200)` so search results and the initial open show the full list (search box already filters).

## Out of scope
- No UI/CSS changes — the existing dropdown, search, and selected-state styling stay identical.
- No marketer-side changes (marketer has no currency picker).
- No DB or auth changes.

## Verification
- Open business dashboard → Products → "Add a product" → tap the currency selector.
- Confirm the list scrolls through ~160 entries and search filters by name / code / symbol (e.g. "rupee", "XOF", "₪").
- Pick a non-original currency (e.g. ILS, THB, VND), confirm symbol propagates to price prefix and commission suffix.
- Save the product, reopen for edit, confirm currency persists in the form.
