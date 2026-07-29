-- Track which products were auto-paused by an admin freeze so unfreeze can restore them
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS frozen_paused boolean NOT NULL DEFAULT false;

-- Freeze/unfreeze cascades to the business owner's products
CREATE OR REPLACE FUNCTION public.admin_set_user_frozen(_user_id uuid, _frozen boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
     SET frozen_at = CASE WHEN _frozen THEN now() ELSE NULL END
   WHERE id = _user_id;

  PERFORM set_config('app.bypass_product_lock', 'on', true);

  IF _frozen THEN
    UPDATE public.products
       SET status = 'paused', frozen_paused = true, updated_at = now()
     WHERE business_id = _user_id
       AND deleted_at IS NULL
       AND status = 'active';
  ELSE
    UPDATE public.products
       SET status = 'active', frozen_paused = false, updated_at = now()
     WHERE business_id = _user_id
       AND deleted_at IS NULL
       AND frozen_paused = true
       AND status = 'paused';
    UPDATE public.products
       SET frozen_paused = false
     WHERE business_id = _user_id AND frozen_paused = true;
  END IF;
END;
$function$;

-- A frozen business owner cannot re-activate or publish products
CREATE OR REPLACE FUNCTION public.products_block_frozen_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.bypass_product_lock', true) = 'on' THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND public.is_business_frozen(NEW.business_id) THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator — products cannot be activated until it is unfrozen.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_block_frozen_activation_trg ON public.products;
CREATE TRIGGER products_block_frozen_activation_trg
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_block_frozen_activation();

-- Frozen business owners cannot act on orders
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
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
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

  -- sold / revenue are counted exclusively at delivery (mark_delivered).
  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END; $function$;

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
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'customer_name', o.customer_name,
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
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END; $function$;

-- Refund notice to the business owner: exact requested wording
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

  IF o.status = 'delivered' THEN
    UPDATE public.products
      SET sold = sold - o.qty,
          revenue = revenue - (o.unit_price * o.qty),
          updated_at = now()
      WHERE id = o.product_id;
  END IF;

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
      'Order ' || COALESCE(p.name, '') || ' refunded for customer ' || COALESCE(o.customer_name, ''), payload);

  RETURN o;
END; $function$;