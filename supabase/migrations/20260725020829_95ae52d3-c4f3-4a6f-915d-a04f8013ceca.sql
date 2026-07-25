ALTER FUNCTION public.push_subscriptions_set_updated_at() SET search_path = public;
ALTER VIEW public.products_public_view SET (security_invoker = true);