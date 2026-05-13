Findings:

1. Business Products/Orders layout is still low because there are two style sources.
   - `business.body.html` was changed to `padding: 0.75rem...`, but `src/styles/lateen-business.css` still has `.lateen-business .app { padding: 1.5rem 1.25rem 5rem; }`.
   - The external stylesheet is imported by `LateenShell.tsx` after the raw HTML, so it can override the inline dashboard styling.
   - The external stylesheet also does not include the new `.sub-header` styling, so the compact header can render inconsistently.

2. Business Orders has broken status transitions.
   - The UI has a `shipped` step, but the database only supports `pending`, `confirmed`, and `delivered` through the current API.
   - Clicking “Mark shipped” only changes local UI state, then `loadOrders()` reloads from the backend and turns it back into `confirmed`.
   - Clicking “Failed” has the same issue: it only changes local state and is lost after reload because no backend cancel/fail API exists.

3. Business order list may show wrong/incomplete product details if orders load before products.
   - `dbToOrder()` looks up product info from the in-memory `products` array.
   - Initial load does `await loadProducts(); await loadOrders();`, which is okay, but realtime order updates only call `loadOrders()`. If product data changes or is missing, order cards can show `(product)` and lose photos/code.

4. Business dashboard financial numbers are inconsistent.
   - The top balance uses `wallet.balance`, which is a marketer wallet concept, while the business dashboard breakdown is calculated from delivered orders.
   - That can make the business home amount stay `£0.00` even when delivered orders exist, while breakdown fields show different totals.

5. Delivered order analytics update only partially.
   - `markDelivered()` updates the backend and marketer wallet, then business reloads orders/products, but the business “wallet amount” still reads from the wallet table instead of calculated business net earnings.
   - Product `sold/revenue` does update when confirming the order, not when delivered, so business product cards can look updated before actual delivery.

6. Marketer order submission is mostly gated correctly now.
   - The Add Order button requires receipt upload and upfront fee confirmation.
   - `createOrder()` is only called after confirmation, matching “don’t create it in DB yet”.
   - Remaining concern: locally adding the order after save can duplicate briefly until backend reload/realtime finishes.

7. Live subscriptions are not fully cleaned up.
   - Business script creates `__unsubProducts`, `__unsubOrders`, `__unsubWallet`, but `LateenShell` only removes the injected script and `LateenAPI`; it does not call these unsubscribe functions.
   - Re-entering dashboard/role changes can leave duplicate realtime listeners.

Plan to fix after approval:

1. Fix the Business Products/Orders vertical layout in both style sources.
   - Add the same compact `.sub-header` CSS to `src/styles/lateen-business.css`.
   - Change `.lateen-business .app` padding there to match `business.body.html`.
   - Tighten orders spacing (`summary-row`, search, filters) so the first order card starts higher.

2. Make order status behavior match the real backend.
   - Remove or disable the fake `shipped` step unless a real backend status is added.
   - Keep the flow as: New order -> Confirm order -> Mark delivered.
   - Remove the fake Failed action or add a real cancel/fail backend path if you want failures tracked.

3. Make business dashboard numbers consistent.
   - Set business top “NET EARNINGS” from delivered orders net revenue, not `wallet.balance`.
   - Refresh charts, stat cards, and financial breakdown after confirm/deliver/order realtime changes.

4. Keep Products and Orders data in sync.
   - On order realtime updates, reload products then orders so product names/photos/revenue stay correct.
   - After confirming/delivering, reload in the correct order and recompute analytics.

5. Clean up live listeners safely.
   - Store unsubscribe callbacks on `window` or a role-specific cleanup object and call them when `LateenShell` unmounts/reinjects the dashboard script.

Files to edit:
- `src/styles/lateen-business.css`
- `src/components/dashboard/lateen/business.body.html`
- `src/components/dashboard/lateen/business.script.js`
- `src/components/dashboard/lateen/LateenShell.tsx`