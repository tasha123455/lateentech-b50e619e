
## Goal

Wire the Lateen app to a real backend so every Business and Marketer has their own data, products sync live in both directions, and stock decrements on confirmed sales. No more mock arrays in the embedded dashboard scripts.

## Database (one migration)

New tables in `public`, all with RLS:

- **`products`** — owned by a Business user.
  - `id`, `business_id` (uuid, FK→auth.users), `code`, `name`, `description`, `category`,
    `price` (numeric), `qty` (int), `currency` (jsonb: code/name/symbol/flag),
    `comm_pct`, `comm_fixed`, `comm_mode`, `platform_fee`, `total_fee_per_unit`,
    `variant_groups` (jsonb), `delivery` (jsonb zones/cities),
    `photos` (text[] of public URLs),
    `status` text check in (`active`,`paused`),  `sold` int default 0, `revenue` numeric default 0,
    `biz_name`, `biz_phone`, `created_at`, `updated_at`, `deleted_at` (nullable — soft delete so favorites can stay linked).
  - Indexes on `business_id`, `status`, `deleted_at`.

- **`favorites`** — `marketer_id`, `product_id` (FK→products on delete cascade), `created_at`. Unique(marketer_id,product_id).

- **`orders`** — `id`, `marketer_id`, `business_id`, `product_id`, `qty` int, `unit_price`, `commission`, `platform_fee`,
  `currency` (jsonb), `customer_name`, `customer_phone`, `customer_city`, `customer_country`,
  `status` text check in (`pending`,`confirmed`,`delivered`,`cancelled`),
  `created_at`, `confirmed_at`, `delivered_at`.

- **`wallets`** — one row per user: `user_id` PK, `balance` numeric default 0, `pending` numeric default 0, `currency` text default 'GBP', `updated_at`.

- **`payouts`** — `id`, `user_id`, `amount`, `status` (`requested`,`paid`,`failed`), `requested_at`, `paid_at`.

### RLS
- `products`: Businesses CRUD their own rows; Marketers (any authenticated user with role `marketer`) can `SELECT` rows where `status='active' AND deleted_at IS NULL`. Use `has_role(auth.uid(),'business')` / `'marketer'`.
- `favorites`: marketer reads/writes own rows only.
- `orders`: marketer reads/writes own; business reads orders for products they own; both can update only allowed status transitions via a security-definer RPC `confirm_order(order_id)` and `mark_delivered(order_id)`.
- `wallets`/`payouts`: user reads/writes own.

### Triggers / RPCs
- `set_updated_at` on `products`, `wallets`.
- **`confirm_order(order_id)`** SECURITY DEFINER: validates caller is the product's business, sets `status='confirmed'`, `confirmed_at=now()`, atomically decrements `products.qty` by `orders.qty` (raise if not enough stock), increments `products.sold` and `products.revenue`, adds commission to marketer's `wallets.pending`.
- **`mark_delivered(order_id)`**: moves marketer wallet `pending → balance`.
- **`handle_new_user`** already creates profile/role; extend it to also `INSERT INTO wallets(user_id) VALUES (new.id)`.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE products, favorites, orders, wallets;`

### Storage
- Public bucket `product-photos`. RLS: businesses upload to `<business_id>/...`; everyone can SELECT.

## Frontend wiring

The dashboard is a vanilla JS bundle (`business.script.js` / `marketer.script.js`) injected by `LateenShell`. Rather than rewriting it as React, expose a thin async API on `window` that the scripts call instead of mutating local arrays.

**New file `src/lib/lateen-api.ts`** — installed onto `window.LateenAPI` from `LateenShell` `useEffect` *before* injecting the script. Methods (all using `supabase` browser client, RLS-scoped):
- `listMyProducts()`, `upsertProduct(p)`, `deleteProduct(id)` (soft delete: `deleted_at=now(), status='paused'`), `setStatus(id, status)`.
- `uploadPhoto(file) → publicUrl`.
- `listBrowse({search,category})` — products where `status='active' AND deleted_at IS NULL`.
- `listFavorites()` — join favorites→products filtered to active+not-deleted.
- `addFavorite(productId)`, `removeFavorite(productId)`.
- `createOrder(...)`, `confirmOrder(id)`, `markDelivered(id)`.
- `getWallet()`, `requestPayout(amount)`.
- `subscribe(table, onChange)` returning unsubscribe — wraps Supabase realtime channels.

**Edit `business.script.js`**:
- Remove the seeded `products` array. On load, `window.LateenAPI.listMyProducts()` → render. Subscribe to `products` filtered by `business_id=auth.uid()` for live updates.
- `submitProduct` → `upsertProduct`. Photo step: replace the local data-URL array with `uploadPhoto` calls returning public URLs.
- `toggleStatus`, `deleteProduct` → backend calls; UI re-renders from realtime event.

**Edit `marketer.script.js`**:
- Remove demo browse/favorites arrays. `renderBrowse` queries `listBrowse`; `renderSaved` queries `listFavorites`. Subscribe to `products` (any change) and `favorites` (own) for live updates. Paused/deleted products disappear automatically because the realtime payload triggers a re-fetch through the same filter.
- "Save / unsave" buttons call `addFavorite` / `removeFavorite`.
- Order-confirmation flow calls `createOrder` then `confirmOrder` (when business confirms via their dashboard); stock decrement happens in the RPC.

**`LateenShell.tsx`**: in the `useEffect`, before injecting the script, do `window.LateenAPI = createLateenApi(supabase, user)` and after unmount delete it. Pass current `user.id` and `role`.

## Out of scope for this milestone
- Push notifications, payment processor integration (payouts stay as a `requested` row).
- Multi-currency conversion (each product keeps its own currency object).
- Admin moderation panel.

## Verification
1. Sign in as Business A → add a product with a photo. Sign in as Marketer in another browser → product appears in Browse without refresh.
2. Marketer favorites it → row in `favorites`. Business pauses product → product disappears from both Browse and Favorites view (favorite row preserved).
3. Business un-pauses → reappears in Marketer's Favorites instantly.
4. Marketer creates an order; Business confirms → `products.qty` decremented by 1, marketer wallet `pending` increases.
5. Hard delete (soft): product removed from all marketer views; favorites row remains but hidden by the active filter.
6. Sign out / sign in as a new account → empty product list, empty wallet, empty favorites (no leaked demo data).

## Technical notes
- All product-mutation paths go through Supabase with RLS; no service role needed in the browser.
- `confirm_order` is a SECURITY DEFINER RPC because it must touch products owned by another user atomically; it re-checks ownership inside the function.
- Soft delete chosen so historical orders keep a valid product FK and favorites can survive a temporary pause.
- Realtime channels are scoped per role/user to avoid noisy broadcasts.
