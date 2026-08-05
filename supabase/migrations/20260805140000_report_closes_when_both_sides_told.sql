-- ============================================================================
-- A report stays open until both sides have been told about it.
--
-- Sending the review to the marketer closed the report in the same statement,
-- and the list only shows open ones — so the card vanished the moment the
-- first of the two notifications went out. The note to the business is sent
-- from inside that card, which meant the admin had to remember to send it
-- first, and had no way back if they didn't.
--
-- The two notifications are now recorded separately and the report closes when
-- the last one lands. Reports with no business attached still close on the
-- marketer's review alone: there is no second party to tell.
-- ============================================================================

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS marketer_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_notified_at timestamptz;

COMMENT ON COLUMN public.reports.marketer_notified_at IS
  'When the admin''s review was sent to the marketer who filed the report.';
COMMENT ON COLUMN public.reports.business_notified_at IS
  'When the admin''s note was sent to the business complained about. Stays NULL for reports with no business attached.';

-- Reports already closed were closed under the old rule, where resolving was
-- the only step. Backfilling both stamps keeps them out of the open list.
UPDATE public.reports
   SET marketer_notified_at = COALESCE(marketer_notified_at, resolved_at, created_at),
       business_notified_at = COALESCE(business_notified_at, resolved_at, created_at)
 WHERE status = 'resolved';

-- ---------------------------------------------------------------------------
-- Reviewing to the marketer
-- ---------------------------------------------------------------------------
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
  _done boolean;
BEGIN
  IF NOT public.admin_can('adm-requests') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _comment IS NULL OR length(trim(_comment)) = 0 THEN
    RAISE EXCEPTION 'Comment is required';
  END IF;

  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  IF r.marketer_notified_at IS NOT NULL THEN
    RAISE EXCEPTION 'The marketer has already been sent a review for this report';
  END IF;

  -- Closing is the second half of the job, not the first. A report with a
  -- business attached waits for that note; one without has nobody else to
  -- hear from.
  _done := (r.business_id IS NULL) OR (r.business_notified_at IS NOT NULL);

  UPDATE public.reports
    SET admin_comment = _comment,
        marketer_notified_at = now(),
        reviewed_by = auth.uid(),
        status = CASE WHEN _done THEN 'resolved' ELSE status END,
        resolved_at = CASE WHEN _done THEN now() ELSE resolved_at END
    WHERE id = _report_id
    RETURNING * INTO r;

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
        'report_message', r.message,
        'product_id', r.product_id,
        'product_name', p.name,
        'product_photo', _photo,
        'admin_comment', _comment
      )
    );

  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------
-- The note to the business
--
-- Its own function rather than the generic "send a user a notification",
-- because this one is part of closing a report: it has to record that the
-- business side is done and close the report when the marketer side already
-- is. Sent through the generic call, that bookkeeping could not happen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notify_report_business(_report_id UUID, _comment TEXT)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.reports;
  p public.products;
  _photo text;
  _done boolean;
BEGIN
  IF NOT public.admin_can('adm-requests') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  IF _comment IS NULL OR length(trim(_comment)) = 0 THEN
    RAISE EXCEPTION 'Comment is required';
  END IF;

  SELECT * INTO r FROM public.reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  IF r.business_id IS NULL THEN
    RAISE EXCEPTION 'This report has no business attached';
  END IF;
  IF r.business_notified_at IS NOT NULL THEN
    RAISE EXCEPTION 'The business has already been sent a note for this report';
  END IF;

  _done := (r.marketer_notified_at IS NOT NULL);

  UPDATE public.reports
    SET business_notified_at = now(),
        status = CASE WHEN _done THEN 'resolved' ELSE status END,
        resolved_at = CASE WHEN _done THEN now() ELSE resolved_at END
    WHERE id = _report_id
    RETURNING * INTO r;

  IF r.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = r.product_id;
    IF FOUND AND p.photos IS NOT NULL AND array_length(p.photos, 1) > 0 THEN
      _photo := p.photos[1];
    END IF;
  END IF;

  -- Its own kind, so the business dashboard can give it the wording and the
  -- warning mark a report deserves rather than showing it as a plain message
  -- from the admin.
  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      r.business_id,
      'product_reported',
      'A report about your product',
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

REVOKE ALL ON FUNCTION public.admin_notify_report_business(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notify_report_business(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
