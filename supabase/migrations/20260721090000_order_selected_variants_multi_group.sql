-- Fixes the variant mislabeling / data-loss bug on orders.
--
-- Root cause: orders only ever had two fixed columns, `size` and `color`.
-- The marketer form wrote whichever variant group came first into `size`
-- and the second into `color`, regardless of what those groups were
-- actually named (e.g. a "Color" group listed before a "Size" group ended
-- up stored under the `size` column). Any product with a 3rd+ variant
-- group silently lost that selection entirely, since there was nowhere to
-- put it. This is what produced swapped/wrong labels on the business
-- order card and in notifications.
--
-- Fix: add a generic `selected_variants` column that stores every chosen
-- group as an ordered [{name, value}, ...] list, however many groups a
-- product has. `size`/`color` are left in place for backward
-- compatibility but are no longer the source of truth for display.
--
-- This version is written against the *current* stock model (stock held
-- via products.reserved_qty until the business confirms, product-lock
-- bypass flag, product_snapshot on order create) introduced by
-- 20260719090000_hold_stock_until_business_confirms.sql,
-- 20260720140000_product_full_lock_while_active_marketers.sql and
-- 20260720183505_2ebc5ce1-9e5c-4472-b412-4ad4d0359441.sql. It does not
-- change any of that behavior — only generalizes the size/color-specific
-- variant lookups those functions already do.

-- 1) New column.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS selected_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Backfill existing orders. For each order, recover the *true* group
-- name for whatever is in size/color by matching the stored value against
-- the product's variant_groups (case-insensitive), instead of assuming
-- size-column-is-always-"Size". This retroactively fixes historical
-- mislabeling too, not just future orders.
DO $$
DECLARE
  r RECORD;
  prod_vg jsonb;
  grp jsonb;
  it jsonb;
  result jsonb;
  matched_val text;
BEGIN
  FOR r IN
    SELECT o.id, o.product_id, o.size, o.color
    FROM public.orders o
    WHERE (o.size IS NOT NULL AND btrim(o.size) <> '')
       OR (o.color IS NOT NULL AND btrim(o.color) <> '')
  LOOP
    SELECT variant_groups INTO prod_vg FROM public.products WHERE id = r.product_id;
    result := '[]'::jsonb;

    IF prod_vg IS NOT NULL AND jsonb_typeof(prod_vg) = 'array' THEN
      FOR grp IN SELECT * FROM jsonb_array_elements(prod_vg) LOOP
        matched_val := NULL;
        FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(grp->'items', '[]'::jsonb)) LOOP
          IF matched_val IS NULL AND r.size IS NOT NULL
             AND lower(COALESCE(it->>'val', '')) = lower(r.size) THEN
            matched_val := r.size;
          ELSIF matched_val IS NULL AND r.color IS NOT NULL
             AND lower(COALESCE(it->>'val', '')) = lower(r.color) THEN
            matched_val := r.color;
          END IF;
        END LOOP;
        IF matched_val IS NOT NULL THEN
          result := result || jsonb_build_array(
            jsonb_build_object('name', COALESCE(grp->>'name', ''), 'value', matched_val)
          );
        END IF;
      END LOOP;
    END IF;

    -- Product has no matching variant_groups data (deleted product, or a
    -- legacy sizes/colors-only product) — keep the raw values with generic
    -- labels rather than silently dropping them.
    IF jsonb_array_length(result) = 0 THEN
      IF r.size IS NOT NULL AND btrim(r.size) <> '' THEN
        result := result || jsonb_build_array(jsonb_build_object('name', 'Size', 'value', r.size));
      END IF;
      IF r.color IS NOT NULL AND btrim(r.color) <> '' THEN
        result := result || jsonb_build_array(jsonb_build_object('name', 'Colour', 'value', r.color));
      END IF;
    END IF;

    UPDATE public.orders SET selected_variants = result WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Backfill historical notifications so already-sent "New order" /
-- "Receipt verified" / "Order failed" notifications also show the
-- corrected, fully-labeled variant list instead of the old swapped one.
UPDATE public.notifications n
SET data = data || jsonb_build_object('selected_variants', o.selected_variants)
FROM public.orders o
WHERE n.data ? 'order_id'
  AND (n.data->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (n.data->>'order_id')::uuid = o.id
  AND o.selected_variants IS NOT NULL
  AND jsonb_array_length(o.selected_variants) > 0;

-- 4) orders_reserve_stock_trg: generalize the size/color-specific
-- availability check (at hold time) and the give-back-on-cancel-after-
-- confirmed adjustment to loop over selected_variants (any number of
-- groups), falling back to the legacy columns only if it's empty. Body
-- copied verbatim from the current live definition
-- (20260720183505_2ebc5ce1-9e5c-4472-b412-4ad4d0359441.sql) — the hold/
-- release/restore logic and the app.bypass_product_lock flag are
-- unchanged.
CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  updated_id uuid;
  v jsonb;
  vval text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);

  IF NEW.status = 'pending' AND NEW.receipt_url IS NOT NULL AND btrim(NEW.receipt_url) <> '' AND NOT COALESCE(NEW.stock_reserved, false) THEN
    IF jsonb_array_length(COALESCE(NEW.selected_variants, '[]'::jsonb)) > 0 THEN
      FOR v IN SELECT * FROM jsonb_array_elements(NEW.selected_variants) LOOP
        vval := v->>'value';
        IF vval IS NOT NULL AND btrim(vval) <> '' THEN
          PERFORM public._reserve_variant_qty_check(NEW.product_id, vval, NEW.qty);
        END IF;
      END LOOP;
    ELSE
      IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.size, NEW.qty); END IF;
      IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.color, NEW.qty); END IF;
    END IF;

    UPDATE public.products SET reserved_qty = reserved_qty + NEW.qty WHERE id = NEW.product_id AND (qty - reserved_qty) >= NEW.qty RETURNING id INTO updated_id;
    IF updated_id IS NULL THEN RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001'; END IF;
    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.stock_reserved, false) = true AND NEW.status IN ('rejected','cancelled') AND OLD.status NOT IN ('rejected','cancelled') THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;
      IF jsonb_array_length(COALESCE(OLD.selected_variants, '[]'::jsonb)) > 0 THEN
        FOR v IN SELECT * FROM jsonb_array_elements(OLD.selected_variants) LOOP
          vval := v->>'value';
          IF vval IS NOT NULL AND btrim(vval) <> '' THEN
            PERFORM public._adjust_variant_qty(OLD.product_id, vval, OLD.qty);
          END IF;
        END LOOP;
      ELSE
        IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty); END IF;
        IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty); END IF;
      END IF;
    ELSE
      UPDATE public.products SET reserved_qty = GREATEST(0, reserved_qty - OLD.qty) WHERE id = OLD.product_id;
    END IF;
    NEW.stock_reserved := false;
  END IF;

  RETURN NEW;
END;
$$;

-- 5) confirm_order: this is now the moment variant-item stock is actually
-- decremented (real qty was already handled above/here unchanged) —
-- generalize to loop over selected_variants. Body copied verbatim from
-- the current live definition with only the variant-adjustment lines
-- generalized.
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  p public.products;
  v jsonb;
  vval text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;
  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products SET qty = qty - o.qty, reserved_qty = GREATEST(0, reserved_qty - o.qty), sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;

  IF jsonb_array_length(COALESCE(o.selected_variants, '[]'::jsonb)) > 0 THEN
    FOR v IN SELECT * FROM jsonb_array_elements(o.selected_variants) LOOP
      vval := v->>'value';
      IF vval IS NOT NULL AND btrim(vval) <> '' THEN
        PERFORM public._adjust_variant_qty(o.product_id, vval, -o.qty);
      END IF;
    END LOOP;
  ELSE
    IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty); END IF;
    IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty); END IF;
  END IF;

  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END;
$$;

-- 6) mark_failed: include selected_variants in the "order failed"
-- notification payload. Body copied verbatim from the current live
-- definition with exactly one line added.
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants, 'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END;
$$;

-- 7) admin_approve_order: include selected_variants in the "new_order" /
-- "receipt_verified" notification payload. This function hasn't been
-- touched by any of the stock-model changes above (last defined in
-- 20260713105301_3e181ab1-68f5-403c-b58e-1ecbdc289236.sql), so its body
-- is unchanged apart from the one new line in data_payload — wallet
-- crediting, status transition, and both notification inserts are exactly
-- as they are today.
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
    'selected_variants', o.selected_variants,
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
