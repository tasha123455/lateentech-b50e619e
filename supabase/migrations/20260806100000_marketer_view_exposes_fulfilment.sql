-- Marketers can see whether a product is reserved or delivered instantly.
--
-- The badge was added to the product sheet and the browse tile at the same
-- time, and it worked everywhere the data came from the products table — the
-- admin's grid, the business's own listings, the shared public link, which got
-- the column in 20260805170000. It never appeared for a marketer, and the
-- reason was not the badge: marketers browse through products_marketer_view,
-- which was written before the choice existed and names its columns one by
-- one, so `fulfilment` simply was not among them. Every marketer read it as
-- NULL and the badge rendered nothing.
--
-- Appended at the end so CREATE OR REPLACE can keep the existing view: the
-- columns before it are unchanged, in the same order.

CREATE OR REPLACE VIEW public.products_marketer_view AS
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
