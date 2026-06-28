ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS withdraw_cycle_started_at timestamp with time zone;

UPDATE public.wallets
SET withdraw_cycle_started_at = now() - interval '30 days'
WHERE balance >= 20
  AND withdraw_cycle_started_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_payout_state()
RETURNS TABLE (
  balance numeric,
  pending_amount numeric,
  wallet_currency text,
  server_now timestamp with time zone,
  cycle_started_at timestamp with time zone,
  eligible_at timestamp with time zone,
  days_left integer,
  can_withdraw boolean,
  pending boolean,
  latest_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  w public.wallets;
  latest public.payouts;
  start_at timestamp with time zone;
  ready_at timestamp with time zone;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.wallets (user_id)
    VALUES (uid)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO w
    FROM public.wallets
    WHERE user_id = uid
    FOR UPDATE;

  IF COALESCE(w.balance, 0) >= 20 AND w.withdraw_cycle_started_at IS NULL THEN
    UPDATE public.wallets
      SET withdraw_cycle_started_at = now(),
          updated_at = now()
      WHERE user_id = uid
      RETURNING * INTO w;
  END IF;

  SELECT * INTO latest
    FROM public.payouts
    WHERE user_id = uid
    ORDER BY requested_at DESC
    LIMIT 1;

  start_at := w.withdraw_cycle_started_at;
  ready_at := CASE WHEN start_at IS NOT NULL THEN start_at + interval '30 days' ELSE NULL END;

  balance := COALESCE(w.balance, 0);
  pending_amount := COALESCE(w.pending, 0);
  wallet_currency := w.currency;
  server_now := now();
  cycle_started_at := start_at;
  eligible_at := ready_at;
  days_left := CASE
    WHEN COALESCE(w.balance, 0) < 20 OR ready_at IS NULL OR ready_at <= now() THEN 0
    ELSE CEIL(EXTRACT(EPOCH FROM (ready_at - now())) / 86400.0)::integer
  END;
  pending := COALESCE(latest.status = 'requested', false);
  latest_status := latest.status;
  can_withdraw := COALESCE(w.balance, 0) >= 20
    AND ready_at IS NOT NULL
    AND ready_at <= now()
    AND NOT pending;

  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_payout_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_state() TO service_role;

CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric)
RETURNS payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing public.payouts;
  pay public.payouts;
  w public.wallets;
  ready_at timestamp with time zone;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.wallets (user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO w
    FROM public.wallets
    WHERE user_id = auth.uid()
    FOR UPDATE;

  IF COALESCE(w.balance, 0) < 20 THEN
    RAISE EXCEPTION 'Minimum withdraw amount 20 LYD';
  END IF;

  IF w.withdraw_cycle_started_at IS NULL THEN
    UPDATE public.wallets
      SET withdraw_cycle_started_at = now(),
          updated_at = now()
      WHERE user_id = auth.uid()
      RETURNING * INTO w;
  END IF;

  ready_at := w.withdraw_cycle_started_at + interval '30 days';
  IF ready_at > now() THEN
    RAISE EXCEPTION 'Withdrawal is not available yet';
  END IF;

  SELECT * INTO existing
    FROM public.payouts
    WHERE user_id = auth.uid()
      AND status = 'requested'
    ORDER BY requested_at DESC
    LIMIT 1;

  IF FOUND THEN
    RETURN existing;
  END IF;

  INSERT INTO public.payouts (user_id, amount, status)
    VALUES (auth.uid(), GREATEST(COALESCE(w.balance, 0), COALESCE(_amount, 0)), 'requested')
    RETURNING * INTO pay;

  RETURN pay;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_payout(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
RETURNS payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
  current_balance numeric := 0;
  paid_amount numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO pay
    FROM public.payouts
    WHERE id = _payout_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;
  IF pay.status = 'paid' THEN
    RAISE EXCEPTION 'Already paid';
  END IF;

  SELECT COALESCE(balance, 0) INTO current_balance
    FROM public.wallets
    WHERE user_id = pay.user_id
    FOR UPDATE;

  paid_amount := GREATEST(COALESCE(current_balance, 0), COALESCE(pay.amount, 0));

  INSERT INTO public.wallets (user_id, balance, pending, withdraw_cycle_started_at)
    VALUES (pay.user_id, 0, 0, NULL)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = 0,
                  pending = 0,
                  withdraw_cycle_started_at = NULL,
                  updated_at = now();

  UPDATE public.payouts
    SET amount = paid_amount,
        status = 'paid',
        paid_at = now()
    WHERE id = _payout_id
    RETURNING * INTO pay;

  INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (pay.user_id, 'payout_paid', 'Withdrawal successful', 'Your withdrawal has been paid.');

  RETURN pay;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_approve_order(_order_id uuid)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  amt numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'Order is not pending'; END IF;

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

  RETURN o;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_approve_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_order(uuid) TO service_role;