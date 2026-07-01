CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_text text;
  v_role public.app_role;
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_bans WHERE email = lower(new.email)) THEN
    RAISE EXCEPTION 'This email is banned';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, business_name, country)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'country'
  );

  -- Only assign a role when signup metadata explicitly provides one
  -- (i.e. from the register form). Google sign-in without registration
  -- leaves the account role-less so the sign-in guard can reject it.
  v_role_text := new.raw_user_meta_data->>'role';
  IF v_role_text IN ('marketer','business') THEN
    v_role := v_role_text::public.app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
    INSERT INTO public.wallets (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;