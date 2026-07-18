-- The business dashboard used to display an order's "number" as the first
-- 8 characters of its UUID primary key. That's just a truncated slice of a
-- random UUID, so it isn't guaranteed unique across the platform, and it
-- looks visually similar to nothing else -- it wasn't a deliberate, stable
-- order code.
--
-- This adds a dedicated order_number column with its own uniqueness
-- guarantee (enforced here at the database level) and a format that can't
-- collide with, or be mistaken for, a product code (which uses an "LT-"
-- prefix). The actual value is generated app-side at insert time, with a
-- retry-and-lengthen strategy on collision -- the same approach already
-- used for product codes.
--
-- A plain (non-partial) unique index is used because Postgres treats NULLs
-- as distinct from one another in a unique index, so existing historical
-- orders (which will have a NULL order_number) are unaffected.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique
  ON public.orders (order_number);
