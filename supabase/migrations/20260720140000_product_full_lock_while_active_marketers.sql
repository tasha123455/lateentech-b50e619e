-- ============================================================================
-- Full product lock while a product has active marketers.
--
-- "Active marketer" uses the same definition as active_marketers_count()
-- (added in 20260712150000, re-declared in 20260713105339): a distinct
-- marketer with a pending/approved/confirmed order for that product.
--
-- While that count is > 0 for a product:
--   - ANY change to the product row from the business dashboard is blocked
--     (name, price, photos, cover focus point, qty, commission, delivery,
--     description, category, currency, variants, the require-additional-
--     phone toggle — everything the edit form can touch).
--   - Soft-deleting the product (which sets deleted_at) is blocked too,
--     since it's just another UPDATE on the same row.
--   - Pausing/activating the product (status column only) is NOT blocked,
--     so the business can still take a problem product off sale.
--
-- This trigger sits behind the business dashboard's own full-lock UI
-- (which disables the whole edit form and the delete button once a
-- product has active marketers) as a database-level backstop — it also
-- protects against races and any future update path that bypasses the UI.
--
-- IMPORTANT: automatic stock hold/release/confirm and sold/revenue
-- bookkeeping (orders_reserve_stock_trg, confirm_order, mark_failed,
-- mark_delivered) ALSO update this same table, and they legitimately need
-- to keep working even while a product has active marketers (that's the
-- normal case while an order is in flight). Those functions set a
-- transaction-local flag — the same "app.bypass_..." pattern already used
-- elsewhere in this schema (see marketer_reupload_receipt) — before
-- touching the row, so this trigger lets them through unconditionally.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.products_lock_while_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active integer;
BEGIN
  -- Trusted internal paths (stock hold/release/confirm, sold/revenue
  -- bookkeeping) set this before touching the row; always let them through.
  IF current_setting('app.bypass_product_lock', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- A pure status change (pause/activate/hide) is always allowed, even
  -- while the product has active marketers.
  IF (to_jsonb(NEW) - ARRAY['status','updated_at'])
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
    RETURN NEW;
  END IF;

  SELECT public.active_marketers_count(OLD.id) INTO _active;
  IF _active > 0 THEN
    RAISE EXCEPTION 'PRODUCT_LOCKED: this product has % active marketer(s) and cannot be edited or deleted until those orders complete.', _active
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_lock_while_active ON public.products;
CREATE TRIGGER trg_products_lock_while_active
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.products_lock_while_active();

COMMENT ON FUNCTION public.products_lock_while_active() IS 'Blocks any UPDATE to a product (edit or soft-delete) other than a pure status change while active_marketers_count() for it is > 0. Internal stock/bookkeeping functions bypass this via the app.bypass_product_lock session flag.';


-- ----------------------------------------------------------------------------
-- Re-declare the internal functions that legitimately write to public.products
-- while an order is in flight, adding ONE line each (right after BEGIN) that
-- sets the bypass flag for the rest of that transaction. No other logic in
-- any of these functions is changed from their current (latest) definitions.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_id uuid;
BEGIN
  -- Internal system path (stock reservation / sold+revenue bookkeeping) — always allowed.
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  -- HOLD stock when a receipt is submitted (order enters admin-review queue).
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

    -- Atomic check-and-hold against available stock (qty - reserved_qty):
    -- two racing submissions cannot both pass.
    UPDATE public.products
       SET reserved_qty = reserved_qty + NEW.qty
     WHERE id = NEW.product_id AND (qty - reserved_qty) >= NEW.qty
     RETURNING id INTO updated_id;

    IF updated_id IS NULL THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001';
    END IF;

    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;

  -- RELEASE the hold (rejected/cancelled before the business confirmed) or
  -- RESTORE real stock (marked failed/cancelled after the business had
  -- already confirmed).
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.stock_reserved, false) = true
     AND NEW.status IN ('rejected','cancelled')
     AND OLD.status NOT IN ('rejected','cancelled') THEN

    IF OLD.status = 'confirmed' THEN
      -- Real stock was already deducted at confirmation -- give it back.
      UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;

      IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN
        PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty);
      END IF;
      IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN
        PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty);
      END IF;
    ELSE
      -- Still only held, never confirmed -- the business owner's stock was
      -- never touched, so just release the hold.
      UPDATE public.products SET reserved_qty = GREATEST(0, reserved_qty - OLD.qty) WHERE id = OLD.product_id;
    END IF;

    NEW.stock_reserved := false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  -- Internal system path (stock reservation / sold+revenue bookkeeping) — always allowed.
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products
     SET qty = qty - o.qty,
         reserved_qty = GREATEST(0, reserved_qty - o.qty),
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
$$;

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
  -- Internal system path (stock reservation / sold+revenue bookkeeping) — always allowed.
  PERFORM set_config('app.bypass_product_lock', 'on', true);
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

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
BEGIN
  -- Internal system path (stock reservation / sold+revenue bookkeeping) — always allowed.
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can mark delivered';
  END IF;

  IF o.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Order is not confirmed';
  END IF;

  UPDATE public.orders
    SET status = 'delivered', delivered_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  UPDATE public.products
     SET sold = sold + o.qty,
         revenue = revenue + (o.unit_price * o.qty)
   WHERE id = o.product_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_delivered',
      'Order Delivered',
      'The customer has received the product',
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
        'customer_notes', o.customer_notes
      )
    );

  RETURN o;
END;
$function$;

