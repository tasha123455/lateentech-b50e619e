DROP POLICY IF EXISTS "Businesses view orders for their products" ON public.orders;
CREATE POLICY "Businesses view orders for their products"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id AND status IN ('approved','confirmed','delivered'));