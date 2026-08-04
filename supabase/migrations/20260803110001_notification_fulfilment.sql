-- Order notifications say how the product is fulfilled.
--
-- The حجز / تسليم فوري choice is shown on the product card, on both browse
-- grids and on both order cards. The notification is the sixth place it was
-- asked for, and a notification is a snapshot — it carries its own copy of
-- the order's details rather than reading the product back at display time.
-- So the value has to go into the payload alongside the photo and the
-- variants that are already there.
--
-- Generated from each function's current definition with a single key added
-- next to 'product_photo'; nothing else about any of them changes. The value
-- is read off the product row the function has already loaded, so it is the
-- listing as it stood when the notification was sent.

CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; photo text; amt numeric; data_payload jsonb;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- Option B: the reservation placed when the marketer submitted the receipt is
  -- simply carried forward. No qty/reserved_qty/variant commit happens here —
  -- that is exclusively the business owner's confirm_order step.

  UPDATE public.orders SET status = 'approved', reviewed_at = now() WHERE id = _order_id RETURNING * INTO o;

  amt := o.commission * o.qty;

  INSERT INTO public.wallets (user_id, balance) VALUES (o.marketer_id, 0) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets
    SET balance = COALESCE(balance, 0) + amt,
        withdraw_cycle_started_at = CASE
          WHEN COALESCE(balance, 0) < 20 AND COALESCE(balance, 0) + amt >= 20 THEN now()
          ELSE withdraw_cycle_started_at END,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  data_payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'fulfilment', p.fulfilment,
    'qty', o.qty, 'size', o.size, 'color', o.color,
    'selected_variants', o.selected_variants,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'customer_whatsapp', o.customer_whatsapp, 'customer_address', o.customer_address,
    'customer_city', o.customer_city, 'customer_country', o.customer_country,
    'customer_notes', o.customer_notes);

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'receipt_verified', 'Receipt Verified',
            'Your payment receipt has been verified. Your balance is now updated', data_payload);
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.business_id, 'new_order', 'New order',
            'A new order has been received. Check the Orders page.', data_payload);

  RETURN o;
END; $function$;

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
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;

  PERFORM set_config('app.bypass_product_lock', 'on', true);
  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status NOT IN ('approved','confirmed','delivered') THEN
    RAISE EXCEPTION 'Only approved, confirmed or delivered orders can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;

  IF o.status = 'delivered' THEN
    UPDATE public.products
      SET sold = sold - o.qty,
          revenue = revenue - (o.unit_price * o.qty),
          updated_at = now()
      WHERE id = o.product_id;
  END IF;

  -- Admin comments live only in refund_note; business_notes is reserved for
  -- notes the business owner actually wrote themselves.
  UPDATE public.orders
    SET refunded_at = now(),
        refund_note = clean_comment,
        status = 'cancelled'
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;
  UPDATE public.wallets SET balance = balance - amt, updated_at = now() WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  payload := jsonb_build_object(
    'order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
    'product_id', o.product_id, 'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'fulfilment', p.fulfilment,
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
      'Order ' || COALESCE(p.name, '') || ' refunded for customer ' || COALESCE(o.customer_name, ''), payload);

  RETURN o;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_reject_order_with_notes(_order_id uuid, _notes text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  receipt text;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT receipt_url INTO receipt FROM public.orders WHERE id = _order_id;
  UPDATE public.orders
    SET status = 'rejected',
        admin_notes = _notes,
        reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'receipt_rejected',
      'Receipt rejected by the admin',
      COALESCE(_notes, ''),
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo, 'fulfilment', p.fulfilment,
        'receipt_url', receipt,
        'admin_notes', _notes,
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
        'customer_notes', o.customer_notes
      )
    );

  RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark delivered'; END IF;
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_delivered', 'Order Delivered', 'The customer has received the product',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'fulfilment', p.fulfilment, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes));
  RETURN o;
END;
$function$;

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
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  UPDATE public.orders SET status = 'cancelled', business_notes = clean_note WHERE id = _order_id RETURNING * INTO o;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_failed', 'Order failed',
      COALESCE(p.name, 'Order') || ' marked failed by business',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'fulfilment', p.fulfilment, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END; $function$;

NOTIFY pgrst, 'reload schema';
