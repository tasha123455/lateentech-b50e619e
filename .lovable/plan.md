## Problems

1. **Marketer orders disappear on refresh** — `submitOrder` creates the row in Supabase but the page never loads existing orders back. The local `orders=[]` is rebuilt only from in-memory inserts. There's also no realtime subscription to `orders`.
2. **Receipt upload is fake** — `onFileUpload` only flips `hasReceipt=true` locally. The file is never uploaded, no URL is attached to the order, and the business has no way to see proof of payment.
3. **Confirm flow to business** — The order already reaches the business via the existing `orders` insert + `confirm_order` RPC; we just need the receipt visible there and the marketer's local "deposit confirmed" state persisted.

## Changes

### 1. Database (migration)

- Add columns to `public.orders`:
  - `receipt_url text`
  - `marketer_confirmed_at timestamptz`
- Add an RLS UPDATE policy: `Marketers update own pending orders` — `USING (auth.uid() = marketer_id AND status = 'pending') WITH CHECK (auth.uid() = marketer_id)`. This lets the marketer attach the receipt URL and toggle `marketer_confirmed_at` before the business confirms.
- Enable realtime on `orders` (`ALTER PUBLICATION supabase_realtime ADD TABLE public.orders`).
- Reuse the existing public `product-photos` bucket; receipts will be stored under `receipts/<userId>/...` (no new bucket needed since the bucket is already public-read and the existing storage policies allow authenticated uploads to that path).

### 2. `src/lib/lateen-api.ts`

- Add `uploadReceipt(file): Promise<string>` — same as `uploadPhoto` but path prefix `receipts/${userId}/`.
- Extend `createOrder` input to accept `receipt_url?: string` and `marketer_confirmed_at?: string` and pass through to insert.
- Add `updateOrder(id, patch)` — `from('orders').update(patch).eq('id', id)` (used to attach receipt to an already-created order if needed).
- Extend `listMyOrders` already exists; nothing to change.

### 3. `src/components/dashboard/lateen/marketer.script.js`

- New `dbToOrder(row)` mapper: convert DB order row back to the local shape used by `renderOrders` (look up product from `PRODUCTS[row.product_id]` for name/price/pct fallbacks; compute `commPerUnit/platformPerUnit/feePerUnit/totalFee` from stored values).
- New `loadOrders()` — calls `LateenAPI.listMyOrders()`, filters `marketer_id === userId`, maps to local shape, assigns to `orders`, calls `renderOrders()`.
- Call `loadOrders()` at the bottom alongside `loadBrowse()` and after `loadBrowse()` resolves (so `PRODUCTS` is populated for name/price lookups).
- Subscribe to realtime `orders` channel and re-run `loadOrders()` on change.
- `onFileUpload`: actually upload via `LateenAPI.uploadReceipt(file)`, store the returned URL in a module variable `receiptUrl`. Show "Uploading…" then the file name when done; on failure, alert and reset `hasReceipt`.
- `submitOrder`: include `receipt_url: receiptUrl || undefined` and, if `depositConfirmed === true`, `marketer_confirmed_at: new Date().toISOString()` in the `createOrder` payload.
- `resetForm`: clear `receiptUrl`.

### 4. `src/components/dashboard/lateen/business.script.js` + `business.body.html`

- In the business orders list rendering, when `order.receipt_url` exists, show a small "View receipt" link/thumbnail that opens the URL in a new tab.
- Show a "Marketer confirmed" badge when `marketer_confirmed_at` is set, so the business owner knows the marketer has uploaded proof and is ready for them to confirm.
- (No change to the `confirm_order` RPC — the existing button still calls it.)

### 5. `src/integrations/supabase/types.ts`

Auto-regenerated after the migration; no manual edit.

## Out of scope

- No changes to wallet credit logic — `confirm_order` / `mark_delivered` already credit pending/balance correctly.
- No new bucket; reuse `product-photos`.
- No changes to commission math.

## Verification

1. Marketer creates an order, uploads receipt, confirms deposit → row in `orders` has `receipt_url` populated and `marketer_confirmed_at` set.
2. Refresh marketer dashboard → order still appears (loaded from DB).
3. Business dashboard shows the new order with a "View receipt" link and "Marketer confirmed" badge; confirming via the existing button transitions status to `confirmed` and credits the marketer wallet pending.
