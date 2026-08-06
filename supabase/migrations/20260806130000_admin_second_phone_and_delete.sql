-- Admins: a second phone number, required details, and removal that removes.
--
-- Three changes, all on the same table.
--
-- A second number, because one is a single point of failure for the only way
-- of reaching somebody who can act on the platform.
--
-- The details stop being optional. An admin row with no name is a bare email
-- address in a list, and one with no number cannot be reached at all; the
-- console asks for them, and this is where asking is enforced. Scope is the
-- same argument from the other side: an admin with no pages can sign in and
-- see nothing, which reads as a broken account rather than a deliberate one,
-- and an admin scoped to an empty set of countries can see nothing either.
-- NULL markets is untouched — that is the "every country" answer, and it is
-- not the same as choosing none.
--
-- And removal deletes rather than deactivates. Suspending left the row in the
-- list wearing a Restore button, which is a different feature from the one
-- that was wanted: taking somebody off the list. admin_set_admin_active stays
-- for now — nothing calls it from the console any more, but it is the only
-- thing that can reinstate a row created before this, and dropping a function
-- is not this migration's job.

ALTER TABLE public.admin_accounts
  ADD COLUMN IF NOT EXISTS phone2 text;

COMMENT ON COLUMN public.admin_accounts.phone2 IS
  'Second contact number. Required alongside the first, so there is always a '
  'way through to somebody who can act on the platform.';

-- Adds an admin, or edits one. is_master is untouched on purpose: privilege
-- cannot be granted through the same door that edits a phone number.
CREATE OR REPLACE FUNCTION public.admin_upsert(
  _email text,
  _full_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _markets text[] DEFAULT NULL,
  _pages text[] DEFAULT '{}',
  _phone2 text DEFAULT NULL
)
RETURNS public.admin_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  clean_email  text := lower(trim(COALESCE(_email, '')));
  clean_name   text := NULLIF(trim(COALESCE(_full_name, '')), '');
  clean_phone  text := NULLIF(trim(COALESCE(_phone, '')), '');
  clean_phone2 text := NULLIF(trim(COALESCE(_phone2, '')), '');
  row_out public.admin_accounts;
  bad text;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;
  IF clean_email = '' OR clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;
  IF clean_name IS NULL THEN
    RAISE EXCEPTION 'A name is required';
  END IF;
  IF clean_phone IS NULL OR clean_phone2 IS NULL THEN
    RAISE EXCEPTION 'Both phone numbers are required';
  END IF;
  IF clean_phone = clean_phone2 THEN
    RAISE EXCEPTION 'The two phone numbers must be different';
  END IF;
  IF COALESCE(array_length(_pages, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one page';
  END IF;
  -- NULL means every country. An empty array means none, which is nobody.
  IF _markets IS NOT NULL AND COALESCE(array_length(_markets, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one country';
  END IF;

  -- Refuse page ids that do not exist, rather than storing a permission that
  -- silently never matches anything.
  SELECT string_agg(p, ', ') INTO bad
    FROM unnest(COALESCE(_pages, '{}')) AS p
   WHERE p NOT IN (SELECT id FROM public.admin_pages);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown page(s): %', bad;
  END IF;

  SELECT string_agg(m, ', ') INTO bad
    FROM unnest(COALESCE(_markets, '{}')) AS m
   WHERE m NOT IN (SELECT code FROM public.markets);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown market(s): %', bad;
  END IF;

  -- Editing a master through this function would let a master quietly narrow
  -- another master's scope, which is a demotion by another name.
  IF EXISTS (SELECT 1 FROM public.admin_accounts
              WHERE email = clean_email AND is_master
                AND user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'That account is a master admin';
  END IF;

  INSERT INTO public.admin_accounts (email, full_name, phone, phone2, markets, pages, created_by)
    VALUES (clean_email, clean_name, clean_phone, clean_phone2,
            _markets, COALESCE(_pages,'{}'), auth.uid())
    ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone     = EXCLUDED.phone,
          phone2    = EXCLUDED.phone2,
          markets   = EXCLUDED.markets,
          pages     = EXCLUDED.pages
    RETURNING * INTO row_out;

  RETURN row_out;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_upsert(text, text, text, text[], text[], text) TO authenticated;

-- Takes an admin off the list, for good.
--
-- The role row goes with it. Leaving that behind would be the worst of both:
-- gone from the list the master reads, still holding the door open.
CREATE OR REPLACE FUNCTION public.admin_delete(_email text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  clean_email text := lower(trim(COALESCE(_email, '')));
  hit public.admin_accounts;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;

  SELECT * INTO hit FROM public.admin_accounts WHERE email = clean_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such admin'; END IF;

  -- A master is removed by having master taken away first, deliberately, so
  -- that losing the last one cannot happen as a side effect of tidying a list.
  IF hit.is_master THEN
    RAISE EXCEPTION 'That account is a master admin';
  END IF;
  IF hit.user_id IS NOT NULL AND hit.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself';
  END IF;

  IF hit.user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = hit.user_id AND role = 'admin';
  END IF;

  DELETE FROM public.admin_accounts WHERE email = clean_email;
  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
