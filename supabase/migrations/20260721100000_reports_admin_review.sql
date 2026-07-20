-- =========================================
-- REPORTS: admin review workflow
-- Adds admin comment + resolution tracking to the reports table, and a
-- SECURITY DEFINER function that lets an admin mark a report as reviewed
-- while notifying the marketer who filed it (mirrors the existing
-- admin_reject_order_with_notes pattern).
-- =========================================

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id UUID, _comment TEXT)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
  p public.products;
  _photo text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _comment IS NULL OR length(trim(_comment)) = 0 THEN
    RAISE EXCEPTION 'Comment is required';
  END IF;

  UPDATE public.reports
    SET status = 'resolved',
        admin_comment = _comment,
        resolved_at = now(),
        reviewed_by = auth.uid()
    WHERE id = _report_id
    RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF r.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = r.product_id;
    IF FOUND AND p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN
      _photo := p.photos[1];
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      r.reporter_id,
      'report_reviewed',
      'Report reviewed',
      _comment,
      jsonb_build_object(
        'report_id', r.id,
        'report_type', r.report_type,
        'product_id', r.product_id,
        'product_name', p.name,
        'product_photo', _photo,
        'admin_comment', _comment
      )
    );

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text) TO authenticated;

ALTER TABLE public.reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel pr ON pr.prpubid = p.oid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
END $$;
