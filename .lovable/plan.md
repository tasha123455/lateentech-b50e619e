## Findings

### 1. Marketer earnings/analytics update too early

In `src/components/dashboard/lateen/marketer.script.js`:

- `submitOrder()` (line 70) calls `recomputeAnalytics()` and `refreshWallet()` right after the marketer uploads the receipt and confirms the upfront fee. The order is also pushed into the local `orders` array immediately, with the per-card "Your commission" value shown in full.
- `recomputeAnalytics()` (line 79) treats `status === 'confirmed'` as earned commission for the chart and ring.
- The real backend rule (in `confirm_order` and `mark_delivered` Postgres functions) is:
  - `confirmed` only credits `wallets.pending` for the marketer.
  - `delivered` is what moves money into `wallets.balance`.

So the marketer's chart, pieces count, and "Done/Failed" ring move as soon as the business owner confirms (and visually feel like they jump as soon as the marketer submits, because of the local push + per-card commission). They should only move when the business marks the order delivered.

### 2. Wallet refresh fires before there is anything to refresh

`refreshWallet()` is called inside `submitOrder()`. Nothing on the wallet has changed yet at that point — the order is still `pending`. This is misleading and also adds an extra round-trip.

### 3. Upload button "not working"

The markup and handlers look wired correctly:
- `<div class="upload-box" onclick="triggerUpload()">` -> clicks the hidden `<input id="file-input">`.
- `onFileUpload()` calls `window.LateenAPI.uploadReceipt(file)` which uploads to the `product-photos` bucket under `${userId}/receipts/...`.

The storage RLS policy on `product-photos` only allows INSERT when `auth.uid()::text = foldername[1]`. The marketer uploads to a path starting with their own `userId`, so the policy passes — uploads should work for marketers in principle.

Likely real causes the user is hitting:
- Silent failure when `window.LateenAPI` is not yet attached (script timing), so `uploadReceipt` is undefined and the click appears to do nothing.
- The error path in `onFileUpload` only `alert`s the message; if the alert is dismissed quickly or blocked, the user just sees the label reset to "Tap to upload receipt" with no visible feedback.
- No visible "Uploading…" spinner — only the label text changes — easy to miss on mobile.

## Plan (after approval)

1. **Stop counting earnings/analytics until delivered.**
   - In `recomputeAnalytics()`, count earnings and pieces only when `status === 'delivered'` (keep ring "Done" = delivered, "Failed" = cancelled).
   - Remove the `recomputeAnalytics()` and `refreshWallet()` calls from `submitOrder()`. Only `renderOrders()` (local list) should run there. Realtime subscriptions on `orders` and `wallet` will refresh totals when the business actually confirms or delivers.

2. **Make per-order commission visually conditional.**
   - In `renderOrders()`, show "Your commission" as `Pending` until the order's DB `_status === 'delivered'`, so the marketer doesn't think money has been earned just because they uploaded a receipt.

3. **Harden the upload button.**
   - In `onFileUpload()`:
     - Guard against `window.LateenAPI?.uploadReceipt` being missing and surface a clear inline error inside the upload box (not only `alert`).
     - Show a small spinner / progress dot in the upload-box while uploading.
     - Disable the box during upload so double-taps don't restart it.
     - Reset the label to a clear error state on failure ("Upload failed — tap to try again") instead of silently going back to the default text.

4. **Verify after fix.**
   - Submit a new order with a test image: confirm a Storage object is created under the marketer's user id folder, confirm `orders.receipt_url` is populated, confirm the home charts and wallet do NOT change until the business marks the order delivered.

### Files to edit
- `src/components/dashboard/lateen/marketer.script.js`
- `src/components/dashboard/lateen/marketer.body.html` (small CSS for the spinner / error state in `.upload-box`)

No DB or RLS changes are needed.
