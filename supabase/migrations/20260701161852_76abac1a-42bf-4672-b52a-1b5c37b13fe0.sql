
ALTER TABLE public.products DROP COLUMN IF EXISTS biz_phone;

DROP POLICY IF EXISTS "Marketers update own pending orders" ON public.orders;
CREATE POLICY "Marketers update own pending orders" ON public.orders
  FOR UPDATE
  USING (auth.uid() = marketer_id AND status = 'pending')
  WITH CHECK (auth.uid() = marketer_id AND status = 'pending');

ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pg_temp;
