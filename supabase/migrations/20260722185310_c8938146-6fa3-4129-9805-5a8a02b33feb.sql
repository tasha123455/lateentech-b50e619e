
-- 1) Public read policy for products (anon + any authenticated visitor)
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active' AND deleted_at IS NULL);

GRANT SELECT ON public.products TO anon;

-- 2) Vault-stored shared secret for the notifications->push webhook
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notifications_push_webhook_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'notifications_push_webhook_secret',
      'Shared secret for notifications INSERT -> /api/public/notifications/push server route'
    );
  END IF;
END $$;

-- 3) Trigger function: fire-and-forget pg_net POST to our public server route
CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
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
      url := 'https://project--73d4fe96-27fd-448d-9c26-2d6be279c925.lovable.app/api/public/notifications/push',
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
$fn$;

DROP TRIGGER IF EXISTS notifications_dispatch_push_trg ON public.notifications;
CREATE TRIGGER notifications_dispatch_push_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_dispatch_push();
