
-- Admin approve: no more stock decrement here. Everything else (wallet credit,
-- notifications) is unchanged.
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  amt numeric;
  data_payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  UPDATE public.orders
    SET status = 'approved', reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;

  INSERT INTO public.wallets (user_id, balance)
    VALUES (o.marketer_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
    SET balance = COALESCE(balance, 0) + amt,
        withdraw_cycle_started_at = CASE
          WHEN COALESCE(balance, 0) < 20 AND COALESCE(balance, 0) + amt >= 20 THEN now()
          ELSE withdraw_cycle_started_at
        END,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  data_payload := jsonb_build_object(
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
    'customer_notes', o.customer_notes
  );

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_verified', 'Receipt Verified',
            'Your payment receipt has been verified. Your balance is now updated', data_payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'new_order', 'New order',
            'A new order has been received. Check the Orders page.', data_payload);

  RETURN o;
END;
$function$;

-- Business confirm: this is now the moment stock decreases. Fails atomically
-- if there isn't enough stock left at confirmation time.
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
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products
     SET qty = qty - o.qty,
         sold = sold + o.qty,
         revenue = revenue + (o.unit_price * o.qty)
   WHERE id = o.product_id;

  IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
    PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty);
  END IF;
  IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
    PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty);
  END IF;

  UPDATE public.orders
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = _order_id
   RETURNING * INTO o;

  RETURN o;
END;
$function$;

-- mark_failed: restore stock only when it was actually decremented (confirmed).
-- Approved-but-not-confirmed orders no longer touch stock, so nothing to restore.
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
 RETURNS orders
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

  IF o.status = 'confirmed' THEN
    UPDATE public.products
       SET qty = qty + o.qty,
           sold = GREATEST(0, sold - o.qty),
           revenue = GREATEST(0, revenue - (o.unit_price * o.qty))
     WHERE id = o.product_id;
    IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.size, o.qty);
    END IF;
    IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.color, o.qty);
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
