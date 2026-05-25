
CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
 RETURNS payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO pay FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF pay.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

  UPDATE public.wallets
    SET balance = 0,
        pending = 0,
        updated_at = now()
    WHERE user_id = pay.user_id;

  UPDATE public.payouts SET status = 'paid', paid_at = now()
    WHERE id = _payout_id RETURNING * INTO pay;
  RETURN pay;
END $function$;
