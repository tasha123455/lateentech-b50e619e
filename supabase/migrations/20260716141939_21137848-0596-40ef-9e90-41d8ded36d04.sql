
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false;

-- Backfill: any order currently in a status that historically decremented product stock
-- (confirmed / delivered) is treated as already reserved so that a later rejection/failure
-- doesn't spuriously restore.
UPDATE public.orders SET stock_reserved = true
  WHERE stock_reserved = false
    AND status IN ('confirmed','delivered');

CREATE OR REPLACE FUNCTION public._reserve_variant_qty_check(_product_id uuid, _match text, _qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  vg jsonb; grp jsonb; it jsonb; q integer; matched boolean := false;
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
          IF q < _qty THEN
            RAISE EXCEPTION 'OUT_OF_STOCK: variant "%" has only % left', _match, q USING ERRCODE = 'P0001';
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_id uuid;
BEGIN
  -- RESERVE stock when a receipt is submitted (order enters admin-review queue).
  IF NEW.status = 'pending'
     AND NEW.receipt_url IS NOT NULL
     AND btrim(NEW.receipt_url) <> ''
     AND NOT COALESCE(NEW.stock_reserved, false) THEN

    IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN
      PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.size, NEW.qty);
    END IF;
    IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN
      PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.color, NEW.qty);
    END IF;

    -- Atomic check-and-decrement: two racing submissions cannot both pass.
    UPDATE public.products
       SET qty = qty - NEW.qty
     WHERE id = NEW.product_id AND qty >= NEW.qty
     RETURNING id INTO updated_id;

    IF updated_id IS NULL THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN
      PERFORM public._adjust_variant_qty(NEW.product_id, NEW.size, -NEW.qty);
    END IF;
    IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN
      PERFORM public._adjust_variant_qty(NEW.product_id, NEW.color, -NEW.qty);
    END IF;

    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;

  -- RESTORE stock when a reserved order is rejected or cancelled.
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.stock_reserved, false) = true
     AND NEW.status IN ('rejected','cancelled')
     AND OLD.status NOT IN ('rejected','cancelled') THEN

    UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;

    IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN
      PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty);
    END IF;
    IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN
      PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty);
    END IF;

    NEW.stock_reserved := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_reserve_stock ON public.orders;
CREATE TRIGGER orders_reserve_stock
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_reserve_stock_trg();

-- confirm_order no longer decrements qty (already reserved at receipt submit),
-- but still records the sold count and revenue for analytics.
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  UPDATE public.products
     SET sold = sold + o.qty,
         revenue = revenue + (o.unit_price * o.qty)
   WHERE id = o.product_id;

  UPDATE public.orders
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = _order_id
   RETURNING * INTO o;

  RETURN o;
END;
$$;

-- mark_failed relies on the trigger to restore qty/variant qty; only rolls back
-- sold count and revenue when the order had already reached the confirmed state.
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
       SET sold = GREATEST(0, sold - o.qty),
           revenue = GREATEST(0, revenue - (o.unit_price * o.qty))
     WHERE id = o.product_id;
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
$$;
