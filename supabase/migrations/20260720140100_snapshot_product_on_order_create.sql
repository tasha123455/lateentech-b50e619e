-- ============================================================================
-- Freeze product name/code/photos/category onto each order at the moment
-- it's created, so historical orders keep showing what the customer
-- actually ordered even if the business later edits or renames the
-- product.
--
-- The app's order lists fall back to a live join against products for
-- any order created before this column existed (product_snapshot IS
-- NULL), so old orders keep working exactly as before.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.orders_capture_product_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_snapshot IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'name', p.name,
      'code', p.code,
      'photos', p.photos,
      'category', p.category
    )
    INTO NEW.product_snapshot
    FROM public.products p
    WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_capture_product_snapshot ON public.orders;
CREATE TRIGGER trg_orders_capture_product_snapshot
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_capture_product_snapshot();

COMMENT ON COLUMN public.orders.product_snapshot IS 'Product name/code/photos/category captured at order-creation time so historical orders never change if the product is edited or renamed later. NULL on orders created before this column existed — the app falls back to a live join for those.';
