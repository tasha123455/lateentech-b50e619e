-- A product belongs to a market, and that is what sets its fee and currency.
--
-- The platform fee is "5 flat below 100, 5% above". The percentage survives a
-- change of currency — 5% is 5% of anything — but the 5 and the 100 do not.
-- They are dinar amounts. A product priced in euros was being charged a flat
-- fee of 5 and shown it as €5, roughly five times what was intended.
--
-- Fixing that needs to know which market a product is sold into, which is
-- what this column records. Currency stops being a free choice at the same
-- time: it is the market's, because the wallet that receives the money holds
-- one currency and the customer pays in one currency.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'LY'
    REFERENCES public.markets(code);

COMMENT ON COLUMN public.products.market IS
  'Market this product is sold into. Sets its currency and the fee rule used to price it.';

CREATE INDEX IF NOT EXISTS products_market_idx ON public.products (market);

-- Existing products take their market from the business that listed them.
-- Every business is Libyan today, so this confirms the default rather than
-- changing anything — but it is the correct rule, and running it now means
-- there is never a moment where the two disagree.
UPDATE public.products p
   SET market = COALESCE(pr.market, 'LY')
  FROM public.profiles pr
 WHERE pr.id = p.business_id
   AND p.market IS DISTINCT FROM COALESCE(pr.market, 'LY');

-- New products inherit the lister's market rather than the column default, so
-- a business in a second market cannot accidentally list into Libya.
--
-- Deliberately not a rewrite of an existing row's market: moving a product
-- between markets would change the currency its price is quoted in without
-- touching the number, and that is a decision for a person, not a trigger.
CREATE OR REPLACE FUNCTION public.products_set_market()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.market := COALESCE(
      (SELECT market FROM public.profiles WHERE id = NEW.business_id),
      'LY'
    );
  ELSE
    -- An update leaves it alone.
    NEW.market := OLD.market;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_set_market_trg ON public.products;
CREATE TRIGGER products_set_market_trg
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_set_market();

NOTIFY pgrst, 'reload schema';

-- An order records the market it was priced under.
--
-- Not looked up from the product at read time: the fee an order carries was
-- fixed when it was placed, and if a product ever moves markets the orders
-- already taken must keep reading in the currency they were quoted in.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'LY'
    REFERENCES public.markets(code);

COMMENT ON COLUMN public.orders.market IS
  'Market this order was priced under, snapshotted from the product when it was placed.';

UPDATE public.orders o
   SET market = COALESCE(p.market, 'LY')
  FROM public.products p
 WHERE p.id = o.product_id
   AND o.market IS DISTINCT FROM COALESCE(p.market, 'LY');

CREATE OR REPLACE FUNCTION public.orders_set_market()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.market := COALESCE(
      (SELECT market FROM public.products WHERE id = NEW.product_id),
      'LY'
    );
  ELSE
    NEW.market := OLD.market;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_set_market_trg ON public.orders;
CREATE TRIGGER orders_set_market_trg
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_market();

NOTIFY pgrst, 'reload schema';
