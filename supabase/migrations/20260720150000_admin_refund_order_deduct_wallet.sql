-- ============================================================================
-- Extends admin_refund_order (from 20260720120000) to also reverse the
-- marketer's commission, on top of what it already does (stamping
-- refunded_at so the order's platform fee drops out of admin metrics).
--
-- Balance is allowed to go negative here. If the marketer already withdrew
-- that commission via a payout, this becomes a real debt against their
-- future earnings rather than something silently written off — the admin
-- should be able to see that in the marketer's wallet.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  amt numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved receipts can be refunded';
  END IF;
  IF o.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order has already been refunded';
  END IF;

  UPDATE public.orders
    SET refunded_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;

  UPDATE public.wallets
     SET balance = balance - amt,
         updated_at = now()
   WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_refunded',
      'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' ||
        to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'amount', amt
      )
    );

  RETURN o;
END;
$function$;
