-- ============================================================================
-- Fix: the business dashboard's "Active marketers" figures (the per-product
-- Marketer info tile and the wallet Breakdown modal) undercount, because the
-- "Businesses view orders for their products" RLS policy deliberately hides
-- orders still in 'pending' status (awaiting admin receipt verification)
-- from the business owner — see migration
-- 20260524082735_277684a6-5c37-482e-aaa6-6b53f29fbd9f ("Hide pending orders
-- from businesses; only show admin-approved orders onward").
--
-- A marketer with a pending order still counts as "active" (same
-- pending/approved/confirmed rule the marketer app's live
-- active_marketers_count(s) RPC already uses), so the business dashboard's
-- local `orders` array — which simply never receives pending rows — will
-- always undercount by exactly those marketers until this is fixed.
--
-- This adds a narrow, count-oriented function that returns only
-- (marketer_id, product_id, created_at) for the calling business's own
-- pending orders — enough to fold pending orders into the existing
-- client-side "active marketers" calculations, without exposing customer
-- details, receipts, or anything else the original policy was protecting.
-- Scoped to auth.uid() internally (no caller-supplied business id) so a
-- business can only ever see stubs of its own pending orders.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pending_active_orders_for_business()
RETURNS TABLE(marketer_id uuid, product_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.marketer_id, o.product_id, o.created_at
  FROM public.orders o
  WHERE o.business_id = auth.uid()
    AND o.status = 'pending'
    AND o.marketer_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.pending_active_orders_for_business() IS 'Minimal (marketer_id, product_id, created_at) stubs for the calling business''s own pending orders — the one status the "Businesses view orders" RLS policy hides from businesses. Lets the business dashboard fold pending orders into its "Active marketers" figures (per-product tile + wallet breakdown) without exposing full order/customer detail.';

GRANT EXECUTE ON FUNCTION public.pending_active_orders_for_business() TO authenticated;
