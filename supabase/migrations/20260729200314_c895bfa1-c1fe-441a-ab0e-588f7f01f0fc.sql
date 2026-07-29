-- 1) Stop account deletion from wiping historical data used by admin analytics.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_marketer_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_business_id_fkey;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_business_id_fkey;
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS payouts_user_id_fkey;
ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_marketer_id_fkey;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_deleted_at timestamptz;

-- 2) Called right before an account is removed, so the historical rows are
-- retained but the (now ownerless) account no longer acts like a live one.
CREATE OR REPLACE FUNCTION public.mark_user_account_deleted(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.profiles
     SET account_deleted_at = COALESCE(account_deleted_at, now()),
         updated_at = now()
   WHERE id = _user_id;

  -- Hide the deleted merchant's products from everyone (rows stay for analytics).
  UPDATE public.products
     SET status = 'hidden', updated_at = now()
   WHERE business_id = _user_id AND status <> 'hidden';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_user_account_deleted(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_user_account_deleted(uuid) TO authenticated, service_role;

-- 3) Existing admin RPCs keep the history too.
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  PERFORM public.mark_user_account_deleted(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS public.email_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.email_bans;
  em text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  SELECT lower(email) INTO em FROM auth.users WHERE id = _user_id;
  IF em IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.email_bans (email, reason, banned_by)
    VALUES (em, _reason, auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
    RETURNING * INTO b;

  PERFORM public.mark_user_account_deleted(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN b;
END;
$$;

-- 4) Admin-only "wipe all admin data": clears operational data across every
-- admin page while leaving user accounts, roles and email bans intact.
CREATE OR REPLACE FUNCTION public.admin_wipe_all_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'orders', (SELECT count(*) FROM public.orders),
    'products', (SELECT count(*) FROM public.products),
    'payouts', (SELECT count(*) FROM public.payouts),
    'employees', (SELECT count(*) FROM public.employees)
  ) INTO res;

  DELETE FROM public.product_reviews;
  DELETE FROM public.favorites;
  DELETE FROM public.orders;
  DELETE FROM public.products;
  DELETE FROM public.payouts;
  DELETE FROM public.reports;
  DELETE FROM public.notifications;
  DELETE FROM public.account_deletion_requests;
  DELETE FROM public.employee_payments;
  DELETE FROM public.employees;
  DELETE FROM public.email_send_log;

  UPDATE public.wallets
     SET balance = 0, pending = 0, withdraw_cycle_started_at = NULL, updated_at = now();

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_wipe_all_data() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_wipe_all_data() TO authenticated;