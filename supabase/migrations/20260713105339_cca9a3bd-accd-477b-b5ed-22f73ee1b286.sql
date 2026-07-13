
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders SET updated_at = created_at WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.orders_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON public.orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_touch_updated_at();

CREATE OR REPLACE FUNCTION public.active_marketers_count(_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT o.marketer_id)::int
  FROM public.orders o
  WHERE o.product_id = _product_id
    AND o.status IN ('pending', 'approved', 'confirmed');
$$;

CREATE OR REPLACE FUNCTION public.active_marketers_counts(_product_ids uuid[])
RETURNS TABLE(product_id uuid, active_marketers integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.product_id, COUNT(DISTINCT o.marketer_id)::int
  FROM public.orders o
  WHERE o.product_id = ANY(_product_ids)
    AND o.status IN ('pending', 'approved', 'confirmed')
  GROUP BY o.product_id;
$$;

REVOKE EXECUTE ON FUNCTION public.active_marketers_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.active_marketers_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.active_marketers_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_marketers_counts(uuid[]) TO authenticated;
