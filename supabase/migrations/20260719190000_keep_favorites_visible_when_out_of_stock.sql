-- ============================================================================
-- Fix: a marketer's already-favorited product silently disappeared from
-- their Favorites list the moment it sold out (or became fully reserved by
-- pending orders), instead of staying visible there greyed-out with an
-- "out of stock" badge. Root cause: products_marketer_view itself excluded
-- any row where (qty - reserved_qty) <= 0, so those products never reached
-- the client at all — no client-side logic could have shown them.
--
-- Stock-based hiding for Browse, Suggestions, and the order product-picker
-- is already enforced client-side (see __productHasStock() in
-- marketer.script.js, which checks the same available-qty number this view
-- already computes), so it's safe to stop filtering rows out at the view
-- level; those three surfaces keep hiding out-of-stock products exactly as
-- before, while Favorites can now show them (greyed out).
--
-- Same column list/computed qty as 20260719180000_require_additional_phone.sql
-- (the current definition) — only the trailing stock condition is removed.
-- ============================================================================
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  cover_focus_x, cover_focus_y,
  status, biz_name, require_additional_phone, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
