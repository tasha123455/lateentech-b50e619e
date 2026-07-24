-- ============================================================================
-- Restore full order detail on the 'order_refunded' notification.
--
-- A migration on 20260722190000 added qty/size/color/customer detail fields
-- to admin_refund_order's notification (matching what mark_delivered()
-- already sends for a delivered order), but a later same-day migration
-- (20260723004645) recreated the function for an unrelated change and
-- dropped those fields back down to just product_name/product_photo/amount.
--
-- This restores the full detail set so the marketer's notification and
-- transaction entry for a refunded order show the same level of order
-- detail as a delivered order (product, qty, size/colour, customer name,
-- phone, WhatsApp, city, country, address, notes), in addition to what the
-- function already did (amount, admin's comment). No other behavior of
-- admin_refund_order changes.
-- ============================================================================

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
      'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
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
        'admin_comment', clean_comment,
        'admin_note', clean_comment
      )
    );

  RETURN o;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_order(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
