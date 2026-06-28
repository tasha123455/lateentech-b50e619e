
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS noted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
CREATE POLICY "Admins insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins view all notifications" ON public.notifications;
CREATE POLICY "Admins view all notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_mark_payout_paid(_payout_id uuid)
 RETURNS public.payouts
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

  INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (pay.user_id, 'payout_paid', 'Withdrawal successful',
            'Your withdrawal of ' || pay.amount::text || ' has been paid.');

  RETURN pay;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
 RETURNS public.payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'Note required'; END IF;

  UPDATE public.payouts
    SET admin_note = _note, noted_at = now(), status = 'failed'
    WHERE id = _payout_id
    RETURNING * INTO pay;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;

  INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (pay.user_id, 'payout_note', 'Withdrawal request needs attention', _note);

  RETURN pay;
END $function$;
