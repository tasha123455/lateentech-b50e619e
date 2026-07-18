-- ============================================================================
-- Fix: products_marketer_view was hiding any product with 20 or fewer units
-- in stock (qty > 20), instead of only hiding products that are truly at
-- zero stock (qty > 0). This meant every "low stock" product (1-20 units)
-- was invisible to marketers at the database level, regardless of what the
-- client-side JS did. Introduced in 20260712120000_order_lifecycle_and_visibility_fixes.sql.
-- ============================================================================

-- 1) Backfill: recompute qty for existing products so it reflects the
--    bottleneck stock across variant groups (the smallest group total),
--    rather than the sum across all groups. A product with a "Size" group
--    and a "Colour" group represents ONE physical stock pool sliced two
--    ways, not two separate pools — summing them (as the old client code
--    did on save) double/triple-counted stock for any product with more
--    than one variant group.
DO $$
DECLARE
  rec RECORD;
  grp jsonb;
  item jsonb;
  grp_total numeric;
  grp_tracked boolean;
  min_total numeric;
  any_group_tracked boolean;
BEGIN
  FOR rec IN
    SELECT id, variant_groups, qty FROM public.products
    WHERE variant_groups IS NOT NULL
      AND jsonb_typeof(variant_groups) = 'array'
      AND jsonb_array_length(variant_groups) > 0
  LOOP
    min_total := NULL;
    any_group_tracked := false;
    FOR grp IN SELECT * FROM jsonb_array_elements(rec.variant_groups) LOOP
      grp_total := 0;
      grp_tracked := false;
      FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(grp->'items', '[]'::jsonb)) LOOP
        IF (item ? 'qty') AND (item->>'qty') IS NOT NULL AND (item->>'qty') <> '' THEN
          grp_tracked := true;
          grp_total := grp_total + GREATEST(0, COALESCE((item->>'qty')::numeric, 0));
        END IF;
      END LOOP;
      IF grp_tracked THEN
        any_group_tracked := true;
        IF min_total IS NULL OR grp_total < min_total THEN
          min_total := grp_total;
        END IF;
      END IF;
    END LOOP;
    IF any_group_tracked AND min_total IS NOT NULL AND min_total <> rec.qty THEN
      UPDATE public.products SET qty = min_total WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- 2) Fix the view: only hide products that are truly out of stock (qty = 0).
--    Low stock (1-20) must remain visible to marketers, with the client
--    showing a low-stock warning rather than hiding the product.
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL AND qty > 0;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
