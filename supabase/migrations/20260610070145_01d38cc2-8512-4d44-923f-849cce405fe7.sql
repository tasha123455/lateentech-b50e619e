
-- 1) Drop denormalized biz_phone column (was readable by all marketers)
ALTER TABLE public.products DROP COLUMN IF EXISTS biz_phone;

-- 2) Restrict marketer order updates to customer-facing fields only
CREATE OR REPLACE FUNCTION public.orders_restrict_marketer_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass restrictions
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Apply only when the marketer (owner) is updating their own order
  IF auth.uid() = OLD.marketer_id THEN
    IF NEW.business_id    IS DISTINCT FROM OLD.business_id
    OR NEW.marketer_id    IS DISTINCT FROM OLD.marketer_id
    OR NEW.product_id     IS DISTINCT FROM OLD.product_id
    OR NEW.commission     IS DISTINCT FROM OLD.commission
    OR NEW.unit_price     IS DISTINCT FROM OLD.unit_price
    OR NEW.platform_fee   IS DISTINCT FROM OLD.platform_fee
    OR NEW.shipping_fee   IS DISTINCT FROM OLD.shipping_fee
    OR NEW.delivery_fee   IS DISTINCT FROM OLD.delivery_fee
    OR NEW.status         IS DISTINCT FROM OLD.status
    OR NEW.confirmed_at   IS DISTINCT FROM OLD.confirmed_at
    OR NEW.delivered_at   IS DISTINCT FROM OLD.delivered_at
    OR NEW.reviewed_at    IS DISTINCT FROM OLD.reviewed_at
    OR NEW.admin_notes    IS DISTINCT FROM OLD.admin_notes
    OR NEW.receipt_url    IS DISTINCT FROM OLD.receipt_url
    OR NEW.receipt_uploaded_at IS DISTINCT FROM OLD.receipt_uploaded_at
    OR NEW.marketer_confirmed_at IS DISTINCT FROM OLD.marketer_confirmed_at
    THEN
      RAISE EXCEPTION 'Marketers cannot modify financial or status fields on orders';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_restrict_marketer_updates ON public.orders;
CREATE TRIGGER trg_orders_restrict_marketer_updates
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_restrict_marketer_updates();
