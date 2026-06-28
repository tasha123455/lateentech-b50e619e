ALTER TABLE public.payouts REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'payouts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payouts;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_payout(_amount numeric)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.payouts;
  pay public.payouts;
  wallet_balance numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(balance, 0)
    INTO wallet_balance
    FROM public.wallets
    WHERE user_id = auth.uid()
    FOR UPDATE;

  IF wallet_balance < 20 THEN
    RAISE EXCEPTION 'Minimum withdraw amount 20 LYD';
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
    VALUES (auth.uid(), GREATEST(wallet_balance, COALESCE(_amount, 0)), 'requested')
    RETURNING * INTO pay;

  RETURN pay;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    VALUES (pay.user_id, 'payout_paid', 'Withdrawal successful', 'Your withdrawal has been paid.');

  RETURN pay;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN
    RAISE EXCEPTION 'Note required';
  END IF;

  UPDATE public.payouts
    SET admin_note = _note,
        noted_at = now(),
        status = 'failed'
    WHERE id = _payout_id
      AND status = 'requested'
    RETURNING * INTO pay;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found or already closed';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (pay.user_id, 'payout_note', 'Withdrawal request needs attention', _note);

  RETURN pay;
END;
$$;