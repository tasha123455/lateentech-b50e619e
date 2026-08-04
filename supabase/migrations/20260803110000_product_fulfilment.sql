-- How a product is fulfilled: reserved, or handed over on the spot.
--
-- The business owner picks one when listing the product — حجز (reserve) or
-- تسليم فوري (instant delivery) — and it follows the product everywhere a
-- marketer or an admin can see it.
--
-- Nullable on purpose. Products listed before this existed have not been
-- asked the question, and guessing an answer for them would put a claim on
-- someone else's listing that they never made. They show no badge until their
-- owner next edits them and chooses.
--
-- The check constraint is the point of the column: two values, and a product
-- cannot be both. The form enforces the same thing, but a form is a
-- suggestion — this is the rule.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fulfilment text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_fulfilment_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_fulfilment_check
      CHECK (fulfilment IS NULL OR fulfilment IN ('reserve', 'instant'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.fulfilment IS
  'reserve = the customer reserves and waits; instant = handed over immediately. NULL means the product predates the choice.';

NOTIFY pgrst, 'reload schema';
