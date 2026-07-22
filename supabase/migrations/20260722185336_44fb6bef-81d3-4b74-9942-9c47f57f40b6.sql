
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pause_requested boolean NOT NULL DEFAULT false;

-- When a business marks pause_requested = true, and the product later has zero
-- active marketer orders, auto-flip it to paused and clear the flag.
CREATE OR REPLACE FUNCTION public.orders_apply_pending_pauses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('confirmed','delivered','cancelled','rejected') THEN
    IF public.active_marketers_count(NEW.product_id) = 0 THEN
      PERFORM set_config('app.bypass_product_lock', 'on', true);
      UPDATE public.products
        SET status = 'paused', pause_requested = false, updated_at = now()
        WHERE id = NEW.product_id AND pause_requested = true;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS orders_apply_pending_pauses_trg ON public.orders;
CREATE TRIGGER orders_apply_pending_pauses_trg
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_apply_pending_pauses();
