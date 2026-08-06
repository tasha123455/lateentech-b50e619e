-- Let the test accounts in. Run this once, by hand.
--
-- NOT a migration, and deliberately not in supabase/migrations: a migration
-- runs everywhere, forever, and this is a one-off for one database that has not
-- launched yet. Running it on a live platform would create a working account
-- whose password is published in this repository.
--
-- Three accounts already exist — the assistant made them with the site's own
-- public key, the same way anybody signing up makes one. They cannot sign in
-- because Supabase asks for an email address to be confirmed first, and these
-- use example.com, which the RFCs reserve so it can never receive mail. There
-- is no inbox to click a link in, so the confirmation is done here instead.
--
-- What this does, in order: confirms the three, throws away a fourth that was
-- only ever a test that the first step would work, and writes the admin's
-- invitation so it does not have to be typed into the Admins page. The invite
-- is claimed automatically the first time that account signs in.
--
-- BEFORE LAUNCH: delete all three. Their password is in this repository, and
-- this repository is public. `cd e2e && npm run accounts:remove` does it, or
-- delete them by hand — the last statement here shows which.

BEGIN;

-- 1. Confirm the three, so they may sign in.
UPDATE auth.users
   SET email_confirmed_at = COALESCE(email_confirmed_at, now())
 WHERE email IN (
   'wasla-e2e-marketer@example.com',
   'wasla-e2e-business@example.com',
   'wasla-e2e-admin@example.com'
 );

-- 2. The probe account was one throwaway test of whether signing up worked at
--    all. Nothing points at it.
DELETE FROM auth.users WHERE email = 'wasla-e2e-probe@example.com';

-- 3. The admin's invitation, every page, Libya only — so the country scoping
--    can actually be tested against a scoped admin rather than a master.
--    Same row the Admins page writes; the account claims it on first sign-in.
INSERT INTO public.admin_accounts (email, full_name, phone, markets, pages, active)
VALUES (
  'wasla-e2e-admin@example.com',
  'Wasla admin test',
  '+218910000000',
  ARRAY['LY'],
  ARRAY(SELECT id FROM public.admin_pages),
  true
)
ON CONFLICT (email) DO UPDATE
   SET active = true,
       markets = EXCLUDED.markets,
       pages = EXCLUDED.pages;

COMMIT;

-- What you should see: three rows confirmed, one admin invitation.
SELECT email,
       (email_confirmed_at IS NOT NULL) AS can_sign_in
  FROM auth.users
 WHERE email LIKE 'wasla-e2e-%'
 ORDER BY email;
