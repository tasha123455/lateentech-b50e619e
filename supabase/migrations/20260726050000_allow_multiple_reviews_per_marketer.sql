-- ============================================================================
-- 1. Allow a marketer to submit multiple reviews on the same product.
--    product_reviews previously had UNIQUE (product_id, marketer_id), which
--    forced the frontend to upsert (update-in-place) instead of inserting a
--    new review each time. Dropping it lets each submission become its own
--    row, and the frontend has been updated to insert instead of upsert.
-- ============================================================================
ALTER TABLE public.product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_product_id_marketer_id_key;

-- ============================================================================
-- 2. Re-assert notify_product_review() exactly as the gate-free version from
--    20260722200000_fix_review_and_payout_note_notifications.sql, in case an
--    older cached/gated definition is still live, and force PostgREST to
--    reload its schema cache immediately.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_product_review(
  _product_id uuid,
  _rating integer,
  _text text,
  _photo text DEFAULT NULL::text,
  _avatar text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _biz uuid;
  _pname text;
  _author text;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;
  IF NOT public.has_role(_uid, 'marketer') THEN
    RAISE EXCEPTION 'Only marketers can review products';
  END IF;

  SELECT business_id, name INTO _biz, _pname FROM public.products WHERE id = _product_id;
  IF _biz IS NULL THEN RETURN; END IF;

  SELECT COALESCE(full_name, business_name, 'Marketer') INTO _author FROM public.profiles WHERE id = _uid;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
  VALUES (
    _biz,
    'product_review',
    'New product review',
    COALESCE(_author,'Marketer') || ' rated ' || COALESCE(_pname,'your product') || ' ' || _rating || '★',
    jsonb_build_object(
      'product_id', _product_id,
      'product_name', _pname,
      'rating', _rating,
      'text', _text,
      'author', _author,
      'marketer_id', _uid,
      'photo', _photo,
      'avatar', _avatar
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_product_review(uuid,integer,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
