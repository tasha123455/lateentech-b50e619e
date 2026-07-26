-- 1. Add photo_url to product_reviews
ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Recreate list_product_reviews to include photo_url + avatar_path
DROP FUNCTION IF EXISTS public.list_product_reviews(uuid);
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
        AND pr.status = 'active'
        AND pr.deleted_at IS NULL
    )
  ORDER BY r.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_product_reviews(uuid) TO anon, authenticated;

-- 3. review-photos storage policies: marketers can insert under their own uid/ prefix
CREATE POLICY "Marketers can upload own review photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.has_role(auth.uid(), 'marketer'::public.app_role)
  );

CREATE POLICY "Anyone can read review photos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'review-photos');

-- 4. Public read on avatars bucket (existing upload policy untouched)
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');