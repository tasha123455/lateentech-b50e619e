
CREATE OR REPLACE FUNCTION public.delete_self_if_just_created()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  u_created timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT created_at INTO u_created FROM auth.users WHERE id = uid;
  IF u_created IS NULL THEN
    RETURN false;
  END IF;

  -- Only allow self-delete for accounts created in the last 5 minutes
  -- (protects existing users if this RPC is ever called by mistake).
  IF u_created < now() - interval '5 minutes' THEN
    RETURN false;
  END IF;

  DELETE FROM auth.users WHERE id = uid;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_self_if_just_created() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_self_if_just_created() TO authenticated;
