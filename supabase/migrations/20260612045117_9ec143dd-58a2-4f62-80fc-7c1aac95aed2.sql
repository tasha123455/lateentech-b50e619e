CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can mark this order failed';
  END IF;

  IF o.status = 'cancelled' OR o.status = 'rejected' OR o.status = 'delivered' THEN
    RAISE EXCEPTION 'Order cannot be marked failed in its current state';
  END IF;

  -- If the order was already confirmed, restock product and revert sold/revenue
  IF o.status = 'confirmed' THEN
    UPDATE public.products
      SET qty = qty + o.qty,
          sold = GREATEST(sold - o.qty, 0),
          revenue = GREATEST(revenue - (o.unit_price * o.qty), 0)
      WHERE id = o.product_id;
  END IF;

  -- NOTE: Marketer commission and platform fees are non-refundable.
  -- Wallet credit was added at admin approval and remains with the marketer.

  UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = _order_id
    RETURNING * INTO o;

  RETURN o;
END;
$function$;