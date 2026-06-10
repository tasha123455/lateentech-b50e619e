DO $$
DECLARE
  uid uuid;
  remaining int;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'rednbeats20044@gmail.com' LIMIT 1;
  IF uid IS NULL THEN RETURN; END IF;

  DELETE FROM public.user_roles WHERE user_id = uid AND role = 'marketer';

  SELECT count(*) INTO remaining FROM public.user_roles WHERE user_id = uid;
  IF remaining = 0 THEN
    DELETE FROM auth.users WHERE id = uid;
  END IF;
END $$;