-- ============================================================================
-- 1) Track "last activity" on orders so lists can sort by most-recent action
--    (status change, edit, receipt re-upload) instead of created_at.
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows so updated_at is never null/older than created_at.
UPDATE public.orders SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.orders_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON public.orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_touch_updated_at();

COMMENT ON COLUMN public.orders.updated_at IS 'Bumped automatically on every update (status change, edit, receipt re-upload). Used to sort order lists by most-recent action.';

-- ============================================================================
-- 2) Active Marketers (per product): distinct marketers who currently have at
--    least one order for that product in status pending, draft (client-only,
--    not represented in DB), or approved-but-not-yet-delivered.
--    Since drafts never reach the DB, "active" here counts DB rows in
--    ('pending','approved'). Delivered, rejected, cancelled (failed), or a
--    deleted order/product never count. This is computed fresh every call so
--    it is always correct/live, with no separate counter to drift.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.active_marketers_count(_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT o.marketer_id)::int
  FROM public.orders o
  WHERE o.product_id = _product_id
    AND o.status IN ('pending', 'approved', 'confirmed');
$$;

-- Bulk variant used by the business dashboard so one round-trip can compute
-- the count for every product a business owner has, instead of N calls.
CREATE OR REPLACE FUNCTION public.active_marketers_counts(_product_ids uuid[])
RETURNS TABLE(product_id uuid, active_marketers integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.product_id, COUNT(DISTINCT o.marketer_id)::int
  FROM public.orders o
  WHERE o.product_id = ANY(_product_ids)
    AND o.status IN ('pending', 'approved', 'confirmed')
  GROUP BY o.product_id;
$$;

COMMENT ON FUNCTION public.active_marketers_count(uuid) IS 'Live count of distinct marketers with a pending/approved (not-yet-delivered) order for a product. Recomputed on every call so it can never drift.';
COMMENT ON FUNCTION public.active_marketers_counts(uuid[]) IS 'Bulk version of active_marketers_count for a list of product ids, used by the business product list/analytics so both views share one source of truth.';

GRANT EXECUTE ON FUNCTION public.active_marketers_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_marketers_counts(uuid[]) TO authenticated;
