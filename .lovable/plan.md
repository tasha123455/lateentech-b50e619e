
## Goals

1. Marketer's order does NOT exist in the database (and therefore is invisible to the business) until the marketer uploads the receipt AND clicks "Yes, I received the deposit".
2. The moment that confirmation happens, the order lands in the business owner's dashboard, and the marketer's tracking page, analytics chart, and wallet pending all reflect it.
3. When the business marks an order Delivered, the business owner's home stats (Sold, Revenue, Total orders, Delivered, charts) update immediately.
4. Business `pg-products` and `pg-orders` pages currently sit too far down the screen (only `.app` top padding above the title). Lift their headers so they sit near the top like a normal mobile screen.

## Behaviour changes

### A. Marketer "Add order" flow
- "Add order" / "Save changes" button is **disabled** until: product, country, city, customer name + phone, receipt uploaded, and `depositConfirmed === true`.
- `submitOrder` only calls `createOrder` when `depositConfirmed === true`. If the marketer cancels/closes before confirming, no DB row is created.
- For an *edit* of a not-yet-confirmed order, behave the same — only persist on confirm.
- Drafts (unconfirmed orders) live only in the in-memory `orders` array for that session. They will not survive refresh — and that is intentional, the user picked "Don't create it in DB yet".
- After persistence, immediately refresh wallet + re-render so the marketer sees pending commission.

### B. Marketer dashboard live data (Earnings / Pieces chart + ring + KPIs)
- Aggregate from `listMyOrders()` (already used by `loadOrders`), grouped by:
  - D = current week, Mon–Sun
  - M = months of current year
  - Y = last 6 years
- For "earnings": sum `commission * qty` of orders where `status IN ('confirmed','delivered')`.
- For "pieces": sum `qty` of same.
- Ring "Successful vs Failed" per period: ok = delivered, fail = cancelled. failPct shown.
- Recompute on every `loadOrders`/realtime tick, then `buildMainChart()` + `buildRingChart()`.
- Top KPI cards (orders count, days-left already wired) — fill in any zero placeholders the same way.

### C. Business dashboard live data
- Same aggregation pattern in `business.script.js`:
  - Revenue chart: sum `(unit_price - commission - platform_fee) * qty` of orders with `status='delivered'`, by period.
  - Pieces: sum `qty` of delivered orders.
  - Ring ok/fail: delivered vs cancelled.
- Top home stat cards (Sold, Revenue, In stock, etc.) — pull from `products` totals + delivered-orders sum so they stay in sync after `mark_delivered`.
- `advance(...,'delivered')` already calls `mark_delivered`; after it returns we already `loadOrders()` + `loadProducts()` — also call `recomputeCharts()` and `refreshWallet()` so the home page reflects it without a manual refresh.

### D. Business `pg-products` / `pg-orders` layout fix
- Both pages currently render their `.page-header` directly under `.app`'s 24 px top padding with no topbar above (the topbar lives inside `pg-home` only), which makes the title sit visually too low / floaty depending on viewport.
- Fix: add a slim sub-page topbar (menu icon ⟵ left, page title centered or kept left, notif/avatar right) at the top of `pg-products` and `pg-orders`, matching the `pg-home` topbar's height/spacing. Reduce `.page-header { margin-bottom }` from `1.25rem` to `0.75rem` so the list begins higher.
- No design overhaul, just align spacing so the title sits ~ same Y position as the home greeting does on `pg-home`.

## Files touched

- `src/components/dashboard/lateen/marketer.script.js`
  - `submitOrder` — gate DB write on `depositConfirmed === true`.
  - Disable submit button reactively (`updateSubmitState()` called from `setDeposit`, `onFileUpload`, etc.).
  - New `recomputeAnalytics()` building `chartData` + `analyticsData` from `orders`, called inside `loadOrders` and after submit; then `buildMainChart()` / `buildRingChart()`.
- `src/components/dashboard/lateen/business.script.js`
  - New `recomputeAnalytics()` (revenue / pieces / ring) called from `loadOrders` and after `advance`.
  - Update home stat cards from products + delivered orders.
- `src/components/dashboard/lateen/business.body.html`
  - Add sub-page topbar markup inside `pg-products` and `pg-orders` (above existing `page-header`).
- `src/styles/lateen-business.css` (or inline in business.body.html `<style>` block — match current pattern)
  - `.sub-topbar` styles + tighten `.page-header { margin-bottom }`.

## Out of scope

- No DB schema changes (the existing `orders.marketer_confirmed_at` + `pending` status are sufficient because rows now only exist post-confirmation).
- No changes to `confirm_order` / `mark_delivered` RPCs — already correct.
- No commission / wallet math changes.

## Verification

1. Marketer fills the form but does NOT upload receipt → "Add order" stays disabled. No DB row.
2. Uploads receipt + clicks "No" on deposit → still disabled, no DB row.
3. Clicks "Yes" → button enables. On submit a row is created with `marketer_confirmed_at` set, and instantly:
   - Marketer's order list shows it as "Fee paid".
   - Marketer's chart + ring repopulate.
   - Business owner's `pg-orders` shows the new "New order" with the receipt link.
4. Business clicks "Confirm order" → marketer wallet `pending` increases (already in RPC). Visible in marketer wallet card after auto-refresh.
5. Business clicks through to "Mark delivered" → home page Revenue / Sold / Delivered KPI + revenue chart bump up; marketer wallet `balance` increases, ring chart "Successful" count goes up.
6. Open business → `pg-products` and `pg-orders`: title sits near top of screen with a slim topbar, not floating mid-screen.
