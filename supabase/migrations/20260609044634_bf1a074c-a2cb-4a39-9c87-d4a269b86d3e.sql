
CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS public.email_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.email_bans;
  em text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot ban yourself';
  END IF;

  SELECT lower(email) INTO em FROM auth.users WHERE id = _user_id;
  IF em IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.email_bans (email, reason, banned_by)
    VALUES (em, _reason, auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
    RETURNING * INTO b;

  DELETE FROM auth.users WHERE id = _user_id;

  RETURN b;
END;
$$;
