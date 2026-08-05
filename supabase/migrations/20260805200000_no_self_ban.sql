-- An admin cannot ban their own account.
--
-- Ban signs the account out and keeps it out until somebody presses Unban,
-- and the only account that can press it is the one that was just locked. On
-- a console with one master admin that is not a strong action, it is the end
-- of the console.
--
-- The button is gone from the master's own card, but a button is not a rule.
-- admin_ban_user has refused this since it was written; admin_set_user_banned
-- is the one the screen actually calls, and it never had the check. It does
-- now, so the answer is the same wherever the question is asked from.
--
-- Unban is left alone: lifting your own ban is not something you can be
-- signed in to do, and if some other path ever manages it, the account
-- coming back is not the outcome worth refusing.

CREATE OR REPLACE FUNCTION public.admin_set_user_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_can('adm-users') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _banned AND _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;
  UPDATE public.profiles
     SET banned_at = CASE WHEN _banned THEN now() ELSE NULL END
   WHERE id = _user_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
