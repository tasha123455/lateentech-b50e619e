-- Enforce that product codes are unique across ALL businesses on the
-- platform (not just within one business's own products).
--
-- This is a PARTIAL unique index (WHERE deleted_at IS NULL) so that once a
-- product is deleted (soft-deleted via deleted_at), its code is freed up
-- and can be safely reused by a new product.
CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique_active
  ON public.products (code)
  WHERE deleted_at IS NULL;
