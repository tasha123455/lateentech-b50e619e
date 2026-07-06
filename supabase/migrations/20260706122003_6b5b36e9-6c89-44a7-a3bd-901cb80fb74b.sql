CREATE OR REPLACE FUNCTION public.marketer_reupload_receipt(_order_id uuid, _receipt_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _receipt_url IS NULL OR length(trim(_receipt_url)) = 0 THEN RAISE EXCEPTION 'Receipt URL required'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.marketer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF o.status NOT IN ('rejected','pending') THEN RAISE EXCEPTION 'Cannot re-upload receipt for order in status %', o.status; END IF;
  UPDATE public.orders
     SET receipt_url = _receipt_url,
         receipt_uploaded_at = now(),
         marketer_confirmed_at = now(),
         admin_notes = NULL,
         reviewed_at = NULL,
         status = 'pending'
   WHERE id = _order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.marketer_reupload_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketer_reupload_receipt(uuid, text) TO authenticated;