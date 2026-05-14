# System Admin Dashboard

A third role — **admin** — with its own dashboard at `/admin`, built with the same dark bento HTML/JS pattern as the marketer/business dashboards. Only your account can access it.

## 1. Database changes (one migration)

- Extend `app_role` enum: add `'admin'`.
- Update `handle_new_user()` so new signups never get admin (default stays `marketer`).
- Insert one `user_roles` row granting `admin` to your account — **I need your account email** to look up the user_id.
- Add RLS policies for admin scope:
  - `orders`: admin can SELECT all, UPDATE all (for approve/reject).
  - `products`: admin can SELECT all and UPDATE `status` (for hide).
  - `payouts`: admin can SELECT all and UPDATE status to `'paid'`.
  - `profiles`: admin can SELECT all (User Directory).
  - `wallets`: admin can SELECT all and UPDATE (zero out on payout).
- Add SECURITY DEFINER functions:
  - `admin_approve_order(order_id)` — sets status `'confirmed'`, decrements stock, credits marketer wallet pending (mirrors existing `confirm_order`).
  - `admin_reject_order(order_id, reason)` — sets status `'rejected'`, clears `receipt_url`.
  - `admin_mark_payout_paid(payout_id)` — sets payout `status='paid'`, `paid_at=now()`, decrements wallet `balance` by amount.
  - `admin_hide_product(product_id)` / `admin_unhide_product(product_id)` — toggles `products.status` between `'active'` and `'hidden'`.
  - All functions check `has_role(auth.uid(), 'admin')` first.

## 2. Routing & access control

- New route `src/routes/admin.tsx` — gated like `/dashboard`: redirects to `/` if not signed in or role ≠ `'admin'`.
- Update `/dashboard` so an admin role lands on the admin shell instead of marketer/business.
- Add a small "Admin" link on the landing page footer (only visible if signed in as admin) for direct access.

## 3. Admin dashboard files (matching existing Lateen pattern)

- `src/components/dashboard/lateen/admin.body.html` — dark bento layout with topbar + bottom nav and these pages:
  1. **Home** — Global Analytics widgets: Total Platform Fees Collected (sum of `orders.platform_fee * qty` where status in confirmed/delivered), Active Users (distinct users with activity in last 30d), Total Leads Generated Today (count of orders created today).
  2. **Verification** — Order Verification Hub: list of orders where `status='pending' AND receipt_url IS NOT NULL`. Each row: marketer name, fee amount, receipt thumbnail. Tap row → expands to full receipt image with **Approve** / **Reject** buttons.
  3. **Payouts** — table of all payout requests (status `'requested'`), shows marketer name, amount, requested time. **Paid** button calls `admin_mark_payout_paid`.
  4. **Users** — searchable list of all profiles with role badge (Marketer/Business). Search filters by name/phone/business name.
  5. **Products** — gallery grid of every product across the platform with photo, name, shop, price. Each card has a **Hide** / **Unhide** toggle.
- `src/components/dashboard/lateen/admin.script.js` — Chart.js for the analytics chart, page switching, search, action handlers (calls `window.LateenAPI.admin.*`).
- `src/styles/lateen-admin.css` — same dark bento tokens as marketer/business with a distinct accent color (e.g. amber) so admin is visually distinguishable.

## 4. API layer

- Extend `src/lib/lateen-api.ts` with an `admin` namespace:
  - `listPendingReceipts()`, `approveOrder(id)`, `rejectOrder(id, reason)`
  - `listPayoutRequests()`, `markPayoutPaid(id)`
  - `listAllProfiles(search?)`
  - `listAllProducts()`, `hideProduct(id)`, `unhideProduct(id)`
  - `getGlobalMetrics()` — fees, active users, today's leads
- All call Supabase via the user session; RLS + SECURITY DEFINER functions enforce admin-only.

## 5. Wiring into LateenShell

- Add `'admin'` as a third `Role` in `LateenShell.tsx` and import `admin.body.html` + `admin.script.js`.
- AuthContext already exposes role; extend the `Role` type to include `'admin'`.

## What I need from you to start

**Your account email** — so the migration can grant `admin` to your existing user_id. Without it I can either:
- (a) prompt you for it before the migration, or
- (b) leave a placeholder UUID in the migration that you fill in when approving.

## Technical notes

- Receipt thumbnails: receipts are uploaded to a Supabase storage bucket (need to confirm bucket name from existing `uploadReceipt`); admin reads via signed URL or public URL depending on bucket setting.
- "Active Users" is defined as users with at least one order created or product touched in the last 30 days (cheap query, no new tables).
- "Hide" sets `products.status='hidden'`; existing marketer-browse RLS already filters on `status='active'`, so hidden products disappear automatically — no extra code needed there.
- Suspend account: deferred per your answer; UI shows a disabled toggle with "coming soon" tooltip so the layout is ready.
