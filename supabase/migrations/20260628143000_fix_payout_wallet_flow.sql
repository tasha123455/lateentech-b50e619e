-- Keep payout payment aligned with the marketer's live wallet balance.
-- If the wallet grows while a withdrawal is pending, the admin pays the latest balance,
-- then the wallet is reset to zero and the next 30-day cycle starts from paid_at.
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
 RETURNS public.payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
  current_balance numeric := 0;
  paid_amount numeric := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT * INTO pay FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF pay.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  SELECT COALESCE(balance, 0) INTO current_balance
    FROM public.wallets
    WHERE user_id = pay.user_id
    FOR UPDATE;

  paid_amount := GREATEST(COALESCE(current_balance, 0), COALESCE(pay.amount, 0));

  INSERT INTO public.wallets (user_id, balance, pending)
    VALUES (pay.user_id, 0, 0)
    ON CONFLICT (user_id)
    DO UPDATE SET balance = 0,
                  pending = 0,
                  updated_at = now();

  UPDATE public.payouts
    SET amount = paid_amount,
        status = 'paid',
        paid_at = now()
    WHERE id = _payout_id
    RETURNING * INTO pay;

  INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (pay.user_id, 'payout_paid', 'Withdrawal successful',
            'Your withdrawal of ' || pay.amount::text || ' has been paid.');

  RETURN pay;
END $function$;
