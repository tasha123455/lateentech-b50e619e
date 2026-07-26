-- Fixes account deletion never actually happening.
--
-- /lovable/account-deletions/process (see 20260726020000_account_deletion_cron.sql)
-- tries to confirm the pg_cron job's bearer token by querying
-- vault.decrypted_secrets directly through the app's Supabase client
-- (supabaseAdmin.schema("vault").from("decrypted_secrets")...). That client
-- talks to the project over the Data API (PostgREST), and PostgREST only
-- ever exposes the schemas listed in the project's exposed-schemas setting
-- (public by default) — "vault" is never one of them, by design, since it
-- holds secrets. So that query always errors, `expected` stays "", and the
-- route rejects every single request with 401 — confirmed live: pg_cron has
-- been calling the route successfully every 15 minutes and getting back
-- "Unauthorized" every time (see net._http_response). Nothing was wrong with
-- the schedule itself; the check that was supposed to let the real cron job
-- through was rejecting it too.
--
-- Fix: do the comparison inside the database, where vault access is normal
-- SQL (no PostgREST schema restriction applies), and only ever hand the app
-- a boolean back — the raw secret itself never has to leave the database.

CREATE OR REPLACE FUNCTION public.verify_account_deletion_cron_secret(_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'account_deletion_cron_secret'
      AND decrypted_secret = _secret
  );
$$;

-- supabaseAdmin (used by the route) calls this over the service-role key.
GRANT EXECUTE ON FUNCTION public.verify_account_deletion_cron_secret(text) TO service_role;
