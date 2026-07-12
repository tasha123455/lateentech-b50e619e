
-- Add business_notes column so marketer sees rejection comment on order card
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_notes text;

-- Update mark_failed to also persist the note on the order row
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  clean_note text := NULLIF(trim(COALESCE(_note,'')), '');
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  IF o.status IN ('approved','confirmed') THEN
    UPDATE public.products SET qty = qty + o.qty WHERE id = o.product_id;
    IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.size, o.qty);
    END IF;
    IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.color, o.qty);
    END IF;
    IF o.status = 'confirmed' THEN
      UPDATE public.products SET sold = GREATEST(0, sold - o.qty),
                                 revenue = GREATEST(0, revenue - (o.unit_price * o.qty))
        WHERE id = o.product_id;
    END IF;
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         business_notes = clean_note
   WHERE id = _order_id
   RETURNING * INTO o;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

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
        'product_photo', photo,
        'qty', o.qty,
        'size', o.size,
        'color', o.color,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address,
        'customer_city', o.customer_city,
        'customer_country', o.customer_country,
        'customer_notes', o.customer_notes,
        'business_notes', clean_note
      )
    );

  RETURN o;
END;
$function$;
