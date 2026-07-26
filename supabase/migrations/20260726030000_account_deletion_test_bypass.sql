-- Give the designated test account (tashy8838@gmail.com) the same instant
-- bypass for account deletion that request_payout()/get_payout_state()
-- already give it for the 30-day wallet cycle (see migration
-- 20260717161754_...). Right now BOTH deletion paths always schedule
-- 14 days out with no exception, so there was no way to test the
-- "deletes on the scheduled day" behavior without actually waiting two
-- weeks. For this one test account, both paths now schedule
-- immediately (now()) instead of now() + 14 days:
--   1. request_account_deletion() -> the empty-wallet auto-schedule path
--   2. admin_resolve_deletion_request() -> the admin-approved path
-- Everyone else keeps the normal 14-day grace period unchanged.
--
-- Note: even with this bypass, actual deletion still only happens when
-- the pg_cron job from 20260726020000_account_deletion_cron.sql runs
-- (every 15 minutes) and calls /lovable/account-deletions/process. That
-- job only exists once this migration set has been deployed and run
-- against the live database — a local zip/branch that hasn't been
-- pushed to GitHub and synced in Lovable yet will not have it.

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
  _email TEXT;
  _bypass BOOLEAN := false;
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

  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  _bypass := (_email = 'tashy8838@gmail.com');

  SELECT balance, pending INTO _bal, _pending
  FROM public.wallets WHERE user_id = _uid;

  INSERT INTO public.account_deletion_requests (user_id, role, status, wallet_balance, wallet_pending, scheduled_for)
  VALUES (
    _uid, _role,
    CASE WHEN COALESCE(_bal,0) = 0 AND COALESCE(_pending,0) = 0 THEN 'scheduled' ELSE 'wallet_review' END,
    COALESCE(_bal,0), COALESCE(_pending,0),
    CASE WHEN COALESCE(_bal,0) = 0 AND COALESCE(_pending,0) = 0
      THEN (CASE WHEN _bypass THEN now() ELSE now() + interval '14 days' END)
      ELSE NULL
    END
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_deletion_request(_id UUID, _action TEXT, _comment TEXT)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.account_deletion_requests;
  _sched TIMESTAMPTZ;
  _target_email TEXT;
  _bypass BOOLEAN := false;
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
    SELECT lower(u.email) INTO _target_email
      FROM public.account_deletion_requests adr
      JOIN auth.users u ON u.id = adr.user_id
      WHERE adr.id = _id;
    _bypass := (_target_email = 'tashy8838@gmail.com');
    _sched := CASE WHEN _bypass THEN now() ELSE now() + interval '14 days' END;

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
