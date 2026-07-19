-- ============================================================================
-- Fix: a marketer's already-favorited product silently disappeared from
-- their Favorites list the moment it sold out (qty = 0), instead of staying
-- visible there greyed-out with an "out of stock" badge. Root cause:
-- products_marketer_view itself excluded qty = 0 products, so they never
-- reached the client at all — no client-side logic could have shown them.
--
-- Stock-based hiding for Browse, Suggestions, and the order product-picker
-- is already enforced client-side (see __productHasStock() in
-- marketer.script.js), so it's safe to stop filtering qty at the view level;
-- those three surfaces keep hiding out-of-stock products exactly as before,
-- while Favorites can now show them (greyed out).
-- ============================================================================
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
