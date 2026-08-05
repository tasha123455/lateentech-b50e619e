-- ============================================================================
-- The shared product link can say whether a product is reserved or delivered
-- instantly.
--
-- The badge is on the browse tile and the dashboards' product sheets, but the
-- link a marketer sends a customer reads from products_public_view, and that
-- view was written before the choice existed. Adding the column is the whole
-- change: the view already filters to active, undeleted products, and
-- fulfilment is no more sensitive than the price beside it.
-- ============================================================================

CREATE OR REPLACE VIEW public.products_public_view WITH (security_invoker=true) AS
SELECT id, business_id, name, code, category, description, price, currency,
       photos, sizes, colors, variant_groups, qty, reserved_qty, status,
       deleted_at, delivery, biz_name, cover_focus_x, cover_focus_y,
       fulfilment
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
