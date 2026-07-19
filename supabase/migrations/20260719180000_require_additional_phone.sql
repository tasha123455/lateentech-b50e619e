-- ============================================================================
-- "Require Additional Phone Number from customer" business setting.
--
-- Lets a business owner require marketers to provide an additional
-- phone/WhatsApp number for the customer before an order can be submitted
-- for their products. When off (default), that field stays optional and
-- collapsed on the marketer's new-order form, same as before.
--
-- The master value lives on profiles (one row per business), set from the
-- toggle on the business "My products" page. A denormalized copy is kept
-- on products (same pattern already used for biz_name) because
-- products_marketer_view runs with security_invoker = true, and a marketer
-- cannot read another user's profiles row under RLS ("Users can view their
-- own profile" restricts profiles SELECT to auth.uid() = id), so the view
-- can't join profiles to read it directly.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS require_additional_phone boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS require_additional_phone boolean NOT NULL DEFAULT false;

-- Keep the marketer-facing view in sync with its current definition (same
-- columns/computed qty/filter as 20260719170000_add_product_cover_focus.sql),
-- plus the new column so the order form can tell whether it's mandatory.
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  cover_focus_x, cover_focus_y,
  status, biz_name, require_additional_phone, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL AND (qty - reserved_qty) > 0;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
