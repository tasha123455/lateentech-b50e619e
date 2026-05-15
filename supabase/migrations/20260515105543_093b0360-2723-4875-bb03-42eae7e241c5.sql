ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.admin_reject_order_with_notes(_order_id uuid, _notes text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o public.orders;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.orders
    SET status = 'rejected',
        admin_notes = _notes,
        reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o public.orders; p public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products SET qty = qty - o.qty, sold = sold + o.qty,
    revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;

  UPDATE public.orders SET status = 'confirmed', confirmed_at = now(), reviewed_at = now()
    WHERE id = _order_id RETURNING * INTO o;

  INSERT INTO public.wallets (user_id, pending)
    VALUES (o.marketer_id, o.commission * o.qty)
    ON CONFLICT (user_id) DO UPDATE
    SET pending = public.wallets.pending + EXCLUDED.pending, updated_at = now();

  RETURN o;
END $$;