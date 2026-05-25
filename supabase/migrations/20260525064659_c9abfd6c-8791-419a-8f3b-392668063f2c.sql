
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  amt NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  UPDATE public.orders
    SET status = 'approved', reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;

  INSERT INTO public.wallets (user_id, balance)
    VALUES (o.marketer_id, amt)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = public.wallets.balance + EXCLUDED.balance,
                  updated_at = now();

  RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
 RETURNS orders
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

  RETURN o;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can mark delivered';
  END IF;

  IF o.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Order is not confirmed';
  END IF;

  UPDATE public.orders
    SET status = 'delivered', delivered_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  RETURN o;
END;
$function$;
