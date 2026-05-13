## Goal

Find out exactly why clicking **List product** appears to do nothing, by surfacing which of the four validation guards (or which Supabase error) is firing.

## Change

In `src/components/dashboard/lateen/business.script.js`, inside `async function submitProduct()`:

1. Add `console.log('[Lateen] submitProduct fired', { name, price, commPct, commFixed, selectedCurrency, zones })` immediately after the form values are read.
2. Add `console.log('[Lateen] payload ready', payload)` immediately before the `await window.LateenAPI.upsertProduct(payload)` call.
3. Keep the existing `console.error('[Lateen] upsertProduct', e)` in the `catch` block.

No other behavior changes — alerts and validation logic stay as-is.

## After this lands

Click **List product** once. The console will show one of:
- Nothing → click handler not bound (regex / window-export issue).
- `submitProduct fired` then no `payload ready` → a validation guard tripped (the alert + the logged values tell us which field is empty).
- `payload ready` then `[Lateen] upsertProduct` error → Supabase / RLS error; the message guides the real fix.

Next message I'll apply the targeted fix based on what the log shows.
