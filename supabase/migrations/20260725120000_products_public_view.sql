-- ============================================================================
-- Public product share links (/p/:id) currently fail for anonymous visitors
-- and non-marketer roles: the page queries public.products directly, but the
-- only SELECT policies on that table are "Business owners manage own
-- products" (owner only) and "Marketers view active products" (requires an
-- authenticated user with the marketer role). Signed-out visitors have no
-- read access at all, so the page falls back to "This product is no longer
-- available."
--
-- Fix: a narrow public view exposing only the fields the share page needs
-- for active, non-deleted products. It intentionally leaves out commission
-- %, cost price, sold/revenue, and biz_phone so those stay private and
-- aren't exposed to anyone who opens a shared link.
--
-- Deliberately NOT setting security_invoker = true here: the view runs with
-- the privileges of its owner (which is exempt from the products table's
-- RLS, same as any other migration-created object), so row visibility is
-- governed only by this view's own WHERE clause rather than the underlying
-- table's marketer-only policy.
-- ============================================================================
CREATE OR REPLACE VIEW public.products_public_view AS
SELECT
  id, business_id, name, code, category, description,
  price, currency, photos, sizes, colors, variant_groups,
  qty, reserved_qty, status, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

GRANT SELECT ON public.products_public_view TO anon, authenticated;
