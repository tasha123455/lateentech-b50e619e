-- ============================================================================
-- Change: when a marketer uploads a receipt, stock should decrease on the
-- marketer's side (so nobody else can order the same units) but should NOT
-- decrease the business owner's stock count until the business owner
-- confirms the order.
--
-- Before this migration, uploading a receipt immediately decremented
-- products.qty directly -- the same number shown to both the marketer
-- ("available to order") and the business owner ("my stock"). So the
-- business owner's stock dropped the moment a receipt was uploaded, before
-- they had confirmed anything.
--
-- After this migration:
--   - products.qty keeps meaning "the business owner's real stock" and is
--     only decremented inside confirm_order(), i.e. once the business
--     owner actually confirms the order.
--   - A new products.reserved_qty column tracks units held by orders that
--     have a receipt uploaded but are not yet confirmed. products_marketer_
--     view subtracts this from qty to produce the number marketers see, so
--     two marketers still can't both order the last unit while it's
--     awaiting confirmation.
-- ============================================================================

-- 1) New column: units held by pending/approved (receipt uploaded, not yet
--    confirmed) orders.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reserved_qty integer NOT NULL DEFAULT 0;

-- 2) Backfill: orders that are currently held but not yet confirmed already
--    had their qty deducted straight from products.qty under the old
--    logic. Give that stock back to the business owner's count and
--    represent it as a hold instead, so marketers still see the same
--    availability they see today, but business owners immediately see
--    their true stock again.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, product_id, qty, size, color
    FROM public.orders
    WHERE stock_reserved = true
      AND status IN ('pending', 'approved')
  LOOP
    UPDATE public.products
       SET qty = qty + rec.qty,
           reserved_qty = reserved_qty + rec.qty
     WHERE id = rec.product_id;

    IF rec.size IS NOT NULL AND btrim(rec.size) <> '' THEN
      PERFORM public._adjust_variant_qty(rec.product_id, rec.size, rec.qty);
    END IF;
    IF rec.color IS NOT NULL AND btrim(rec.color) <> '' THEN
      PERFORM public._adjust_variant_qty(rec.product_id, rec.color, rec.qty);
    END IF;
  END LOOP;
END $$;

-- 3) Reservation trigger: hold units against reserved_qty (which only
--    affects marketer-visible availability) instead of decrementing the
--    business owner's real qty. Variant-item qty (size/color) is no longer
--    touched here either -- like the top-level qty, it's now only adjusted
--    at confirmation.
CREATE OR REPLACE FUNCTION public.orders_reserve_stock_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_id uuid;
BEGIN
  -- HOLD stock when a receipt is submitted (order enters admin-review queue).
  IF NEW.status = 'pending'
     AND NEW.receipt_url IS NOT NULL
     AND btrim(NEW.receipt_url) <> ''
     AND NOT COALESCE(NEW.stock_reserved, false) THEN

    IF NEW.size IS NOT NULL AND btrim(NEW.size) <> '' THEN
      PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.size, NEW.qty);
    END IF;
    IF NEW.color IS NOT NULL AND btrim(NEW.color) <> '' THEN
      PERFORM public._reserve_variant_qty_check(NEW.product_id, NEW.color, NEW.qty);
    END IF;

    -- Atomic check-and-hold against available stock (qty - reserved_qty):
    -- two racing submissions cannot both pass.
    UPDATE public.products
       SET reserved_qty = reserved_qty + NEW.qty
     WHERE id = NEW.product_id AND (qty - reserved_qty) >= NEW.qty
     RETURNING id INTO updated_id;

    IF updated_id IS NULL THEN
      RAISE EXCEPTION 'OUT_OF_STOCK: not enough product stock available' USING ERRCODE = 'P0001';
    END IF;

    NEW.stock_reserved := true;
    RETURN NEW;
  END IF;

  -- RELEASE the hold (rejected/cancelled before the business confirmed) or
  -- RESTORE real stock (marked failed/cancelled after the business had
  -- already confirmed).
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.stock_reserved, false) = true
     AND NEW.status IN ('rejected','cancelled')
     AND OLD.status NOT IN ('rejected','cancelled') THEN

    IF OLD.status = 'confirmed' THEN
      -- Real stock was already deducted at confirmation -- give it back.
      UPDATE public.products SET qty = qty + OLD.qty WHERE id = OLD.product_id;

      IF OLD.size IS NOT NULL AND btrim(OLD.size) <> '' THEN
        PERFORM public._adjust_variant_qty(OLD.product_id, OLD.size, OLD.qty);
      END IF;
      IF OLD.color IS NOT NULL AND btrim(OLD.color) <> '' THEN
        PERFORM public._adjust_variant_qty(OLD.product_id, OLD.color, OLD.qty);
      END IF;
    ELSE
      -- Still only held, never confirmed -- the business owner's stock was
      -- never touched, so just release the hold.
      UPDATE public.products SET reserved_qty = GREATEST(0, reserved_qty - OLD.qty) WHERE id = OLD.product_id;
    END IF;

    NEW.stock_reserved := false;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) confirm_order: this is now the moment the business owner's real stock
--    (and variant-item stock) is decremented, and the matching hold is
--    released. Sold/revenue bookkeeping is unchanged from before.
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  p public.products;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() <> o.business_id THEN RAISE EXCEPTION 'Only the product owner can confirm this order'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'Order has not been approved by admin yet'; END IF;

  SELECT * INTO p FROM public.products WHERE id = o.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p.qty < o.qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;

  UPDATE public.products
     SET qty = qty - o.qty,
         reserved_qty = GREATEST(0, reserved_qty - o.qty),
         sold = sold + o.qty,
         revenue = revenue + (o.unit_price * o.qty)
   WHERE id = o.product_id;

  IF o.size IS NOT NULL AND btrim(o.size) <> '' THEN
    PERFORM public._adjust_variant_qty(o.product_id, o.size, -o.qty);
  END IF;
  IF o.color IS NOT NULL AND btrim(o.color) <> '' THEN
    PERFORM public._adjust_variant_qty(o.product_id, o.color, -o.qty);
  END IF;

  UPDATE public.orders
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = _order_id
   RETURNING * INTO o;

  RETURN o;
END;
$$;

-- 5) Marketer-facing view: show AVAILABLE stock (real stock minus units
--    held by orders still awaiting business confirmation), so a product
--    marketers browse correctly reflects units that are already spoken
--    for. The business owner's own product list still reads straight from
--    public.products, so business owners keep seeing their true stock
--    count, unaffected by pending receipts.
CREATE OR REPLACE VIEW public.products_marketer_view AS
SELECT
  id, business_id, code, name, description, category,
  price, GREATEST(0, qty - reserved_qty) AS qty, currency,
  comm_pct, comm_fixed, comm_mode, platform_fee,
  variant_groups, sizes, colors, delivery, photos,
  status, biz_name, created_at, updated_at, deleted_at
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL AND (qty - reserved_qty) > 0;

ALTER VIEW public.products_marketer_view SET (security_invoker = true);
GRANT SELECT ON public.products_marketer_view TO authenticated;
