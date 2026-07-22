-- ============================================================================
-- Fix: "Could not find the function public.admin_refund_order(_comment,
-- _order_id) in the schema cache" when refunding a receipt in admin.
--
-- The function itself is unchanged from the last refund migration — this
-- just re-creates it (idempotent, no behavior change) and forces PostgREST
-- to reload its schema cache, which is what was actually out of sync.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_refund_order(uuid);

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid, _comment text DEFAULT NULL)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  amt numeric;
  photo text;
  clean_comment text := NULLIF(trim(COALESCE(_comment, '')), '');
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
    SET refunded_at = now(),
        refund_note = clean_comment
    WHERE id = _order_id
    RETURNING * INTO o;

  amt := o.commission * o.qty;

  UPDATE public.wallets
     SET balance = balance - amt,
         updated_at = now()
   WHERE user_id = o.marketer_id;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'order_refunded',
      COALESCE(p.name, 'An order') || ' fee was refunded back to the customer',
      to_char(amt, 'FM999999990.00') || ' was deducted from your wallet to the customer',
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo,
        'amount', amt,
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
        'customer_notes', o.customer_notes,
        'admin_comment', clean_comment
      )
    );

  RETURN o;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO service_role;

-- Force PostgREST to pick up the (re)created function signature immediately.
NOTIFY pgrst, 'reload schema';
