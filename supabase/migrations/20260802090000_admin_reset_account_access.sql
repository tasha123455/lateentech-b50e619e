-- Cutting off the old way into an account.
--
-- Sign-in here is Google only, and what actually lets somebody in is not the
-- address on auth.users — it is the row in auth.identities holding the Google
-- account's id. Change the email and leave that row alone and the old Google
-- account still opens the account, which is worse than useless when the reason
-- for the change is that somebody else got into it.
--
-- Neither identities nor sessions can be reached through the admin API, and
-- PostgREST only exposes the public schema, so this is the one thing that has
-- to live in the database. It runs as its owner, which is why it may touch the
-- auth schema at all, and it is granted to service_role alone: the only caller
-- is the server route, which has already checked that the person asking is a
-- signed-in admin who typed the unlock code. There is deliberately no path to
-- it from a browser.

CREATE OR REPLACE FUNCTION public.admin_reset_account_access(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  gone_identities integer := 0;
  gone_sessions   integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'A user is required';
  END IF;

  /* Every linked provider goes. The account keeps its confirmed email, so the
     next Google sign-in that presents that address is linked afresh — which is
     the new owner, and only them. */
  DELETE FROM auth.identities WHERE user_id = _user_id;
  GET DIAGNOSTICS gone_identities = ROW_COUNT;

  /* Signs out every device at once. Refresh tokens hang off the session and go
     with it; the explicit delete afterwards covers older rows that were not
     linked to one. An access token already in a phone's memory stays valid
     until it expires, but it cannot be renewed, so the longest anybody keeps
     hold of the account is the remainder of that hour. */
  DELETE FROM auth.sessions WHERE user_id = _user_id;
  GET DIAGNOSTICS gone_sessions = ROW_COUNT;
  DELETE FROM auth.refresh_tokens WHERE user_id = _user_id::text;

  RETURN jsonb_build_object('identities', gone_identities, 'sessions', gone_sessions);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_account_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_account_access(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_account_access(uuid) TO service_role;
