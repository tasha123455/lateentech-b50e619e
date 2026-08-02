-- The three money functions stop hardcoding Libya.
--
-- request_payout, get_payout_state and admin_mark_payout_paid each carried
-- Libya's answers inline: a 20 minimum, a 30-day cycle, and the literal string
-- ' LYD' in the notification a marketer receives. Those move to the caller's
-- market row.
--
-- Behaviour is unchanged today. The LY row seeded in the previous migration
-- holds 20, 30 and 'LYD', so every branch below evaluates exactly as it did.
-- The bodies are otherwise copied from the versions they replace —
-- 20260717161754 for the first two, 20260724050000 for the third — so this
-- diff is only the market lookup.

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
  mk public.markets;
  ready_at timestamp with time zone;
  my_email text;
  bypass_cycle boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid();
  bypass_cycle := (my_email = 'tashy8838@gmail.com');

  mk := public.market_for_user(auth.uid());

  INSERT INTO public.wallets (user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO w
    FROM public.wallets
    WHERE user_id = auth.uid()
    FOR UPDATE;

  IF COALESCE(w.balance, 0) < mk.min_withdraw THEN
    -- The figure and the currency both come from the market, so a marketer is
    -- never told a minimum in a currency they do not hold.
    --
    -- Trailing zeros are trimmed so a whole-number minimum still reads "20
    -- LYD" and not "20.00 LYD" — the wording this message had before it
    -- learned about markets, and what any translation of it will expect.
    RAISE EXCEPTION 'Minimum withdraw amount % %',
      regexp_replace(to_char(mk.min_withdraw, 'FM999999999990.00'), '\.?0+$', ''),
      mk.currency_code;
  END IF;

  IF NOT bypass_cycle THEN
    IF w.withdraw_cycle_started_at IS NULL THEN
      UPDATE public.wallets
        SET withdraw_cycle_started_at = now(),
            updated_at = now()
        WHERE user_id = auth.uid()
        RETURNING * INTO w;
    END IF;

    ready_at := w.withdraw_cycle_started_at + make_interval(days => mk.payout_cycle_days);
    IF ready_at > now() THEN
      RAISE EXCEPTION 'Withdrawal is not available yet';
    END IF;
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

CREATE OR REPLACE FUNCTION public.get_payout_state()
 RETURNS TABLE(balance numeric, pending_amount numeric, wallet_currency text, server_now timestamp with time zone, cycle_started_at timestamp with time zone, eligible_at timestamp with time zone, days_left integer, can_withdraw boolean, pending boolean, latest_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  w public.wallets;
  mk public.markets;
  latest public.payouts;
  start_at timestamp with time zone;
  ready_at timestamp with time zone;
  my_email text;
  bypass_cycle boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(email) INTO my_email FROM auth.users WHERE id = uid;
  bypass_cycle := (my_email = 'tashy8838@gmail.com');

  mk := public.market_for_user(uid);

  INSERT INTO public.wallets (user_id)
    VALUES (uid)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO w
    FROM public.wallets
    WHERE user_id = uid
    FOR UPDATE;

  IF COALESCE(w.balance, 0) >= mk.min_withdraw AND w.withdraw_cycle_started_at IS NULL AND NOT bypass_cycle THEN
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
  ready_at := CASE WHEN start_at IS NOT NULL
                   THEN start_at + make_interval(days => mk.payout_cycle_days)
                   ELSE NULL END;

  balance := COALESCE(w.balance, 0);
  pending_amount := COALESCE(w.pending, 0);
  wallet_currency := w.currency;
  server_now := now();
  cycle_started_at := start_at;
  eligible_at := CASE WHEN bypass_cycle THEN NULL ELSE ready_at END;
  pending := COALESCE(latest.status = 'requested', false);
  latest_status := latest.status;

  IF bypass_cycle THEN
    days_left := 0;
    can_withdraw := COALESCE(w.balance, 0) >= mk.min_withdraw AND NOT pending;
  ELSE
    days_left := CASE
      WHEN COALESCE(w.balance, 0) < mk.min_withdraw OR ready_at IS NULL OR ready_at <= now() THEN 0
      ELSE CEIL(EXTRACT(EPOCH FROM (ready_at - now())) / 86400.0)::integer
    END;
    can_withdraw := COALESCE(w.balance, 0) >= mk.min_withdraw
      AND ready_at IS NOT NULL
      AND ready_at <= now()
      AND NOT pending;
  END IF;

  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid, _receipt_url text DEFAULT NULL)
RETURNS payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
  mk public.markets;
  current_balance numeric := 0;
  paid_amount numeric := 0;
  clean_receipt text := NULLIF(trim(COALESCE(_receipt_url, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF clean_receipt IS NULL THEN
    RAISE EXCEPTION 'A receipt photo is required to mark this payout as paid';
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

  -- The marketer's market, not the admin's: the admin verifying the transfer
  -- may not be in the same country as the person being paid.
  mk := public.market_for_user(pay.user_id);

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
        paid_at = now(),
        receipt_url = clean_receipt
    WHERE id = _payout_id
    RETURNING * INTO pay;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      pay.user_id,
      'payout_paid',
      'Withdrawal Completed',
      'Amount: ' || to_char(paid_amount, 'FM999999999990.00') || ' ' || mk.currency_code
        || E'\n' || 'Your withdrawal has been paid successfully.',
      -- The currency travels with the payout so the app never has to assume
      -- which market the reader is in.
      jsonb_build_object('amount', paid_amount, 'currency', mk.currency_code,
                         'photo', clean_receipt, 'receipt_url', clean_receipt)
    );

  RETURN pay;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
