
-- Grant admin to existing user
INSERT INTO public.user_roles (user_id, role)
VALUES ('6684c099-afed-48cc-a949-15f76ad69cc7', 'admin')
ON CONFLICT DO NOTHING;

-- Admin RLS policies
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update all orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all products" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update all products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all payouts" ON public.payouts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all wallets" ON public.wallets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all user_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin RPC functions
CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; p public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products SET qty = qty - o.qty, sold = sold + o.qty,
    revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;

  UPDATE public.orders SET status = 'confirmed', confirmed_at = now()
    WHERE id = _order_id RETURNING * INTO o;

  INSERT INTO public.wallets (user_id, pending)
    VALUES (o.marketer_id, o.commission * o.qty)
    ON CONFLICT (user_id) DO UPDATE
    SET pending = public.wallets.pending + EXCLUDED.pending, updated_at = now();

  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_order(_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.orders SET status = 'rejected', receipt_url = NULL
    WHERE id = _order_id RETURNING * INTO o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
RETURNS public.payouts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO pay FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF pay.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  UPDATE public.wallets SET balance = GREATEST(balance - pay.amount, 0), updated_at = now()
    WHERE user_id = pay.user_id;

  UPDATE public.payouts SET status = 'paid', paid_at = now()
    WHERE id = _payout_id RETURNING * INTO pay;
  RETURN pay;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_product_status(_product_id uuid, _status text)
RETURNS public.products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _status NOT IN ('active','hidden','paused') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.products SET status = _status, updated_at = now()
    WHERE id = _product_id RETURNING * INTO p;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  RETURN p;
END $$;

-- Lock down execute privileges
REVOKE EXECUTE ON FUNCTION public.admin_approve_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_product_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_status(uuid, text) TO authenticated;
