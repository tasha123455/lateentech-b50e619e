## Findings

### Why the order "disappears" after uploading the receipt

`src/components/dashboard/lateen/marketer.body.html` line 476:

```html
<div class="overlay" id="form-overlay">
  <div class="overlay-bg" onclick="closeForm()"></div>
  ...
```

The form overlay has a transparent backdrop wired to `closeForm()`. After the file picker returns, the OS focus shift + scroll lands a tap on that backdrop, the form closes, `resetForm()` wipes every field including `currentProduct`, `currentDelivery`, `hasReceipt`, `receiptUrl`, `depositConfirmed`, and the user lands back on the orders page (which looks like a "redirect to dashboard"). Nothing was saved because `submitOrder` was never called.

### Why the order isn't held back from the business right now

`submitOrder()` in `marketer.script.js` requires `depositConfirmed === true` before it does anything — it `alert`s and returns otherwise. So the marketer can't save a draft locally; it's all-or-nothing. Once they do submit, `createOrder` writes to the `orders` table immediately, and the business RLS policy `auth.uid() = business_id` makes the row visible to the business at that moment.

The user wants two things:
1. Be able to fill in and save an order at any time (draft).
2. The order should only become visible to the business owner after the receipt is uploaded AND the upfront fee is confirmed.

## Plan

### 1. Stop the form from closing by accident

In `marketer.body.html`:
- Replace the `onclick="closeForm()"` on `.overlay-bg` with a no-op (or remove the handler entirely). Closing only via the explicit "Cancel" button or the X.
- Same fix for the instructions overlay backdrop if it has the same pattern (check and only change if so).

### 2. Allow saving an order at any time as a local draft

In `marketer.script.js`:
- Remove the hard `depositConfirmed !== true` block at the top of `submitOrder()`.
- When the marketer submits without a confirmed receipt:
  - Build the local order with `_status: 'draft'` and `depositConfirmed: false`, push it into `orders`, do NOT call `createOrder`.
  - Persist drafts in `localStorage` keyed by `userId` so they survive a refresh (drafts never reach the backend, so RLS is irrelevant).
- When the marketer submits with `hasReceipt && depositConfirmed === true`:
  - If the order was a local draft, call `createOrder` now (this is the "send to business" moment) and remove it from the draft store; mark `_status: 'pending'` and store the returned `dbId`.
  - If the order already has a `dbId` (was already sent), just `updateOrder` with the latest receipt URL / `marketer_confirmed_at`.

### 3. Make the gating obvious in the UI

- The submit button label switches between **"Save as draft"** (no receipt yet) and **"Send to business owner"** (receipt + deposit confirmed). The button is always enabled as long as the customer + product + delivery fields are filled.
- On the order card in the list, drafts get a `Draft · not yet sent` badge instead of `Fee pending`, and a small "Add receipt" button that re-opens the form for that draft so the marketer can finish it.

### 4. Keep delivered-only earnings rule

No change to `recomputeAnalytics` — it still only counts `delivered` orders, so drafts and pending orders don't affect earnings or analytics.

### Files to edit
- `src/components/dashboard/lateen/marketer.body.html`
- `src/components/dashboard/lateen/marketer.script.js`

No DB schema or RLS changes are needed: drafts live only on the marketer's device; backend orders are still gated by `marketer_confirmed_at` + receipt URL when they get inserted.
