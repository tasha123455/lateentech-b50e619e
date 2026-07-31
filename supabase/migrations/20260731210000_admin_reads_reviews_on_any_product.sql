-- list_product_reviews() only ever returned rows for products whose status is
-- 'active'. That is right for marketers and for the public product page, but it
-- meant an admin opening a hidden or paused product in the review sheet saw
-- "no reviews yet" — precisely the products whose reviews are worth reading,
-- since a product usually gets hidden or paused because something is wrong
-- with it.
--
-- Admins now see the reviews whatever the product's status. Soft-deleted
-- products stay excluded for everyone. Nothing else about the function changes.

CREATE OR REPLACE FUNCTION public.list_product_reviews(_product_id uuid)
RETURNS TABLE (
  id uuid,
  marketer_id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  photo_url text,
  avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.marketer_id, r.rating, r.comment, r.created_at, r.updated_at,
         COALESCE(NULLIF(TRIM(p.full_name), ''), 'Marketer') AS author_name,
         r.photo_url,
         p.avatar_url AS avatar_path
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.marketer_id
  WHERE r.product_id = _product_id
    AND EXISTS (
      SELECT 1 FROM public.products pr
      WHERE pr.id = r.product_id
        AND pr.deleted_at IS NULL
        AND (pr.status = 'active' OR public.has_role(auth.uid(), 'admin'))
    )
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_product_reviews(uuid) TO anon, authenticated;
