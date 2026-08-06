-- Marketers can see reserve vs instant delivery. Again, this time by a route
-- that cannot quietly fail.
--
-- 20260806100000 added `fulfilment` to products_marketer_view with CREATE OR
-- REPLACE VIEW. That form can append a column but cannot renumber the ones
-- already there, so it only succeeds if the live view matches the definition
-- the migration was written against, column for column and in order. Where it
-- does not, Postgres refuses the whole statement —
--
--   ERROR: cannot change name of view column "reserved_qty" to "currency"
--
-- — and the column is never added. A migration run reports the error and moves
-- on; the app is left reading `fulfilment` as NULL and the badge never appears,
-- which looks exactly like the badge having been forgotten.
--
-- Dropping first sidesteps the column-order rule entirely: what follows is the
-- definition, not a diff against whatever is there. Nothing selects from this
-- view besides the marketer's browse query, so there is nothing downstream to
-- rebuild; CASCADE is how 20260720183505 replaced this same view.
--
-- Safe to run more than once, and safe to run when 20260806100000 already
-- worked — it lands on the same definition either way.

DROP VIEW IF EXISTS public.products_marketer_view CASCADE;

CREATE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  cover_focus_x, cover_focus_y,
  status, biz_name, require_additional_phone, created_at, updated_at, deleted_at,
  fulfilment
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;

NOTIFY pgrst, 'reload schema';
