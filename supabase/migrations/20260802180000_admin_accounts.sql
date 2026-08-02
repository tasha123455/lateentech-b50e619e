-- Admins become people with a scope, instead of one flag that means everything.
--
-- Until now "admin" was a single row in user_roles: you either saw the whole
-- platform or none of it. This adds who each admin is, which markets their
-- data is drawn from, and which pages they may open.
--
-- The rule that matters: hiding a page in the app is not a permission. Every
-- admin action is gated in the database by admin_can(), so an admin who cannot
-- open the receipts page also cannot approve a receipt by calling the function
-- directly. The app's menu is a convenience on top of that, never the fence.

-- The pages an admin can be given. Kept as a table rather than an enum so a
-- new page is an insert, and so the app can render the list without a second
-- copy of it drifting out of sync.
CREATE TABLE IF NOT EXISTS public.admin_pages (
  id       text PRIMARY KEY,
  label    text NOT NULL,
  sort     integer NOT NULL DEFAULT 0
);

INSERT INTO public.admin_pages (id, label, sort) VALUES
  ('adm-home',      'Analytics', 10),
  -- Receipts and payouts are separate permissions even though they share a
  -- screen: "everything except the receipts" is a thing you may want to say.
  ('adm-receipts',  'Receipts',  20),
  ('adm-payouts',   'Payouts',   30),
  ('adm-users',     'Users',     40),
  ('adm-products',  'Products',  50),
  ('adm-employees', 'Employees', 60),
  ('adm-requests',  'Requests',  70),
  ('adm-notify',    'Notifications', 80)
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, sort = EXCLUDED.sort;

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  -- The email is the identity. An admin is invited before they have ever
  -- signed in, so the row exists first and user_id is filled in when they
  -- arrive; that is why the email and not the uuid is the key.
  email       text PRIMARY KEY,
  user_id     uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name   text,
  -- So the master admin can reach them. Not used for sign-in.
  phone       text,

  -- Sees every market and every page, and is the only one who can add or
  -- change admins. Deliberately not settable through admin_upsert — an admin
  -- must never be able to promote themselves.
  is_master   boolean NOT NULL DEFAULT false,

  -- Which markets this admin's data is drawn from. NULL means all of them,
  -- which is the "international" choice.
  markets     text[],

  -- Which pages they may open. Ignored for a master, who has all of them.
  pages       text[] NOT NULL DEFAULT '{}',

  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,

  CONSTRAINT admin_accounts_email_lower CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS admin_accounts_user_idx ON public.admin_accounts (user_id);

COMMENT ON TABLE public.admin_accounts IS
  'One row per admin. Scope lives here; enforcement lives in admin_can() and the functions that call it.';
COMMENT ON COLUMN public.admin_accounts.markets IS
  'Markets this admin may see. NULL means every market.';

-- Whoever is already an admin becomes a master admin.
--
-- They have unrestricted access today, so this grants nothing new — it just
-- writes down what is already true, and guarantees the platform is never left
-- with no one able to administer it.
INSERT INTO public.admin_accounts (email, user_id, full_name, is_master, markets, pages, active)
SELECT lower(u.email), u.id, COALESCE(p.full_name, 'Administrator'), true, NULL,
       ARRAY(SELECT id FROM public.admin_pages), true
  FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id
  LEFT JOIN public.profiles p ON p.id = r.user_id
 WHERE r.role = 'admin'
   AND u.email IS NOT NULL
ON CONFLICT (email) DO UPDATE
  SET is_master = true, user_id = EXCLUDED.user_id, active = true;

/* ---- the checks everything else is built on ------------------------------ */

-- SECURITY DEFINER throughout: these read admin_accounts, which an admin
-- cannot read directly, so the answer cannot be influenced by the caller.

CREATE OR REPLACE FUNCTION public.admin_is_master()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts
     WHERE user_id = auth.uid() AND is_master AND active
  );
$function$;

-- True when the signed-in admin may open this page.
--
-- A master passes everything. Anyone else needs an active row naming the page.
-- Note this does not consult user_roles: an account that was deactivated here
-- is refused even if its role row is still lying around.
CREATE OR REPLACE FUNCTION public.admin_can(_page text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts a
     WHERE a.user_id = auth.uid()
       AND a.active
       AND (a.is_master OR _page = ANY(a.pages))
  );
$function$;

-- The markets this admin may see, or NULL for all of them.
CREATE OR REPLACE FUNCTION public.admin_market_codes()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN a.is_master THEN NULL ELSE a.markets END
    FROM public.admin_accounts a
   WHERE a.user_id = auth.uid() AND a.active
   LIMIT 1;
$function$;

-- True when a row belonging to `_market` is inside this admin's scope.
-- NULL scope means every market, so an unrestricted admin passes everything.
CREATE OR REPLACE FUNCTION public.admin_can_market(_market text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.admin_accounts
                             WHERE user_id = auth.uid() AND active) THEN false
           WHEN public.admin_market_codes() IS NULL THEN true
           ELSE COALESCE(_market, 'LY') = ANY(public.admin_market_codes())
         END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_is_master() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_market_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can_market(text) TO authenticated;

/* ---- claiming an invite -------------------------------------------------- */

-- Binds the signed-in account to the invite left for its email.
--
-- The email is read from auth.users for the caller's own uid — never taken as
-- an argument — so nobody can claim an invite addressed to somebody else.
CREATE OR REPLACE FUNCTION public.admin_claim_invite()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  my_email text;
  hit public.admin_accounts;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid();
  IF my_email IS NULL THEN RETURN false; END IF;

  SELECT * INTO hit FROM public.admin_accounts
   WHERE email = my_email AND active
     AND (user_id IS NULL OR user_id = auth.uid());
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.admin_accounts SET user_id = auth.uid() WHERE email = my_email;

  -- The role row is what the rest of the platform still checks, so keep it in
  -- step. admin_can() is the permission; this is only the door.
  INSERT INTO public.user_roles (user_id, role)
    VALUES (auth.uid(), 'admin')
    ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_claim_invite() TO authenticated;

/* ---- managing admins: master only ---------------------------------------- */

CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS SETOF public.admin_accounts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_accounts ORDER BY is_master DESC, created_at;
END;
$function$;

-- Adds an admin, or edits one. is_master is untouched on purpose: privilege
-- cannot be granted through the same door that edits a phone number.
CREATE OR REPLACE FUNCTION public.admin_upsert(
  _email text,
  _full_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _markets text[] DEFAULT NULL,
  _pages text[] DEFAULT '{}'
)
RETURNS public.admin_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  clean_email text := lower(trim(COALESCE(_email, '')));
  row_out public.admin_accounts;
  bad text;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;
  IF clean_email = '' OR clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'A valid email is required';
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

  INSERT INTO public.admin_accounts (email, full_name, phone, markets, pages, created_by)
    VALUES (clean_email, NULLIF(trim(COALESCE(_full_name,'')),''),
            NULLIF(trim(COALESCE(_phone,'')),''), _markets, COALESCE(_pages,'{}'), auth.uid())
    ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone     = EXCLUDED.phone,
          markets   = EXCLUDED.markets,
          pages     = EXCLUDED.pages
    RETURNING * INTO row_out;

  RETURN row_out;
END;
$function$;

-- Suspends or restores an admin. Suspending revokes the role row too, so a
-- suspended admin loses the dashboard and not merely its contents.
CREATE OR REPLACE FUNCTION public.admin_set_admin_active(_email text, _active boolean)
RETURNS public.admin_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  clean_email text := lower(trim(COALESCE(_email, '')));
  row_out public.admin_accounts;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;

  SELECT * INTO row_out FROM public.admin_accounts WHERE email = clean_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such admin'; END IF;

  -- The platform must never be left with nobody who can administer it.
  IF row_out.is_master AND NOT _active
     AND (SELECT count(*) FROM public.admin_accounts WHERE is_master AND active) <= 1 THEN
    RAISE EXCEPTION 'That is the only master admin';
  END IF;

  UPDATE public.admin_accounts SET active = _active
   WHERE email = clean_email RETURNING * INTO row_out;

  IF NOT _active AND row_out.user_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = row_out.user_id AND role = 'admin';
  ELSIF _active AND row_out.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (row_out.user_id, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  RETURN row_out;
END;
$function$;

-- Master is granted on its own, never as a side effect of an edit.
CREATE OR REPLACE FUNCTION public.admin_set_master(_email text, _is_master boolean)
RETURNS public.admin_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  clean_email text := lower(trim(COALESCE(_email, '')));
  row_out public.admin_accounts;
BEGIN
  IF NOT public.admin_is_master() THEN
    RAISE EXCEPTION 'Master admin only';
  END IF;

  IF NOT _is_master
     AND (SELECT count(*) FROM public.admin_accounts WHERE is_master AND active) <= 1
     AND EXISTS (SELECT 1 FROM public.admin_accounts WHERE email = clean_email AND is_master) THEN
    RAISE EXCEPTION 'That is the only master admin';
  END IF;

  UPDATE public.admin_accounts SET is_master = _is_master
   WHERE email = clean_email RETURNING * INTO row_out;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such admin'; END IF;
  RETURN row_out;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert(text, text, text, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_admin_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_master(text, boolean) TO authenticated;

/* ---- the tables themselves stay shut ------------------------------------- */

-- No policies: with RLS on and nothing granted, the tables are unreachable
-- from a browser and only the SECURITY DEFINER functions above can read them.
-- An admin must not be able to read the permission list they are subject to,
-- and must certainly not be able to write it.
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_accounts FROM authenticated, anon;

ALTER TABLE public.admin_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin pages readable by admins" ON public.admin_pages;
CREATE POLICY "Admin pages readable by admins"
  ON public.admin_pages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
REVOKE INSERT, UPDATE, DELETE ON public.admin_pages FROM authenticated, anon;

NOTIFY pgrst, 'reload schema';
