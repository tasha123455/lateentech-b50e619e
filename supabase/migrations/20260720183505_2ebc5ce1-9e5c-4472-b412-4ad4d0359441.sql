-- Employees phone
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;

-- Allow 'hidden' status
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active','paused','hidden'));

-- Reserved qty + focus + require_additional_phone
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reserved_qty integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_focus_x numeric NOT NULL DEFAULT 50;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cover_focus_y numeric NOT NULL DEFAULT 50;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS require_additional_phone boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS require_additional_phone boolean NOT NULL DEFAULT false;

-- Backfill reserved_qty from currently held orders
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, product_id, qty, size, color
    FROM public.orders
    WHERE stock_reserved = true
      AND status IN ('pending', 'approved')
  LOOP
    UPDATE public.products
       SET qty = qty + rec.qty,
           reserved_qty = reserved_qty + rec.qty
     WHERE id = rec.product_id;
    IF rec.size IS NOT NULL AND btrim(rec.size) <> '' THEN
      PERFORM public._adjust_variant_qty(rec.product_id, rec.size, rec.qty);
    END IF;
    IF rec.color IS NOT NULL AND btrim(rec.color) <> '' THEN
      PERFORM public._adjust_variant_qty(rec.product_id, rec.color, rec.qty);
    END IF;
  END LOOP;
END $$;

-- Rebuild marketer view with new columns (drop & recreate to change shape)
DROP VIEW IF EXISTS public.products_marketer_view CASCADE;
CREATE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  cover_focus_x, cover_focus_y,
  status, biz_name, require_additional_phone, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;
ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;

-- Refunds
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_refund_order(_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Only approved receipts can be refunded'; END IF;
  IF o.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'This order has already been refunded'; END IF;
  UPDATE public.orders SET refunded_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END;
$function$;

-- Product review notifications with photo/avatar
DROP FUNCTION IF EXISTS public.notify_product_review(uuid, int, text);
CREATE OR REPLACE FUNCTION public.notify_product_review(
  _product_id uuid, _rating int, _text text,
  _photo text DEFAULT NULL, _avatar text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _biz uuid; _pname text; _author text; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN RAISE EXCEPTION 'Invalid rating'; END IF;
  SELECT business_id, name INTO _biz, _pname FROM public.products WHERE id = _product_id;
  IF _biz IS NULL THEN RETURN; END IF;
  SELECT COALESCE(full_name, business_name, 'Marketer') INTO _author FROM public.profiles WHERE id = _uid;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (_biz, 'product_review', 'New product review',
    COALESCE(_author,'Marketer') || ' rated ' || COALESCE(_pname,'your product') || ' ' || _rating || '★',
    jsonb_build_object('product_id', _product_id, 'product_name', _pname, 'rating', _rating,
      'text', _text, 'author', _author, 'marketer_id', _uid, 'photo', _photo, 'avatar', _avatar));
END;
$$;
GRANT EXECUTE ON FUNCTION public.notify_product_review(uuid,int,text,text,text) TO authenticated;

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('product','merchant','other')),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  business_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
CREATE INDEX idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX idx_reports_status ON public.reports(status);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users submit their own reports" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users view their own reports" ON public.reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Admins view all reports" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Product-lock trigger + bypass in internal writers
CREATE OR REPLACE FUNCTION public.products_lock_while_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _active integer;
BEGIN
  IF current_setting('app.bypass_product_lock', true) = 'on' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN RETURN NEW; END IF;
  SELECT public.active_marketers_count(OLD.id) INTO _active;
  IF _active > 0 THEN
    RAISE EXCEPTION 'PRODUCT_LOCKED: this product has % active marketer(s) and cannot be edited or deleted until those orders complete.', _active USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_products_lock_while_active ON public.products;
CREATE TRIGGER trg_products_lock_while_active BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_lock_while_active();

CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE updated_id uuid;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  IF NEW.status = 'pending' AND NEW.receipt_url IS NOT NULL AND btrim(NEW.receipt_url) <> '' AND NOT COALESCE(NEW.stock_reserved, false) THEN
    IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.size, NEW.qty); END IF;
    IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.color, NEW.qty); END IF;
    UPDATE public.products SET reserved_qty = reserved_qty + NEW.qty WHERE id = NEW.product_id AND (qty - reserved_qty) >= NEW.qty RETURNING id INTO updated_id;
    IF updated_id IS NULL THEN RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001'; END IF;
    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.stock_reserved, false) = true AND NEW.status IN ('rejected','cancelled') AND OLD.status NOT IN ('rejected','cancelled') THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;
      IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty); END IF;
      IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty); END IF;
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
DECLARE o public.orders; p public.products;
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
  IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty); END IF;
  IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty); END IF;
  UPDATE public.orders SET status = 'confirmed', confirmed_at = now() WHERE id = _order_id RETURNING * INTO o;
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_failed(_order_id uuid, _note text DEFAULT NULL::text)
RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
        'size', o.size, 'color', o.color, 'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes,
        'business_notes', clean_note));
  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id uuid)
 RETURNS orders LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o public.orders; p public.products; photo text;
BEGIN
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can mark delivered'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Order is not confirmed'; END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = _order_id RETURNING * INTO o;
  UPDATE public.products SET sold = sold + o.qty, revenue = revenue + (o.unit_price * o.qty) WHERE id = o.product_id;
  SELECT * INTO p FROM public.products WHERE id = o.product_id;
  photo := CASE WHEN p.photos IS NOT NULL AND array_length(p.photos,1) > 0 THEN p.photos[1] ELSE NULL END;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (o.marketer_id, 'order_delivered', 'Order Delivered', 'The customer has received the product',
      jsonb_build_object('order_id', o.id, 'order_code', UPPER(SUBSTRING(o.id::text, 1, 8)),
        'product_name', COALESCE(p.name, ''), 'product_photo', photo, 'qty', o.qty,
        'size', o.size, 'color', o.color, 'customer_name', o.customer_name,
        'customer_phone', o.customer_phone, 'customer_whatsapp', o.customer_whatsapp,
        'customer_address', o.customer_address, 'customer_city', o.customer_city,
        'customer_country', o.customer_country, 'customer_notes', o.customer_notes));
  RETURN o;
END;
$function$;

-- Product snapshot on order create
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_snapshot jsonb;
CREATE OR REPLACE FUNCTION public.orders_capture_product_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.product_snapshot IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT jsonb_build_object('name', p.name, 'code', p.code, 'photos', p.photos, 'category', p.category)
    INTO NEW.product_snapshot FROM public.products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_capture_product_snapshot ON public.orders;
CREATE TRIGGER trg_orders_capture_product_snapshot BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_capture_product_snapshot();