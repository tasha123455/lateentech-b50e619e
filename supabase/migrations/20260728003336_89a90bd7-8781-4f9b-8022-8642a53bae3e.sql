-- 1) Secure RPC to read the push webhook secret from the vault
CREATE OR REPLACE FUNCTION public.get_notifications_push_webhook_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notifications_push_webhook_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_notifications_push_webhook_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_notifications_push_webhook_secret() TO service_role;

-- 2) Point the trigger at the stable Lovable app domain so Authorization
-- header isn't dropped by the custom-domain redirect.
CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      url := 'https://lateentech.lovable.app/api/public/notifications/push',
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