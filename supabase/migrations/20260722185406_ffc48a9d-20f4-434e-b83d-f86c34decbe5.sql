
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT
  (id, business_id, name, code, category, description, price, currency,
   photos, sizes, colors, variant_groups, qty, reserved_qty,
   delivery, status, deleted_at, cover_focus_x, cover_focus_y,
   require_additional_phone, created_at, updated_at)
  ON public.products TO anon;
