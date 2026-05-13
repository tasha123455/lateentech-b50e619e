# Rebuild dashboards to full lateen.html parity

The current foundation only covers Home / Products / Alerts / Menu with mock cards. The source `lateen.html` actually defines two full mini-apps with many more pages, sheets, and interactions. This plan ports every one of them to real React components while preserving the exact look.

## What's in the source (verified by extracting DASH_HTML)

**Business (`role: business`)**
- Bottom nav: Home · Products · Orders · Menu
- Pages:
  - `pg-home` — balance card, payout sheet, stats row, revenue chart (D/M/Y, revenue/pieces toggle), analytics ring + legend
  - `pg-products` — product list with expandable cards, add/edit/delete, photo upload, variants (colors/sizes), zones/cities + currency dropdown, status toggle
  - `pg-orders` — filter tabs (all/new/confirmed/shipped/delivered/failed), order cards with advance actions (confirm → ship → deliver / fail)
  - `pg-notif` — grouped notifications (ok/info/warn/fail)
- Drawers/sheets: menu drawer (Home / My products / Orders / Notifications + sign out), payout sheet, product form overlay

**Marketer (`role: marketer`)**
- Bottom nav: Home · Browse · Saved · Orders · Menu
- Pages:
  - `pg-home` — earnings card, withdraw sheet (bank details, copy buttons, confirm), stats, chart (D/M/Y, earnings/pieces)
  - `pg-browse` — search, category chips (All/Beauty/Fashion/Fitness/Home/Nutrition/Tech), product grid, product detail sheet with variant pickers (color/size), deposit toggle, copy link, save
  - `pg-saved` — saved products list
  - `pg-orders` — manual order form (customer, address, qty +/-, deposit), order list with edit/delete (when editable), instructions sheet (fee breakdown)
  - `pg-notif` — notifications (reachable from menu)
- Drawers/sheets: menu drawer, withdraw sheet, product detail sheet, manual-order form, instructions sheet, camera/upload modal

## Approach

1. **Preserve the original CSS verbatim.** Drop the inline `<style>` blocks from each blob into `src/styles/lateen-business.css` and `src/styles/lateen-marketer.css`, scoped under `.lateen-business` / `.lateen-marketer` wrappers. This guarantees pixel parity with the file. Tailwind stays for layout outside the dashboard. (Same hex tokens are already in `styles.css` so the brand stays consistent.)

2. **One React component per logical page / sheet** — no giant strings, no `dangerouslySetInnerHTML`, no iframe.

```text
src/components/dashboard/
  business/
    BusinessDashboard.tsx        (shell + nav + page switcher + drawers)
    HomePage.tsx                 (balance, stats, chart, analytics ring)
    ProductsPage.tsx             (list, expand, status toggle)
    ProductForm.tsx              (add/edit: photos, variants, zones, currency)
    OrdersPage.tsx               (filter tabs, advance actions)
    NotificationsPage.tsx
    PayoutSheet.tsx
    MenuDrawer.tsx
  marketer/
    MarketerDashboard.tsx
    HomePage.tsx                 (earnings, stats, chart)
    BrowsePage.tsx               (search, category chips, grid)
    ProductDetailSheet.tsx       (variants, deposit, copy link, save)
    SavedPage.tsx
    OrdersPage.tsx               (list + edit/delete)
    ManualOrderForm.tsx          (customer, address, qty, deposit, submit)
    InstructionsSheet.tsx        (fee breakdown)
    WithdrawSheet.tsx            (bank details, copy, confirm)
    NotificationsPage.tsx
    MenuDrawer.tsx
  shared/
    BottomNav.tsx                (role-aware items)
    Topbar.tsx
    RingChart.tsx                (canvas → SVG donut)
    AreaChart.tsx                (SVG sparkline with D/M/Y + metric toggle)
```

3. **State** — each dashboard uses a local reducer (`useReducer`) for in-session data: products list, orders list, filters, active page, open sheet, form draft. Initial values come from `src/lib/mock-data.ts` (expanded to match the seed arrays in the source). All `onclick="addVariant"`, `advance`, `setFilter`, `sv`, `openD`, `submitOrder`, etc. become typed handlers on these reducers. Switching role still routes to the right dashboard via the existing `_authenticated /dashboard` gate.

4. **No new DB tables yet.** Auth + role tables stay as they are; products/orders/notifications remain mock until the international/inventory phase. That keeps this change focused on visual + interaction parity.

5. **Charts** — replace the Chart.js dependency with two small dependency-free SVG components (`AreaChart`, `RingChart`) that accept the same data shape and respond to the D/M/Y and revenue/pieces/earnings toggles.

6. **Verification**
   - At 420px viewport, side-by-side compare each page against the original blob (Home, Products, Add product form, Orders + each filter, Notifications, Menu, Payout — for marketer: Home, Browse, Product detail, Saved, Orders, Manual order form, Instructions, Withdraw, Menu).
   - Click every nav item and every sheet open/close in both roles.
   - Sign-out from menu still returns to landing.
   - Build passes.

## Out of scope (next phase, per your note)

- Persisting products/orders/notifications to Lovable Cloud
- International/inventory features
- Real payout/withdraw integrations

Once you approve, I'll port the CSS, create the components above, wire the reducers, and confirm parity at 420px before handing back.
