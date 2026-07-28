ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS device_id text;
UPDATE public.push_subscriptions SET device_id = gen_random_uuid()::text WHERE device_id IS NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN device_id SET NOT NULL;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_device_id_key UNIQUE (device_id);