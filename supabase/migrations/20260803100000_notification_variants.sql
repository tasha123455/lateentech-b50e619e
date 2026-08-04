-- Two notifications never told you which variant the order was for.
--
-- The notification card already knows how to draw variant rows — it reads
-- selected_variants and falls back to the legacy size/colour pair. Most
-- payloads carry it. Two did not, so those two notifications silently dropped
-- back to the fallback and showed nothing at all for any order placed with
-- named variant groups, which is every order since groups replaced size and
-- colour:
--
--   admin_reject_order_with_notes  — "Receipt rejected by the admin"
--   mark_delivered                 — "Order Delivered"
--
-- Everything else about the two functions is unchanged; the only edit is the
-- one key added to each payload, in the same position the other payloads use.

CREATE OR REPLACE FUNCTION public.admin_reject_order_with_notes(_order_id uuid, _notes text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
  photo text;
  receipt text;
BEGIN
  IF NOT public.admin_can('adm-receipts') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT receipt_url INTO receipt FROM public.orders WHERE id = _order_id;
  UPDATE public.orders
    SET status = 'rejected',
        admin_notes = _notes,
        reviewed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      o.marketer_id,
      'receipt_rejected',
      'Receipt rejected by the admin',
      COALESCE(_notes, ''),
      jsonb_build_object(
        'order_id', o.id,
        'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''),
        'product_photo', photo,
        'receipt_url', receipt,
        'admin_notes', _notes,
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
      )
    );

  RETURN o;
END $function$;

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark delivered'; END IF;
  IF public.is_business_frozen(o.business_id) THEN RAISE EXCEPTION 'ACCOUNT_FROZEN: your account is frozen by an administrator.' USING ERRCODE = 'P0001'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_delivered', 'Order Delivered', 'The customer has received the product',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes));
  RETURN o;
END;
$function$;

NOTIFY pgrst, 'reload schema';
