-- =========================================
-- ACCOUNT DELETION REQUESTS
-- Lets a marketer or business owner request to delete their account.
-- If their wallet is empty, the request is auto-scheduled for permanent
-- deletion 14 days out (grace period, cancellable at any time). If their
-- wallet has a balance or pending amount, the request is held for admin
-- review (wallet_review) until the admin confirms the balance has been
-- settled with the user, at which point the 14-day clock starts.
-- =========================================

CREATE TABLE public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('marketer','business')),
  status TEXT NOT NULL DEFAULT 'wallet_review' CHECK (status IN ('wallet_review','scheduled','cancelled','rejected','completed')),
  wallet_balance NUMERIC NOT NULL DEFAULT 0,
  wallet_pending NUMERIC NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for TIMESTAMPTZ,
  admin_comment TEXT,
  resolved_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_adr_user ON public.account_deletion_requests(user_id);
CREATE INDEX idx_adr_status ON public.account_deletion_requests(status);

-- Only one active (unresolved) request per user at a time
CREATE UNIQUE INDEX idx_adr_one_active_per_user
  ON public.account_deletion_requests(user_id)
  WHERE status IN ('wallet_review','scheduled');

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- All writes happen through SECURITY DEFINER functions below.

CREATE OR REPLACE FUNCTION public.request_account_deletion(_role TEXT)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _bal NUMERIC;
  _pending NUMERIC;
  _row public.account_deletion_requests;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _role NOT IN ('marketer','business') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.account_deletion_requests
    WHERE user_id = _uid AND status IN ('wallet_review','scheduled')
  ) THEN
    RAISE EXCEPTION 'A deletion request is already in progress';
  END IF;

  SELECT balance, pending INTO _bal, _pending
  FROM public.wallets WHERE user_id = _uid;

  INSERT INTO public.account_deletion_requests (user_id, role, status, wallet_balance, wallet_pending, scheduled_for)
  VALUES (
    _uid, _role,
    CASE WHEN COALESCE(_bal,0) = 0 AND COALESCE(_pending,0) = 0 THEN 'scheduled' ELSE 'wallet_review' END,
    COALESCE(_bal,0), COALESCE(_pending,0),
    CASE WHEN COALESCE(_bal,0) = 0 AND COALESCE(_pending,0) = 0 THEN now() + interval '14 days' ELSE NULL END
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(_id UUID)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _row public.account_deletion_requests;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.account_deletion_requests
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = _id AND user_id = _uid AND status IN ('wallet_review','scheduled')
    RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already resolved';
  END IF;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_deletion_request(_id UUID, _action TEXT, _comment TEXT)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.account_deletion_requests;
  _sched TIMESTAMPTZ;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _action NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF _action = 'reject' AND (_comment IS NULL OR length(trim(_comment)) = 0) THEN
    RAISE EXCEPTION 'A reason is required to reject a request';
  END IF;

  IF _action = 'approve' THEN
    _sched := now() + interval '14 days';
    UPDATE public.account_deletion_requests
      SET status = 'scheduled', scheduled_for = _sched, admin_comment = _comment,
          resolved_at = now(), reviewed_by = auth.uid()
      WHERE id = _id AND status = 'wallet_review'
      RETURNING * INTO r;
  ELSE
    UPDATE public.account_deletion_requests
      SET status = 'rejected', admin_comment = _comment,
          resolved_at = now(), reviewed_by = auth.uid()
      WHERE id = _id AND status IN ('wallet_review','scheduled')
      RETURNING * INTO r;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already resolved';
  END IF;

  IF _action = 'approve' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        r.user_id, 'account_deletion_scheduled',
        'Account deletion scheduled',
        'Your account deletion has been approved.',
        jsonb_build_object('request_id', r.id, 'scheduled_for', r.scheduled_for, 'admin_comment', _comment)
      );
  ELSE
    INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        r.user_id, 'account_deletion_rejected',
        'Account deletion request declined',
        _comment,
        jsonb_build_object('request_id', r.id, 'admin_comment', _comment)
      );
  END IF;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_deletion_request(uuid, text, text) TO authenticated;

ALTER TABLE public.account_deletion_requests REPLICA IDENTITY FULL;

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
      AND c.relname = 'account_deletion_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests;
  END IF;
END $$;
