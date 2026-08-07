-- OPTIONAL. Not applied, and not the fix for anything currently broken.
--
-- Read this before running it. It was written while chasing why push stopped
-- after the domain moved to wassla.online, on the theory that the two places
-- the database holds the site's address were still pointing at the old one.
-- That theory was wrong, and the record should say so:
--
--   · the migrations in this folder do contain stale addresses, but Lovable
--     had already rewritten the live ones;
--   · both live addresses answer — every one of the last 259 webhook calls
--     came back 200;
--   · push was not arriving because `push_subscriptions` was empty. A push
--     subscription belongs to one origin, so moving domain voided every one of
--     them, and there was nobody left to send to.
--
-- What is still true, and why this file is kept: the live addresses are
-- Lovable's own hostnames rather than the site's.
--
--   notifications_dispatch_push()  → https://id-preview--73d4fe96-….lovable.app
--   process-account-deletions cron → https://project--73d4fe96-….lovable.app
--
-- They work today. They are the preview and project URLs, not the address the
-- site actually answers on, and nothing in this repository puts them there —
-- which is why the migrations and the database disagree. Both calls are made
-- with pg_net and wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING`, so if
-- either address ever stops answering, notifications and account deletions
-- both stop silently, exactly as they would have if the theory above had been
-- right.
--
-- This puts the address in a table so it is stated once, visibly, and changed
-- without a migration or a deploy the next time the domain moves:
--
--   UPDATE public.app_config SET value = 'https://example.com' WHERE key = 'base_url';
--
-- Running it changes where two working webhooks post. That is a real change to
-- a live platform for a problem that has not happened yet, so it is the
-- owner's call, not something to slip in alongside a bug fix.

-- ---------------------------------------------------------------------------
-- 1. Somewhere to keep it
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_config IS
  'Small, non-secret settings the database itself needs — chiefly the site''s '
  'own address, which server-side webhooks post back to. Secrets belong in '
  'vault, not here.';

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Nobody signed in needs to read or write this; the functions below are
-- SECURITY DEFINER and read it regardless of policy. Deliberately left with no
-- policies at all, which under RLS means no ordinary role can touch it.
REVOKE ALL ON public.app_config FROM anon, authenticated;

INSERT INTO public.app_config (key, value, description)
VALUES ('base_url', 'https://wassla.online',
        'Where the site answers. No trailing slash. Used by the push webhook and the account-deletion cron.')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. One way to ask for it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_base_url()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  SELECT value INTO v FROM public.app_config WHERE key = 'base_url' LIMIT 1;
  -- Trailing slashes are the classic way to end up posting to `//api/...`.
  v := rtrim(btrim(COALESCE(v, '')), '/');
  IF v = '' THEN
    v := 'https://wassla.online';
  END IF;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.app_base_url() FROM public;
GRANT EXECUTE ON FUNCTION public.app_base_url() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The push webhook
--
-- Unchanged apart from where it posts. The secret lookup, the payload and the
-- swallow-and-warn are exactly as they were: a notification must still be
-- written even when the push cannot be sent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _secret
      FROM vault.decrypted_secrets
      WHERE name = 'notifications_push_webhook_secret'
      LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _secret := NULL;
  END;

  IF _secret IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := public.app_base_url() || '/api/public/notifications/push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _secret
      ),
      body := jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'kind', NEW.kind,
        'title', NEW.title,
        'body', NEW.body,
        'data', NEW.data
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notifications_dispatch_push failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The account-deletion job
--
-- Re-scheduled rather than edited: a cron job's command is a stored string, so
-- the only way to change where it posts is to schedule it again under the same
-- name, which replaces it.
-- ---------------------------------------------------------------------------
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
          url := public.app_base_url() || '/lovable/account-deletions/process',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Lovable-Context', 'cron',
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

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Checking it worked
--
-- pg_net keeps what came back. After this runs, cause a notification and look:
--
--   SELECT r.status_code, r.error_msg, q.url, r.created
--     FROM net._http_response r
--     JOIN net.http_request_queue q USING (id)
--    ORDER BY r.created DESC
--    LIMIT 10;
--
-- 201 is the push route accepting it. 404 or a connection error means the
-- address in app_config is wrong. Before this migration every row here was a
-- failure, which is why nothing arrived and nothing complained.
-- ---------------------------------------------------------------------------
