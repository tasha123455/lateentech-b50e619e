## Goal
Show "Fees Collected This Month" and "Fees Collected This Year" alongside the existing lifetime "Total Platform Fees Collected" card on the admin home page, matching the existing dark bento style.

## Changes

**1. `src/lib/lateen-api.ts` — `admin.getMetrics()`**
- Replace the single `feesRes` query with a query that also returns `created_at` (still filtered to `status in ('confirmed','delivered')`).
- Compute three sums client-side, all using `platform_fee * qty`:
  - `totalFees` (lifetime, unchanged)
  - `feesThisMonth` (rows where `created_at >= start of current month`)
  - `feesThisYear` (rows where `created_at >= start of current year`)
- Return `feesThisMonth` and `feesThisYear` in the metrics object.

**2. `src/components/dashboard/lateen/admin.body.html`**
- Add two `.adm-stat` cards in the `#adm-home` grid right after the lifetime card:
  - `id="m-fees-month"` — label "Fees This Month", sub "Confirmed & delivered, current calendar month"
  - `id="m-fees-year"` — label "Fees This Year", sub "Confirmed & delivered, current calendar year"

**3. `src/components/dashboard/lateen/admin.script.js` — `admLoadMetrics()`**
- Set `m-fees-month` and `m-fees-year` text using existing `admMoney(...)` helper.

## Notes
- Month/year are computed in the client's local timezone (consistent with the existing "Leads Today" calculation which uses local midnight).
- No schema, RLS, or routing changes.
