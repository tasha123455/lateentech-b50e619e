-- The delivered notification's stored wording, on the function that actually
-- sends it.
--
-- 20260806090000 tried to make this change and named the wrong function. It
-- wrote `business_mark_delivered`, which exists nowhere in this schema; the
-- function the app calls, and the one every other migration has defined, is
-- `mark_delivered`. Applied as written it would have created a second, dead
-- function nobody calls and left the live one saying what it always said. The
-- refund-window half of that migration was unaffected and is already applied:
-- markets.refund_window_days is a table value and mark_delivered reads it at
-- call time.
--
-- What changes here is one string. "available to withdraw" described the
-- button rather than the money, and it read as a second waiting period beside
-- the thirty-day payout cycle. What actually happens when the refund window
-- closes is that the commission stops being reversible — it becomes theirs.
--
-- This is the body stored on the row. The marketer's app rewrites this line in
-- their own language, so the text below is what anything reading the table
-- directly sees: a push payload, an export, an admin looking at notifications.
--
-- Everything else is 20260805090000's definition verbatim — the same owner
-- check, the same frozen-account check, the same 'confirmed' status guard, the
-- same untouched wallet. Restated in full because CREATE OR REPLACE FUNCTION
-- replaces the whole body, so a partial copy is how guards get lost.

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text; mk public.markets;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark delivered'; END IF;
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;

  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;

  -- The wallet is deliberately untouched. delivered_at is the start of the
  -- refund window, and the commission stays in `pending` until it closes —
  -- release_matured_commission() moves it, on the marketer's next wallet read.
  mk := public.market_for_user(o.marketer_id);

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_delivered', 'Order Delivered',
      'The customer has received the product. Your commission becomes a guaranteed balance in your wallet in '
        || mk.refund_window_days || ' days.',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'cover_focus_x', p.cover_focus_x, 'cover_focus_y', p.cover_focus_y, 'fulfilment', p.fulfilment, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'available_in_days', mk.refund_window_days,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes));
  RETURN o;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_delivered(uuid) TO authenticated;

-- Nothing should have created this, but 20260806090000 shipped with it in the
-- file, so drop it if any environment ran that migration before the name was
-- corrected. It is not called from anywhere.
DROP FUNCTION IF EXISTS public.business_mark_delivered(uuid);

NOTIFY pgrst, 'reload schema';
