
-- 1) Harden handle_new_user against admin role escalation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_text text;
  v_role public.app_role;
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_bans WHERE email = lower(new.email)) THEN
    RAISE EXCEPTION 'This email is banned';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, business_name, country)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'country'
  );

  v_role_text := new.raw_user_meta_data->>'role';
  IF v_role_text = 'business' THEN
    v_role := 'business'::public.app_role;
  ELSIF v_role_text = 'marketer' THEN
    v_role := 'marketer'::public.app_role;
  ELSE
    v_role := NULL;
  END IF;

  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
    INSERT INTO public.wallets (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

-- 2) Recalculate order financials from the product on INSERT
CREATE OR REPLACE FUNCTION public.orders_validate_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p public.products;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  NEW.unit_price   := p.price;
  NEW.platform_fee := p.platform_fee;
  NEW.commission   := CASE p.comm_mode
    WHEN 'fixed' THEN p.comm_fixed
    ELSE ROUND(p.price * p.comm_pct / 100.0, 2)
  END;
  NEW.currency := COALESCE(p.currency, NEW.currency);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_validate_financial ON public.orders;
CREATE TRIGGER trg_orders_validate_financial
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_validate_financial();

-- 3) Explicit authenticated-only scope for marketer order updates
DROP POLICY IF EXISTS "Marketers update own pending orders" ON public.orders;
CREATE POLICY "Marketers update own pending orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = marketer_id AND status = 'pending')
  WITH CHECK (auth.uid() = marketer_id AND status = 'pending');

-- 4) Marketer view without sensitive aggregate financial fields
DROP VIEW IF EXISTS public.products_marketer_view;
CREATE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

GRANT SELECT ON public.products_marketer_view TO authenticated;

-- Drop the marketer full-row policy; marketers now read via the view above
DROP POLICY IF EXISTS "Marketers view active products" ON public.products;

-- 5) Storage policies for private receipts bucket
DROP POLICY IF EXISTS "Receipts: marketer uploads own" ON storage.objects;
CREATE POLICY "Receipts: marketer uploads own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Receipts: owner reads own" ON storage.objects;
CREATE POLICY "Receipts: owner reads own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.business_id = auth.uid()
          AND o.receipt_url LIKE '%' || storage.objects.name
      )
    )
  );

DROP POLICY IF EXISTS "Receipts: owner deletes own" ON storage.objects;
CREATE POLICY "Receipts: owner deletes own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
