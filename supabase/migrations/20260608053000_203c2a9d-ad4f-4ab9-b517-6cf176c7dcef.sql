
CREATE OR REPLACE FUNCTION public.add_self_role(_role public.app_role, _business_name text DEFAULT NULL)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _role NOT IN ('marketer','business') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (uid, _role)
    ON CONFLICT (user_id, role) DO NOTHING;

  IF _role = 'business' AND _business_name IS NOT NULL AND length(trim(_business_name)) > 0 THEN
    UPDATE public.profiles
      SET business_name = COALESCE(business_name, _business_name)
      WHERE id = uid;
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (uid) ON CONFLICT DO NOTHING;

  RETURN _role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_self_role(public.app_role, text) TO authenticated;
