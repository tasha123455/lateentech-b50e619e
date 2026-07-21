-- Extends admin_refund_order to also reverse the marketer's commission.
CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid)
 RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; amt numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Only approved receipts can be refunded'; END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;
  UPDATE public.orders SET refunded_at = now() WHERE id = _order_id RETURNING * INTO o;
  amt := o.commission * o.qty;
  UPDATE public.wallets SET balance = balance - amt, updated_at = now() WHERE user_id = o.marketer_id;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_refunded', 'Order refunded',
      COALESCE(p.name, 'An order') || ' was refunded — ' || to_char(amt, 'FM999999990.00') || ' was deducted from your wallet balance.',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)), 'product_name', COALESCE(p.name, ''), 'amount', amt));
  RETURN o;
END;
$function$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS selected_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill selected_variants; disable reserve trigger for the duration to avoid re-firing OUT_OF_STOCK on legacy pending orders.
ALTER TABLE public.orders DISABLE TRIGGER USER;
DO $$
DECLARE
  r RECORD; prod_vg jsonb; grp jsonb; it jsonb; result jsonb; matched_val text;
BEGIN
  FOR r IN SELECT o.id, o.product_id, o.size, o.color FROM public.orders o
    WHERE (o.size IS NOT NULL AND btrim(o.size) <> '') OR (o.color IS NOT NULL AND btrim(o.color) <> '')
  LOOP
    SELECT variant_groups INTO prod_vg FROM public.products WHERE id = r.product_id;
    result := '[]'::jsonb;
    IF prod_vg IS NOT NULL AND jsonb_typeof(prod_vg) = 'array' THEN
      FOR grp IN SELECT * FROM jsonb_array_elements(prod_vg) LOOP
        matched_val := NULL;
        FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(grp->'items', '[]'::jsonb)) LOOP
          IF matched_val IS NULL AND r.size IS NOT NULL AND lower(COALESCE(it->>'val', '')) = lower(r.size) THEN matched_val := r.size;
          ELSIF matched_val IS NULL AND r.color IS NOT NULL AND lower(COALESCE(it->>'val', '')) = lower(r.color) THEN matched_val := r.color;
          END IF;
        END LOOP;
        IF matched_val IS NOT NULL THEN
          result := result || jsonb_build_array(jsonb_build_object('name', COALESCE(grp->>'name', ''), 'value', matched_val));
        END IF;
      END LOOP;
    END IF;
    IF jsonb_array_length(result) = 0 THEN
      IF r.size IS NOT NULL AND btrim(r.size) <> '' THEN result := result || jsonb_build_array(jsonb_build_object('name', 'Size', 'value', r.size)); END IF;
      IF r.color IS NOT NULL AND btrim(r.color) <> '' THEN result := result || jsonb_build_array(jsonb_build_object('name', 'Colour', 'value', r.color)); END IF;
    END IF;
    UPDATE public.orders SET selected_variants = result WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.orders ENABLE TRIGGER USER;

UPDATE public.notifications n
SET data = data || jsonb_build_object('selected_variants', o.selected_variants)
FROM public.orders o
WHERE n.data ? 'order_id'
  AND (n.data->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (n.data->>'order_id')::uuid = o.id
  AND o.selected_variants IS NOT NULL
  AND jsonb_array_length(o.selected_variants) > 0;

CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE updated_id uuid; v jsonb; vval text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  IF NEW.status = 'pending' AND NEW.receipt_url IS NOT NULL AND btrim(NEW.receipt_url) <> '' AND NOT COALESCE(NEW.stock_reserved, false) THEN
    IF jsonb_array_length(COALESCE(NEW.selected_variants, '[]'::jsonb)) > 0 THEN
      FOR v IN SELECT * FROM jsonb_array_elements(NEW.selected_variants) LOOP
        vval := v->>'value';
        IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, vval, NEW.qty); END IF;
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
          IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, vval, OLD.qty); END IF;
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

CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders; p public.products; v jsonb; vval text;
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
      IF vval IS NOT NULL AND btrim(vval) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, vval, -o.qty); END IF;
    END LOOP;
  ELSE
    IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty); END IF;
    IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty); END IF;
  END IF;
  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
 RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
        'size', o.size, 'color', o.color, 'selected_variants', o.selected_variants,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END;
$function$;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id UUID, _comment TEXT)
RETURNS public.reports LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.reports; p public.products; _photo text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _comment IS NULL OR length(trim(_comment)) = 0 THEN RAISE EXCEPTION 'Comment is required'; END IF;
  UPDATE public.reports SET status = 'resolved', admin_comment = _comment, resolved_at = now(), reviewed_by = auth.uid()
    WHERE id = _report_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF r.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = r.product_id;
    IF FOUND AND p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN _photo := p.photos[1]; END IF;
  END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (r.reporter_id, 'report_reviewed', 'Report reviewed', _comment,
      jsonb_build_object('report_id', r.id, 'report_type', r.report_type, 'product_id', r.product_id,
        'product_name', p.name, 'product_photo', _photo, 'admin_comment', _comment));
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO authenticated;

ALTER TABLE public.reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
END $$;