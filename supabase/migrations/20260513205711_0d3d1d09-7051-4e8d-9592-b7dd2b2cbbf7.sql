ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS marketer_confirmed_at timestamptz;

DROP POLICY IF EXISTS "Marketers update own pending orders" ON public.orders;
CREATE POLICY "Marketers update own pending orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (auth.uid() = marketer_id AND status = 'pending')
WITH CHECK (auth.uid() = marketer_id);

ALTER TABLE public.orders REPLICA IDENTITY FULL;