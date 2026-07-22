-- ============================================================================
-- Re-apply fixes for two notification bugs that were still occurring live:
--
-- 1. Reviews weren't reaching the business owner (notifications or product
--    card). notify_product_review() had an eligibility check that silently
--    threw for marketers without a confirmed/delivered order on that exact
--    product, which the review UI never enforced. Re-creating the
--    gate-free version here and reloading the schema cache.
--
-- 2. The withdrawal "needs attention" note wasn't tappable. admin_note_payout()
--    only stored a plain body string; the marketer app needs a jsonb `data`
--    payload with `admin_comment` to render the expandable card.
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

CREATE OR REPLACE FUNCTION public.admin_note_payout(_payout_id uuid, _note text)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.payouts;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN
    RAISE EXCEPTION 'Note required';
  END IF;

  UPDATE public.payouts
    SET admin_note = _note,
        noted_at = now(),
        status = 'failed'
    WHERE id = _payout_id
      AND status = 'requested'
    RETURNING * INTO pay;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found or already closed';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (
      pay.user_id,
      'payout_note',
      'Withdrawal request needs attention',
      _note,
      jsonb_build_object('payout_id', pay.id, 'amount', pay.amount, 'admin_comment', _note)
    );

  RETURN pay;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_note_payout(uuid, text) TO service_role;

-- Force PostgREST to pick up both function definitions immediately.
NOTIFY pgrst, 'reload schema';
