-- 1) admin_approve_order: keep the reservation, do NOT commit the decrement.
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders; p public.products; photo text; amt numeric; data_payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
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
    'product_name', COALESCE(p.name, ''), 'product_photo', photo,
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

-- 2) confirm_order: the ONLY place the reservation becomes a committed sale.
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

  -- Convert the held reservation into a committed decrement.
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

  UPDATE public.products
    SET sold = sold + o.qty,
        revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;

  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END; $function$;

-- 3) Release path: 'approved' is now only-reserved, not committed.
CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE updated_id uuid; v jsonb; vval text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);

  IF NEW.status = 'pending' AND NEW.receipt_url IS NOT NULL AND btrim(NEW.receipt_url) <> '' AND NOT COALESCE(NEW.stock_reserved, false) THEN
    UPDATE public.products SET reserved_qty = reserved_qty + NEW.qty
      WHERE id = NEW.product_id AND (qty - reserved_qty) >= NEW.qty RETURNING id INTO updated_id;
    IF updated_id IS NULL THEN RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001'; END IF;

    IF jsonb_array_length(COALESCE(NEW.selected_variants, '[]'::jsonb)) > 0 THEN
      FOR v IN SELECT * FROM jsonb_array_elements(NEW.selected_variants) LOOP
        vval := v->>'value';
        IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, vval, NEW.qty); END IF;
      END LOOP;
    ELSE
      IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.size, NEW.qty); END IF;
      IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.color, NEW.qty); END IF;
    END IF;

    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.stock_reserved, false) = true
     AND NEW.status IN ('rejected','cancelled') AND OLD.status NOT IN ('rejected','cancelled') THEN
    -- Option B: stock is only committed at business-owner confirmation, so
    -- 'confirmed'/'delivered' give real qty back, while 'pending'/'approved'
    -- merely release the hold.
    IF OLD.status IN ('confirmed','delivered') THEN
      UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;
      IF jsonb_array_length(COALESCE(OLD.selected_variants, '[]'::jsonb)) > 0 THEN
        FOR v IN SELECT * FROM jsonb_array_elements(OLD.selected_variants) LOOP
          vval := v->>'value';
          IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, vval, OLD.qty); END IF;
        END LOOP;
      ELSE
        IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty); END IF;
        IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty); END IF;
      END IF;
    ELSE
      UPDATE public.products SET reserved_qty = GREATEST(0, reserved_qty - OLD.qty) WHERE id = OLD.product_id;
      IF jsonb_array_length(COALESCE(OLD.selected_variants, '[]'::jsonb)) > 0 THEN
        FOR v IN SELECT * FROM jsonb_array_elements(OLD.selected_variants) LOOP
          vval := v->>'value';
          IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._adjust_variant_rsv(OLD.product_id, vval, -OLD.qty); END IF;
        END LOOP;
      ELSE
        IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN PERFORM public._adjust_variant_rsv(OLD.product_id, OLD.size, -OLD.qty); END IF;
        IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN PERFORM public._adjust_variant_rsv(OLD.product_id, OLD.color, -OLD.qty); END IF;
      END IF;
    END IF;
    NEW.stock_reserved := false;
  END IF;

  RETURN NEW;
END; $function$;