-- 1. confirm_order: stock commit only, no sold/revenue counting
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; v jsonb; vval text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF COALESCE(o.stock_reserved, false) THEN
    IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
    UPDATE public.products
      SET qty = qty - o.qty,
          reserved_qty = GREATEST(0, reserved_qty - o.qty)
      WHERE id = o.product_id;

    IF jsonb_array_length(COALESCE(o.selected_variants, '[]'::jsonb)) > 0 THEN
      FOR v IN SELECT * FROM jsonb_array_elements(o.selected_variants) LOOP
        vval := v->>'value';
        IF vval IS NOT NULL AND btrim(vval) <> '' THEN
          PERFORM public._adjust_variant_qty(o.product_id, vval, -o.qty);
          PERFORM public._adjust_variant_rsv(o.product_id, vval, -o.qty);
        END IF;
      END LOOP;
    ELSE
      IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
        PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty);
        PERFORM public._adjust_variant_rsv(o.product_id, o.size, -o.qty);
      END IF;
      IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
        PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty);
        PERFORM public._adjust_variant_rsv(o.product_id, o.color, -o.qty);
      END IF;
    END IF;
  END IF;

  -- NOTE: sold / revenue are counted exclusively at delivery (mark_delivered).
  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END; $function$;

-- 2. mark_failed (1-arg): no manual stock restore (the reserve trigger does it), no sold changes
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  -- Stock restore is handled by orders_reserve_stock_trg on the status change.
  -- sold/revenue are never touched here: they are only counted at delivery.
  UPDATE public.orders SET status = 'cancelled' WHERE id = _order_id RETURNING * INTO o;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_failed', 'Order failed',
      COALESCE(p.name, 'Order') || ' marked failed by business',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'qty', o.qty, 'size', o.size, 'color', o.color,
        'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
        'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
        'customer_city', o.customer_city, 'customer_country', o.customer_country,
        'customer_notes', o.customer_notes));
  RETURN o;
END; $function$;

-- 3. mark_failed (2-arg): same, no sold/revenue adjustment
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text; clean_note text := NULLIF(trim(COALESCE(_note,'')), '');
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  -- Stock restore handled by orders_reserve_stock_trg; sold/revenue only count at delivery.
  UPDATE public.orders SET status = 'cancelled', business_notes = clean_note WHERE id = _order_id RETURNING * INTO o;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_failed', 'Order failed',
      COALESCE(p.name, 'Order') || ' marked failed by business',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END; $function$;

-- 4. admin_refund_order: reverse exactly what delivery counted, allow negatives
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; amt numeric; photo text; payload jsonb;
  clean_comment text := NULLIF(trim(COALESCE(_comment, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  PERFORM set_config('app.bypass_product_lock', 'on', true);
  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status NOT IN ('approved','confirmed','delivered') THEN
    RAISE EXCEPTION 'Only approved, confirmed or delivered orders can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;

  -- sold/revenue were only ever incremented at delivery, so only a delivered
  -- order reverses them — exactly once, and totals may go negative.
  IF o.status = 'delivered' THEN
    UPDATE public.products
      SET sold = sold - o.qty,
          revenue = revenue - (o.unit_price * o.qty),
          updated_at = now()
      WHERE id = o.product_id;
  END IF;

  -- Stock restoration (full qty for confirmed/delivered, reservation release
  -- otherwise) is handled by orders_reserve_stock_trg on this status change.
  UPDATE public.orders
    SET refunded_at = now(),
        refund_note = clean_comment,
        status = 'cancelled',
        business_notes = COALESCE(clean_comment, business_notes)
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;
  UPDATE public.wallets SET balance = balance - amt, updated_at = now() WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_id', o.product_id, 'product_name', COALESCE(p.name, ''), 'product_photo', photo,
    'amount', amt, 'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes,
    'admin_comment', clean_comment, 'admin_note', clean_comment);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_refunded', 'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'order_refunded', 'Order refunded',
      'This order was refunded by the admin and no longer counts toward your earnings.', payload);

  RETURN o;
END; $function$;