-- ============================================================================
-- Admin "Paid" action on a payout request now requires a receipt photo.
--
-- Previously admin_mark_payout_paid(_payout_id) marked a payout paid the
-- instant the admin pressed "Paid" (after a plain confirm() dialog). This
-- adds a _receipt_url parameter: the admin must attach a photo of the
-- transfer receipt first (frontend uploads it via the existing
-- LateenAPI.uploadPhoto, same as the notification-photo flow), and that URL
-- is now required to mark the payout paid.
--
-- The receipt is stored on the payout row itself (new receipt_url column)
-- and included in the 'payout_paid' notification's data under both `photo`
-- and `receipt_url` keys -- `photo` is the same key the existing
-- admin_send_notification / admin_broadcast_notification notifications use,
-- so the marketer app's existing notification-photo rendering picks it up
-- with no extra logic needed.
-- ============================================================================

ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS receipt_url text;

DROP FUNCTION IF EXISTS public.admin_mark_payout_paid(uuid);

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid, _receipt_url text DEFAULT NULL)
RETURNS payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pay public.payouts;
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
      'Amount: ' || to_char(paid_amount, 'FM999999999990.00') || ' LYD' || E'\n' || 'Your withdrawal has been paid successfully.',
      jsonb_build_object('amount', paid_amount, 'photo', clean_receipt, 'receipt_url', clean_receipt)
    );

  RETURN pay;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_paid(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
