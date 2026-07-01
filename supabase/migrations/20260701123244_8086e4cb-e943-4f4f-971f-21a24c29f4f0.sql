ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_bans WHERE email = lower(new.email)) THEN
    RAISE EXCEPTION 'This email is banned';
  END IF;

  v_role := COALESCE((new.raw_user_meta_data->>'role')::public.app_role, 'marketer');

  INSERT INTO public.profiles (id, full_name, phone, business_name, country)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'country'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  INSERT INTO public.wallets (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$function$;