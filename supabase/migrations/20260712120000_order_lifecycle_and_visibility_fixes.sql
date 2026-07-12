-- ============================================================================
-- 1) Stock now decrements when the BUSINESS OWNER confirms the order
--    (confirm_order), not when the admin approves the receipt
--    (admin_approve_order). Revenue/sold are now recorded on successful
--    delivery (mark_delivered), not on business confirmation.
-- ============================================================================

-- admin_approve_order: no longer touches product stock. Only verifies the
-- receipt, credits the marketer's wallet, and notifies both parties.
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

-- confirm_order: this is now the point where stock is actually deducted
-- (moved from admin_approve_order). Sold/revenue are recorded later, at
-- mark_delivered, instead of here.
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products SET qty = qty - o.qty WHERE id = o.product_id;
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
$function$;

-- mark_delivered: now records sold/revenue on the product, since this is the
-- point of successful delivery.
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

-- ============================================================================
-- 2) mark_failed: stock is now only deducted starting at 'confirmed' (see
--    confirm_order above), so it only needs restoring from that point on —
--    not from 'approved'. Sold/revenue are no longer touched here since they
--    are now only ever recorded at delivery. Also persists the business's
--    failure note on the order row itself (see business_notes column below)
--    so it can be shown on the marketer's order card, not just the
--    one-time notification.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
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
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark this order failed'; END IF;
  IF o.status IN ('cancelled','rejected','delivered') THEN RAISE EXCEPTION 'Order cannot be marked failed in its current state'; END IF;

  IF o.status = 'confirmed' THEN
    UPDATE public.products SET qty = qty + o.qty WHERE id = o.product_id;
    IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.size, o.qty);
    END IF;
    IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
      PERFORM public._adjust_variant_qty(o.product_id, o.color, o.qty);
    END IF;
  END IF;

  UPDATE public.orders
    SET status = 'cancelled',
        business_notes = NULLIF(trim(COALESCE(_note,'')), '')
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
        'business_notes', o.business_notes
      )
    );

  RETURN o;
END;
$function$;

-- ============================================================================
-- 3) Persist the business's "why this failed" note on the order itself.
-- ============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_notes text;

-- ============================================================================
-- 4) Hide low-stock (and out-of-stock) products from marketers' browse view.
--    Matches the business dashboard's LOW_STOCK_THRESHOLD of 20 units.
-- ============================================================================
DROP VIEW IF EXISTS public.products_marketer_view;
CREATE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL AND qty > 20;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;

-- ============================================================================
-- 5) marketer_reupload_receipt: automatically delete the previous receipt
--    file from storage once it has been replaced, so rejected uploads don't
--    pile up as orphaned files.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marketer_reupload_receipt(_order_id uuid, _receipt_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  _old_path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _receipt_url IS NULL OR length(trim(_receipt_url)) = 0 THEN RAISE EXCEPTION 'Receipt URL required'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.marketer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF o.status NOT IN ('rejected','pending') THEN RAISE EXCEPTION 'Cannot re-upload receipt for order in status %', o.status; END IF;

  PERFORM set_config('app.bypass_marketer_order_restrictions', 'on', true);

  UPDATE public.orders
     SET receipt_url = _receipt_url,
         receipt_uploaded_at = now(),
         marketer_confirmed_at = now(),
         admin_notes = NULL,
         reviewed_at = NULL,
         status = 'pending'
   WHERE id = _order_id;

  -- Clean up the file the new upload replaced.
  IF o.receipt_url IS NOT NULL AND o.receipt_url LIKE 'receipts:%' AND o.receipt_url IS DISTINCT FROM _receipt_url THEN
    _old_path := substring(o.receipt_url FROM 10);
    DELETE FROM storage.objects WHERE bucket_id = 'receipts' AND name = _old_path;
  END IF;
END;
$$;
