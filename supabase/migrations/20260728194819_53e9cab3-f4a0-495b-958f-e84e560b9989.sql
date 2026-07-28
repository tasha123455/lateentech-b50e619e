CREATE OR REPLACE FUNCTION public.is_business_frozen(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _business_id AND p.frozen_at IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.business_active_marketers_total(_business_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(DISTINCT o.marketer_id)::int
  FROM public.orders o
  WHERE o.business_id = _business_id
    AND o.status IN ('pending','approved','confirmed');
$$;

DROP POLICY IF EXISTS "Marketers view active products" ON public.products;
CREATE POLICY "Marketers view active products" ON public.products
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'marketer'::app_role) AND (
    (status = 'active' AND deleted_at IS NULL AND NOT public.is_business_frozen(business_id))
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.product_id = products.id
        AND o.marketer_id = auth.uid()
        AND o.status IN ('pending','approved','confirmed')
    )
  )
);

CREATE OR REPLACE FUNCTION public.orders_block_unavailable_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.deleted_at IS NOT NULL OR p.status <> 'active' OR public.is_business_frozen(p.business_id) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: this product is no longer available for new orders.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_block_unavailable_product_trg ON public.orders;
CREATE TRIGGER orders_block_unavailable_product_trg
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_block_unavailable_product();

CREATE OR REPLACE FUNCTION public.products_block_business_unhide()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.bypass_product_lock', true) = 'on' THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF OLD.status = 'hidden' AND NEW.status IS DISTINCT FROM 'hidden' THEN
    RAISE EXCEPTION 'ADMIN_HIDDEN: this product was hidden by an administrator and can only be restored by an administrator.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_block_business_unhide_trg ON public.products;
CREATE TRIGGER products_block_business_unhide_trg
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_block_business_unhide();

CREATE OR REPLACE FUNCTION public.admin_set_product_status(_product_id uuid, _status text)
RETURNS products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _status NOT IN ('active','hidden','paused') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  UPDATE public.products SET status = _status, updated_at = now()
    WHERE id = _product_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_product(_product_id uuid)
RETURNS products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  PERFORM set_config('app.bypass_product_lock', 'on', true);
  UPDATE public.products
    SET deleted_at = COALESCE(deleted_at, now()), status = 'hidden', updated_at = now()
    WHERE id = _product_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(_role text)
RETURNS account_deletion_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal NUMERIC;
  _pending NUMERIC;
  _active INTEGER := 0;
  _safe BOOLEAN;
  _row public.account_deletion_requests;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role NOT IN ('marketer','business') THEN RAISE EXCEPTION 'Invalid role'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.account_deletion_requests
    WHERE user_id = _uid AND status IN ('wallet_review','scheduled')
  ) THEN
    RAISE EXCEPTION 'A deletion request is already in progress';
  END IF;

  SELECT balance, pending INTO _bal, _pending FROM public.wallets WHERE user_id = _uid;

  IF _role = 'business' THEN
    _active := public.business_active_marketers_total(_uid);
  END IF;

  _safe := COALESCE(_bal,0) = 0 AND COALESCE(_pending,0) = 0 AND _active = 0;

  INSERT INTO public.account_deletion_requests (user_id, role, status, wallet_balance, wallet_pending, scheduled_for)
  VALUES (
    _uid, _role,
    CASE WHEN _safe THEN 'scheduled' ELSE 'wallet_review' END,
    COALESCE(_bal,0), COALESCE(_pending,0),
    CASE WHEN _safe THEN now() + interval '14 days' ELSE NULL END
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;