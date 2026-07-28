
-- adjust a variant item's reserved counter (rsv) inside products.variant_groups
CREATE OR REPLACE FUNCTION public._adjust_variant_rsv(_product_id uuid, _match text, _delta integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE vg jsonb; new_vg jsonb := '[]'::jsonb; grp jsonb; items jsonb; new_items jsonb; it jsonb; matched boolean := false;
BEGIN
  IF _match IS NULL OR btrim(_match) = '' THEN RETURN; END IF;
  SELECT variant_groups INTO vg FROM public.products WHERE id = _product_id FOR UPDATE;
  IF vg IS NULL OR jsonb_typeof(vg) <> 'array' THEN RETURN; END IF;
  FOR grp IN SELECT * FROM jsonb_array_elements(vg) LOOP
    items := COALESCE(grp->'items','[]'::jsonb);
    new_items := '[]'::jsonb;
    FOR it IN SELECT * FROM jsonb_array_elements(items) LOOP
      IF NOT matched AND lower(COALESCE(it->>'val','')) = lower(_match) THEN
        it := jsonb_set(it, '{rsv}', to_jsonb(GREATEST(0, COALESCE((it->>'rsv')::int,0) + _delta)));
        matched := true;
      END IF;
      new_items := new_items || it;
    END LOOP;
    grp := jsonb_set(grp, '{items}', new_items);
    new_vg := new_vg || grp;
  END LOOP;
  UPDATE public.products SET variant_groups = new_vg WHERE id = _product_id;
END; $$;

-- atomic: verify available (qty - rsv) then hold it
CREATE OR REPLACE FUNCTION public._reserve_variant_qty_check(_product_id uuid, _match text, _qty integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE vg jsonb; grp jsonb; it jsonb; q integer; rsv integer; matched boolean := false;
BEGIN
  IF _match IS NULL OR btrim(_match) = '' THEN RETURN; END IF;
  SELECT variant_groups INTO vg FROM public.products WHERE id = _product_id FOR UPDATE;
  IF vg IS NULL OR jsonb_typeof(vg) <> 'array' THEN RETURN; END IF;
  FOR grp IN SELECT * FROM jsonb_array_elements(vg) LOOP
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(grp->'items','[]'::jsonb)) LOOP
      IF NOT matched AND lower(COALESCE(it->>'val','')) = lower(_match) THEN
        matched := true;
        IF (it ? 'qty') AND (it->>'qty') IS NOT NULL AND (it->>'qty') <> '' THEN
          q := COALESCE((it->>'qty')::int, 0);
          rsv := COALESCE((it->>'rsv')::int, 0);
          IF (q - rsv) < _qty THEN
            RAISE EXCEPTION 'OUT_OF_STOCK: variant "%" has only % left', _match, GREATEST(0, q - rsv) USING ERRCODE = 'P0001';
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  PERFORM public._adjust_variant_rsv(_product_id, _match, _qty);
END; $$;

-- reserve on receipt submit / release on reject-cancel / restore after commit
CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    IF OLD.status IN ('approved','confirmed','delivered') THEN
      -- stock was already committed at admin approval: give it back
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
      -- still only reserved: release the hold
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
END; $$;

-- approval converts the hold into an actual stock deduction (merchant-side)
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.orders; p public.products; photo text; amt numeric; data_payload jsonb; v jsonb; vval text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

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
END; $$;

-- business confirmation no longer deducts stock (already deducted at approval)
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders; p public.products;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;
  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  UPDATE public.products
    SET sold = sold + o.qty,
        revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;
  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END; $$;

-- refund: stock restore is handled by the order trigger, keep only aggregates here
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o public.orders; p public.products; amt numeric; photo text; sold_mult integer := 0; payload jsonb;
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

  IF o.status = 'confirmed' THEN sold_mult := 1; END IF;
  IF o.status = 'delivered' THEN sold_mult := 2; END IF;

  IF sold_mult > 0 THEN
    UPDATE public.products
      SET sold = GREATEST(0, sold - (o.qty * sold_mult)),
          revenue = GREATEST(0, revenue - (o.unit_price * o.qty * sold_mult)),
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
      'This order was refunded by the admin and no longer counts toward your earnings.', payload);

  RETURN o;
END; $$;

-- failed orders: aggregates only, trigger restores the stock
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.orders; p public.products; photo text; clean_note text := NULLIF(trim(COALESCE(_note,'')), '');
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;
  IF o.status = 'confirmed' THEN
    UPDATE public.products SET sold = GREATEST(0, sold - o.qty), revenue = GREATEST(0, revenue - (o.unit_price * o.qty)) WHERE id = o.product_id;
  END IF;
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
END; $$;
