-- 1) Table to store each device/browser's push subscription.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Keep updated_at current on upsert (the client re-upserts on every login).
CREATE OR REPLACE FUNCTION public.push_subscriptions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at_trg ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at_trg
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.push_subscriptions_set_updated_at();

-- 2) Fix the notifications -> push webhook trigger: it was posting to
-- 'project--73d4fe96-...lovable.app', which matches neither real domain
-- (lateentech.lovable.app or the id-preview-- one), so every call failed
-- silently inside its own try/catch. Point it at the real production domain.
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
$fn$;

DROP TRIGGER IF EXISTS notifications_dispatch_push_trg ON public.notifications;
CREATE TRIGGER notifications_dispatch_push_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_dispatch_push();
