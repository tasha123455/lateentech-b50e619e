-- admin_wipe_all_data() failed at runtime with "DELETE requires a WHERE clause".
--
-- Supabase ships the `safeupdate` extension, which rejects any DELETE or
-- UPDATE that has no WHERE clause — a guard against accidentally clearing a
-- whole table by hand. Every statement in this function is deliberately
-- table-wide, so each one now carries an explicit `WHERE true` to say so.
-- Nothing else about the function changes.

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

  -- Children before parents so the foreign keys stay satisfied.
  DELETE FROM public.product_reviews WHERE true;
  DELETE FROM public.favorites WHERE true;
  DELETE FROM public.orders WHERE true;
  DELETE FROM public.products WHERE true;
  DELETE FROM public.payouts WHERE true;
  DELETE FROM public.reports WHERE true;
  DELETE FROM public.notifications WHERE true;
  DELETE FROM public.account_deletion_requests WHERE true;
  DELETE FROM public.employee_payments WHERE true;
  DELETE FROM public.employees WHERE true;
  DELETE FROM public.email_send_log WHERE true;

  UPDATE public.wallets
     SET balance = 0, pending = 0, withdraw_cycle_started_at = NULL, updated_at = now()
   WHERE true;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_wipe_all_data() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_wipe_all_data() TO authenticated;
