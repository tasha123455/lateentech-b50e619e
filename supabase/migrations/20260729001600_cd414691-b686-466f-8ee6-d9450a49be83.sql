CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can read review photos"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'review-photos');