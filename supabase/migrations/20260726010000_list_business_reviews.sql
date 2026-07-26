-- The business dashboard currently builds its "reviews on my products" map
-- by scanning the last 50 rows of `notifications` (see business.script.js,
-- refreshBizNotifications). Once a business has more than 50 notifications
-- of ANY kind, older product_review notifications fall out of that window
-- and the review simply disappears from the dashboard — it was never really
-- gone, notifications was just never a durable place to read reviews from.
--
-- This function reads straight from product_reviews (the real source of
-- truth, already used by list_product_reviews for the public/marketer
-- side), scoped to the calling business's own products, with no window/limit.

CREATE OR REPLACE FUNCTION public.list_business_reviews()
RETURNS TABLE (
  id uuid,
  product_id uuid,
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
  SELECT r.id, r.product_id, r.marketer_id, r.rating, r.comment, r.created_at, r.updated_at,
         COALESCE(NULLIF(TRIM(p.full_name), ''), 'Marketer') AS author_name,
         r.photo_url,
         p.avatar_url AS avatar_path
  FROM public.product_reviews r
  JOIN public.products pr ON pr.id = r.product_id
  LEFT JOIN public.profiles p ON p.id = r.marketer_id
  WHERE pr.business_id = auth.uid()
    AND pr.deleted_at IS NULL
  ORDER BY r.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_business_reviews() TO authenticated;
