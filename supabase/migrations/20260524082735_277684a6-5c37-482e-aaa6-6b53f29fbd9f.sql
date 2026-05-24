-- Hide pending orders from businesses; only show admin-approved orders onward
DROP POLICY IF EXISTS "Businesses view orders for their products" ON public.orders;
CREATE POLICY "Businesses view orders for their products"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id AND status <> 'pending');

-- Admin approval: only flip status to 'approved'. No stock change, no wallet credit.
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  UPDATE public.orders
    SET status = 'approved', reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;
  RETURN o;
END $function$;

-- Business confirmation: now requires status='approved'. Decrements stock and credits marketer.
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can confirm this order';
  END IF;

  IF o.status <> 'approved' THEN
    RAISE EXCEPTION 'Order has not been approved by admin yet';
  END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF p.qty < o.qty THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  UPDATE public.products
    SET qty = qty - o.qty,
        sold = sold + o.qty,
        revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;

  UPDATE public.orders
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  INSERT INTO public.wallets (user_id, pending)
    VALUES (o.marketer_id, o.commission * o.qty)
    ON CONFLICT (user_id)
    DO UPDATE SET pending = public.wallets.pending + EXCLUDED.pending,
                  updated_at = now();

  RETURN o;
END;
$function$;