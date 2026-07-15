CREATE OR REPLACE FUNCTION public.pending_active_orders_for_business()
RETURNS TABLE(marketer_id uuid, product_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.marketer_id, o.product_id, o.created_at
  FROM public.orders o
  WHERE o.business_id = auth.uid()
    AND o.status = 'pending'
    AND o.marketer_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.pending_active_orders_for_business() IS 'Minimal (marketer_id, product_id, created_at) stubs for the calling business''s own pending orders — the one status the "Businesses view orders" RLS policy hides from businesses. Lets the business dashboard fold pending orders into its "Active marketers" figures (per-product tile + wallet breakdown) without exposing full order/customer detail.';

GRANT EXECUTE ON FUNCTION public.pending_active_orders_for_business() TO authenticated;

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

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      pay.user_id,
      'payout_paid',
      'Withdrawal Completed',
      'Amount: ' || to_char(paid_amount, 'FM999999999990.00') || ' LYD' || E'\n' || 'Your withdrawal has been paid successfully.',
      jsonb_build_object('amount', paid_amount)
    );

  RETURN pay;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid) TO service_role;