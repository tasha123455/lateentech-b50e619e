
-- =========================================
-- PRODUCTS
-- =========================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 0,
  currency JSONB,
  comm_pct NUMERIC NOT NULL DEFAULT 0,
  comm_fixed NUMERIC NOT NULL DEFAULT 0,
  comm_mode TEXT NOT NULL DEFAULT 'pct',
  platform_fee NUMERIC NOT NULL DEFAULT 0,
  total_fee_per_unit NUMERIC NOT NULL DEFAULT 0,
  variant_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
  photos TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  sold INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  biz_name TEXT,
  biz_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_products_business ON public.products(business_id);
CREATE INDEX idx_products_visible ON public.products(status, deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business owners manage own products"
  ON public.products FOR ALL
  TO authenticated
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

CREATE POLICY "Marketers view active products"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    status = 'active' AND deleted_at IS NULL
    AND public.has_role(auth.uid(), 'marketer'::public.app_role)
  );

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- FAVORITES
-- =========================================
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (marketer_id, product_id)
);

CREATE INDEX idx_favorites_marketer ON public.favorites(marketer_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketers manage own favorites"
  ON public.favorites FOR ALL
  TO authenticated
  USING (auth.uid() = marketer_id)
  WITH CHECK (auth.uid() = marketer_id);

-- =========================================
-- ORDERS
-- =========================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  platform_fee NUMERIC NOT NULL DEFAULT 0,
  currency JSONB,
  customer_name TEXT,
  customer_phone TEXT,
  customer_city TEXT,
  customer_country TEXT,
  size TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','delivered','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_marketer ON public.orders(marketer_id);
CREATE INDEX idx_orders_business ON public.orders(business_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marketers view own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = marketer_id);

CREATE POLICY "Marketers create own orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = marketer_id);

CREATE POLICY "Businesses view orders for their products"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = business_id);

-- =========================================
-- WALLETS
-- =========================================
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0,
  pending NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own wallet"
  ON public.wallets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- PAYOUTS
-- =========================================
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_payouts_user ON public.payouts(user_id);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payouts"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users request own payouts"
  ON public.payouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =========================================
-- RPCs
-- =========================================
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can confirm this order';
  END IF;

  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Order is not pending';
  END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF p.qty < o.qty THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  UPDATE public.products
    SET qty = qty - o.qty,
        sold = sold + o.qty,
        revenue = revenue + (o.unit_price * o.qty)
    WHERE id = o.product_id;

  UPDATE public.orders
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  -- Credit marketer wallet pending
  INSERT INTO public.wallets (user_id, pending)
    VALUES (o.marketer_id, o.commission * o.qty)
    ON CONFLICT (user_id)
    DO UPDATE SET pending = public.wallets.pending + EXCLUDED.pending,
                  updated_at = now();

  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_delivered(_order_id UUID)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders;
  amt NUMERIC;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF auth.uid() <> o.business_id THEN
    RAISE EXCEPTION 'Only the product owner can mark delivered';
  END IF;

  IF o.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Order is not confirmed';
  END IF;

  amt := o.commission * o.qty;

  UPDATE public.orders
    SET status = 'delivered', delivered_at = now()
    WHERE id = _order_id
    RETURNING * INTO o;

  UPDATE public.wallets
    SET pending = GREATEST(pending - amt, 0),
        balance = balance + amt,
        updated_at = now()
    WHERE user_id = o.marketer_id;

  RETURN o;
END;
$$;

-- Update handle_new_user to also create a wallet row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE((new.raw_user_meta_data->>'role')::public.app_role, 'marketer');

  INSERT INTO public.profiles (id, full_name, phone, business_name)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  INSERT INTO public.wallets (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;

-- Ensure the trigger exists on auth.users (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill wallets for existing users
INSERT INTO public.wallets (user_id)
  SELECT id FROM auth.users
  ON CONFLICT DO NOTHING;

-- =========================================
-- REALTIME
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.favorites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.favorites REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.wallets REPLICA IDENTITY FULL;

-- =========================================
-- STORAGE BUCKET
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');

CREATE POLICY "Businesses upload own product photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Businesses update own product photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Businesses delete own product photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
