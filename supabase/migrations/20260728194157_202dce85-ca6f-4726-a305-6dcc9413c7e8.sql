CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  amt numeric;
  photo text;
  was_stocked boolean;
  sold_mult integer := 0;
  v jsonb;
  vval text;
  payload jsonb;
  clean_comment text := NULLIF(trim(COALESCE(_comment, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  PERFORM set_config('app.bypass_product_lock', 'on', true);
  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status NOT IN ('approved','confirmed','delivered') THEN
    RAISE EXCEPTION 'Only approved, confirmed or delivered orders can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order has already been refunded';
  END IF;

  was_stocked := o.status IN ('confirmed','delivered');
  -- confirm_order counts sold/revenue once; mark_delivered counts them again,
  -- so a delivered order must be reversed twice to leave zero trace.
  IF o.status = 'confirmed' THEN sold_mult := 1; END IF;
  IF o.status = 'delivered' THEN sold_mult := 2; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;

  IF was_stocked AND FOUND THEN
    UPDATE public.products
      SET qty = qty + o.qty,
          sold = GREATEST(0, sold - (o.qty * sold_mult)),
          revenue = GREATEST(0, revenue - (o.unit_price * o.qty * sold_mult)),
          updated_at = now()
      WHERE id = o.product_id;

    IF jsonb_array_length(COALESCE(o.selected_variants, '[]'::jsonb)) > 0 THEN
      FOR v IN SELECT * FROM jsonb_array_elements(o.selected_variants) LOOP
        vval := v->>'value';
        IF vval IS NOT NULL AND btrim(vval) <> '' THEN
          PERFORM public._adjust_variant_qty(o.product_id, vval, o.qty);
        END IF;
      END LOOP;
    ELSE
      IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.size, o.qty); END IF;
      IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.color, o.qty); END IF;
    END IF;
  END IF;

  UPDATE public.orders
    SET refunded_at = now(),
        refund_note = clean_comment,
        status = 'cancelled',
        business_notes = COALESCE(clean_comment, business_notes)
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;
  UPDATE public.wallets
    SET balance = balance - amt,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  payload := jsonb_build_object(
    'order_id', o.id,
    'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_id', o.product_id,
    'product_name', COALESCE(p.name, ''),
    'product_photo', photo,
    'amount', amt,
    'qty', o.qty,
    'size', o.size,
    'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp,
    'customer_address', o.customer_address,
    'customer_city', o.customer_city,
    'customer_country', o.customer_country,
    'customer_notes', o.customer_notes,
    'admin_comment', clean_comment,
    'admin_note', clean_comment
  );

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_refunded',
      'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      payload
    );

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.business_id,
      'order_refunded',
      'Order refunded',
      'This order was refunded by the admin and no longer counts toward your earnings.',
      payload
    );

  RETURN o;
END;
$function$;