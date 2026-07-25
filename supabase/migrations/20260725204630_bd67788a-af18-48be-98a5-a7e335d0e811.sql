
-- Expose delivery + biz_name in the public product view so the public /p/:id
-- page can show shipping zones and merchant name.
CREATE OR REPLACE VIEW public.products_public_view WITH (security_invoker=true) AS
SELECT id, business_id, name, code, category, description, price, currency,
       photos, sizes, colors, variant_groups, qty, reserved_qty, status,
       deleted_at, delivery, biz_name, cover_focus_x, cover_focus_y
FROM public.products
WHERE status = 'active' AND deleted_at IS NULL;

GRANT SELECT ON public.products_public_view TO anon, authenticated;

-- Product reviews table (one per marketer per product)
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  marketer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, marketer_id)
);

GRANT SELECT ON public.product_reviews TO anon, authenticated;
GRANT INSERT, UPDATE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read reviews for active products"
  ON public.product_reviews FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id AND p.status = 'active' AND p.deleted_at IS NULL
  ));

CREATE POLICY "Marketers insert own review"
  ON public.product_reviews FOR INSERT TO authenticated
  WITH CHECK (marketer_id = auth.uid() AND public.has_role(auth.uid(), 'marketer'));

CREATE POLICY "Marketers update own review"
  ON public.product_reviews FOR UPDATE TO authenticated
  USING (marketer_id = auth.uid())
  WITH CHECK (marketer_id = auth.uid());

CREATE TRIGGER product_reviews_set_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read function that safely surfaces the reviewer's display name from
-- profiles without granting anon SELECT on profiles.
CREATE OR REPLACE FUNCTION public.list_product_reviews(_product_id uuid)
RETURNS TABLE (
  id uuid,
  marketer_id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.marketer_id, r.rating, r.comment, r.created_at, r.updated_at,
         COALESCE(NULLIF(TRIM(p.full_name), ''), 'Marketer') AS author_name
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.marketer_id
  WHERE r.product_id = _product_id
    AND EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = r.product_id
        AND pr.status = 'active'
        AND pr.deleted_at IS NULL
    )
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_product_reviews(uuid) TO anon, authenticated;
