-- Automatically process account deletion requests once scheduled_for has
-- elapsed. Until now, request_account_deletion() / admin_resolve_deletion_request()
-- would set status='scheduled' with a target date, but nothing ever acted on
-- that date — the account just sat there forever unless an admin manually
-- deleted it. This wires up a pg_cron job that calls the new
-- /lovable/account-deletions/process route every 15 minutes, which performs
-- the exact same auth.admin.deleteUser() the admin "Delete account" button
-- uses for any request whose grace period is up.

-- 1) Vault-stored shared secret so pg_cron can authenticate to our server
--    route, same pattern as notifications_push_webhook_secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'account_deletion_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'account_deletion_cron_secret',
      'Shared secret for the pg_cron job that triggers /lovable/account-deletions/process'
    );
  END IF;
END $$;

-- 2) Schedule the job every 15 minutes — deletion timing only needs to be
--    accurate to "the day", not the second, so this is plenty prompt.
--    Wrapped so a missing/disabled pg_cron extension warns instead of
--    failing the whole migration.
DO $$
BEGIN
  PERFORM cron.schedule(
    'process-account-deletions',
    '*/15 * * * *',
    $cron$
    DO $do$
    DECLARE
      _secret text;
    BEGIN
      SELECT decrypted_secret INTO _secret
        FROM vault.decrypted_secrets
        WHERE name = 'account_deletion_cron_secret'
        LIMIT 1;

      IF _secret IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://project--73d4fe96-27fd-448d-9c26-2d6be279c925.lovable.app/lovable/account-deletions/process',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || _secret
          ),
          body := '{}'::jsonb
        );
      END IF;
    END
    $do$;
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'process-account-deletions cron schedule failed: %', SQLERRM;
END $$;
