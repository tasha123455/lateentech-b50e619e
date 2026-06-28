
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;

CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can mark this order failed';
  END IF;

  IF o.status = 'cancelled' OR o.status = 'rejected' OR o.status = 'delivered' THEN
    RAISE EXCEPTION 'Order cannot be marked failed in its current state';
  END IF;

  IF o.status = 'confirmed' THEN
    UPDATE public.products SET qty = qty + o.qty WHERE id = o.product_id;
  END IF;

  UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = _order_id
    RETURNING * INTO o;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_failed',
      'Order failed',
      COALESCE(p.name, 'Order') || ' marked failed by business',
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'qty', o.qty,
        'size', o.size,
        'color', o.color,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address,
        'customer_city', o.customer_city,
        'customer_country', o.customer_country,
        'customer_notes', o.customer_notes
      )
    );

  RETURN o;
END;
$function$;
