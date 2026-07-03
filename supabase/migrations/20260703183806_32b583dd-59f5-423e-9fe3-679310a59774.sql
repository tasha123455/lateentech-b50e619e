
-- 1) Recreate products_marketer_view with security_invoker so RLS applies to caller
ALTER VIEW public.products_marketer_view SET (security_invoker = true);

-- 2) Add marketer SELECT policy on products (active, non-deleted only)
DROP POLICY IF EXISTS "Marketers view active products" ON public.products;
CREATE POLICY "Marketers view active products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND deleted_at IS NULL
    AND public.has_role(auth.uid(), 'marketer')
  );

-- 3) Add UPDATE policy on receipts bucket so marketers can only overwrite their own files
DROP POLICY IF EXISTS "Receipts: owner updates own" ON storage.objects;
CREATE POLICY "Receipts: owner updates own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 4) Also enforce financial-field validation trigger on UPDATE (already runs on INSERT).
--    This guarantees unit_price/platform_fee/commission always mirror the referenced product.
DROP TRIGGER IF EXISTS trg_orders_validate_financial_update ON public.orders;
CREATE TRIGGER trg_orders_validate_financial_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.product_id IS DISTINCT FROM OLD.product_id
        OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
        OR NEW.platform_fee IS DISTINCT FROM OLD.platform_fee
        OR NEW.commission IS DISTINCT FROM OLD.commission)
  EXECUTE FUNCTION public.orders_validate_financial();
