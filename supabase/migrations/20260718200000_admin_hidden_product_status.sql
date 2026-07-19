-- The products.status check only ever allowed ('active','paused'), but
-- admin_set_product_status() (and the admin Products page "Hide" button)
-- also sets status to 'hidden'. That meant every attempt to hide a product
-- from the admin panel was rejected by this constraint. Widen it so hiding
-- actually works.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active','paused','hidden'));
