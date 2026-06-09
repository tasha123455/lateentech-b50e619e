
CREATE TABLE public.email_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_bans TO authenticated;
GRANT ALL ON public.email_bans TO service_role;

ALTER TABLE public.email_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email bans" ON public.email_bans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert email bans" ON public.email_bans
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete email bans" ON public.email_bans
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ban_email(_email text, _reason text DEFAULT NULL)
RETURNS public.email_bans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.email_bans;
  uid uuid;
  norm text := lower(trim(_email));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF norm IS NULL OR norm = '' THEN
    RAISE EXCEPTION 'Email required';
  END IF;

  INSERT INTO public.email_bans (email, reason, banned_by)
    VALUES (norm, _reason, auth.uid())
    ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
    RETURNING * INTO b;

  -- Also delete any existing user with this email
  SELECT id INTO uid FROM auth.users WHERE lower(email) = norm LIMIT 1;
  IF uid IS NOT NULL AND uid <> auth.uid() THEN
    DELETE FROM auth.users WHERE id = uid;
  END IF;

  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unban_email(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  DELETE FROM public.email_bans WHERE email = lower(trim(_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_bans WHERE email = lower(new.email)) THEN
    RAISE EXCEPTION 'This email is banned';
  END IF;

  v_role := COALESCE((new.raw_user_meta_data->>'role')::public.app_role, 'marketer');

  INSERT INTO public.profiles (id, full_name, phone, business_name)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, v_role);
  INSERT INTO public.wallets (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;
