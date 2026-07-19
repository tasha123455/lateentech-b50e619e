-- ============================================================================
-- Add an adjustable cover-photo focal point for products.
--
-- The marketer's browse-page card frame is short and wide (100% width x
-- 110px), so object-fit: cover on a portrait photo can crop out the most
-- important part of the image (e.g. showing only eyes/nose instead of the
-- full face). This lets the business owner drag the cover photo within the
-- "Add product" form to choose which part of the photo stays visible in
-- that frame, stored as a 0-100 percentage pair (mirrors CSS object-position),
-- defaulting to centered (50, 50).
-- ============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_focus_x numeric NOT NULL DEFAULT 50;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_focus_y numeric NOT NULL DEFAULT 50;

-- Keep the marketer-facing view in sync with the current definition (same
-- columns/computed qty/filter as 20260719090000_hold_stock_until_business_confirms.sql,
-- which subtracts reserved_qty from qty), plus the two new columns so the
-- browse card can read the saved focal point.
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  cover_focus_x, cover_focus_y,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL AND (qty - reserved_qty) > 0;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
