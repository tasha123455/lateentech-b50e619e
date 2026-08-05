-- The refund window drops from five days to two.
--
-- Five was long enough to read as the payout cycle rather than as a refund
-- window — a marketer seeing "available in 5 days" next to "withdrawals every
-- 30 days" has two waiting periods and no way to tell which is which. Two days
-- is plainly a fraud check on a delivery that has just happened, which is what
-- it is.
--
-- Orders already delivered keep whatever window they were delivered under: the
-- notification carries `available_in_days` from the moment it was sent, and
-- release_matured_commission() reads the market's current setting, so shrinking
-- the window only ever releases money sooner. Nobody waits longer than they
-- were told.

ALTER TABLE public.markets
  ALTER COLUMN refund_window_days SET DEFAULT 2;

UPDATE public.markets SET refund_window_days = 2 WHERE code = 'LY';

COMMENT ON COLUMN public.markets.refund_window_days IS
  'Days after delivery during which an order can still be refunded. The '
  'commission sits in wallets.pending until it closes, then becomes '
  'withdrawable. Two days in Libya.';

-- The body the notification is stored with. The marketer's app rewrites this
-- line in their own language from `available_in_days`, so this text is what
-- anything reading the row directly sees — a push payload, an export, an admin
-- looking at the table. It said "available to withdraw", which described the
-- button rather than the money; "a guaranteed balance in your wallet" is what
-- actually happens at the end of the window.
CREATE OR REPLACE FUNCTION public.business_mark_delivered(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  mk public.markets;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = o.product_id AND business_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF o.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved order can be marked delivered';
  END IF;

  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;

  -- The wallet is deliberately untouched. delivered_at is the start of the
  -- refund window, and the commission stays in `pending` until it closes --
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

NOTIFY pgrst, 'reload schema';
